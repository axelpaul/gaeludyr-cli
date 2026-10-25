import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import pkg from "../../package.json" with { type: "json" };
import {
	addToCart,
	clearCart,
	DEFAULT_MIN_SCORE,
	removeFromCart,
	replaceCart,
	setCoupon,
	viewCart,
} from "../lib/cart.ts";
import { shippingOptions } from "../lib/checkout.ts";
import { GaeludyrClient } from "../lib/client.ts";
import { listOrders, orderDetail } from "../lib/orders.ts";
import { searchProducts } from "../lib/typesense.ts";

export const WRITES_ENV = "GAELUDYR_MCP_ENABLE_WRITES";

export function writesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
	return env[WRITES_ENV] === "1";
}

type ToolResult = {
	content: { type: "text"; text: string }[];
	isError?: boolean;
};

const ok = (data: unknown): ToolResult => ({
	content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});

const fail = (e: unknown): ToolResult => ({
	isError: true,
	content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }],
});

/** Wrap a handler so thrown errors become MCP tool errors (never stdout noise). */
function run<A>(fn: (args: A) => Promise<unknown>): (args: A) => Promise<ToolResult> {
	return async (args) => {
		try {
			return ok(await fn(args));
		} catch (e) {
			return fail(e);
		}
	};
}

const confirm = z
	.literal(true)
	.describe("Must be true. Confirms you intend to change the local gaeludyr cart.");

const AUTH_NOTE = 'Requires a session from "gaeludyr login" (or GAELUDYR_KK_FE).';

export function createServer(opts: { enableWrites?: boolean } = {}): McpServer {
	const enableWrites = opts.enableWrites ?? writesEnabled();
	const server = new McpServer({ name: "gaeludyr", version: pkg.version });

	// ─── Public catalogue ──────────────────────────────────────────

	server.registerTool(
		"search",
		{
			title: "Search products",
			description:
				"Search the public Gæludýr.is product catalogue (Typesense). Provide a query and/or a category or brand slug. No login needed.",
			inputSchema: {
				query: z.string().trim().max(200).optional().describe("Search term, e.g. 'happy cat'"),
				category: z.string().trim().optional().describe("Category slug, e.g. 'kettir'"),
				brand: z.string().trim().optional().describe("Brand slug, e.g. 'happy-cat'"),
				in_stock: z.boolean().default(false).describe("Only products in stock"),
				page: z.number().int().min(1).default(1),
				per_page: z.number().int().min(1).max(100).default(20),
			},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		run(async ({ query, category, brand, in_stock, page, per_page }) => {
			if (!query && !category && !brand) {
				throw new Error("Provide query, category, or brand");
			}
			const products = await searchProducts({
				q: query,
				categorySlug: category,
				brandSlug: brand,
				inStock: in_stock,
				page,
				perPage: per_page,
			});
			return {
				query: query ?? "*",
				category,
				brand,
				page,
				count: products.length,
				products: products.map((p) => ({
					id: p.id,
					name: p.name,
					slug: p.slug,
					price: p.price,
					display_price: p.display_price,
					on_sale: p.on_sale,
					stock_status: p.stock_status,
					in_stock: p.is_in_stock,
					brands: p.brand_names,
					url: p.permalink,
				})),
			};
		}),
	);

	server.registerTool(
		"product",
		{
			title: "Product stock and price",
			description:
				"Stock status, price, sale price and max quantity for a product, by slug (from search results).",
			inputSchema: { slug: z.string().trim().min(1).describe("Product slug") },
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		run(({ slug }) => new GaeludyrClient().getProductCartData(slug)),
	);

	server.registerTool(
		"postcode",
		{
			title: "Postcode lookup",
			description: "Look up city/street info for an Icelandic postcode.",
			inputSchema: {
				code: z
					.string()
					.trim()
					.regex(/^\d{3}$/, "3-digit postcode")
					.describe("Postcode, e.g. '104'"),
			},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		run(({ code }) => new GaeludyrClient().postcodeLookup(code)),
	);

	server.registerTool(
		"dropp_locations",
		{
			title: "Dropp pickup locations",
			description: "List Dropp parcel pickup locations, optionally filtered by name/address.",
			inputSchema: {
				near: z.string().trim().optional().describe("Case-insensitive name/address substring"),
			},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		run(async ({ near }) => {
			const { locations } = await new GaeludyrClient().droppLocations();
			const needle = near?.toLowerCase();
			const filtered = needle
				? locations.filter(
						(l) =>
							l.name.toLowerCase().includes(needle) || l.address.toLowerCase().includes(needle),
					)
				: locations;
			return { count: filtered.length, locations: filtered };
		}),
	);

	// ─── Account (authenticated reads) ─────────────────────────────

	server.registerTool(
		"me",
		{
			title: "My profile",
			description: `The logged-in user's profile: name, addresses, kennitala, preferred shipping. ${AUTH_NOTE}`,
			inputSchema: {},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		run(() => new GaeludyrClient().getProfile()),
	);

	server.registerTool(
		"orders",
		{
			title: "My orders",
			description: `List the logged-in user's orders (paged). ${AUTH_NOTE}`,
			inputSchema: { page: z.number().int().min(1).default(1) },
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		run(async ({ page }) => {
			const orders = await listOrders(page);
			return { page, count: orders.length, orders };
		}),
	);

	server.registerTool(
		"order",
		{
			title: "Order detail",
			description: `Full detail for one of the user's orders (line items, totals, addresses). ${AUTH_NOTE}`,
			inputSchema: { id: z.number().int().positive().describe("Order ID from the orders tool") },
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		run(({ id }) => orderDetail(id)),
	);

	// ─── Cart & checkout reads ─────────────────────────────────────

	server.registerTool(
		"cart_view",
		{
			title: "View cart",
			description:
				"Show the local cart with server-computed line items and totals (gaeludyr.is computes totals; the cart itself is stored locally).",
			inputSchema: {},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		run(() => viewCart(true)),
	);

	server.registerTool(
		"checkout_shipping",
		{
			title: "Shipping options",
			description:
				"Compute available shipping methods and costs for the current cart to a destination. Read-only: does not place an order. Kennitala defaults to the logged-in profile's.",
			inputSchema: {
				postcode: z.string().trim().min(1).describe("Destination postcode, e.g. '104'"),
				street: z.string().trim().min(1).describe("Destination street address"),
				city: z.string().trim().min(1).describe("Destination city"),
				country: z.string().trim().length(2).default("IS"),
				ssn: z.string().trim().optional().describe("Kennitala (default: from profile)"),
			},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		run((args) => shippingOptions(args)),
	);

	server.registerTool(
		"payment_methods",
		{
			title: "Payment methods",
			description:
				"List the payment methods offered at checkout. Read-only; payment itself is not supported.",
			inputSchema: {},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		run(() => new GaeludyrClient().checkoutPayment()),
	);

	if (!enableWrites) return server;

	// ─── Cart mutations (opt-in) ───────────────────────────────────
	// The cart lives in the local cart file and is shared with the CLI.

	const writeAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };

	server.registerTool(
		"cart_add",
		{
			title: "Add to cart",
			description:
				"Add a product to the cart by numeric product ID, slug, or name (names are fuzzy-matched via search; the response includes the match and alternatives). Increments quantity if already present.",
			inputSchema: {
				product: z.string().trim().min(1).describe("Product ID (preferred), slug, or name"),
				qty: z.number().int().min(1).max(99).default(1),
				min_score: z
					.number()
					.int()
					.min(0)
					.default(DEFAULT_MIN_SCORE)
					.describe("Reject fuzzy matches scoring below this"),
				confirm,
			},
			annotations: writeAnnotations,
		},
		run(({ product, qty, min_score }) => addToCart(product, { qty, minScore: min_score })),
	);

	server.registerTool(
		"cart_remove",
		{
			title: "Remove from cart",
			description: "Remove a product (all of its quantity) from the cart by ID, slug, or name.",
			inputSchema: {
				product: z.string().trim().min(1).describe("Product ID (preferred), slug, or name"),
				min_score: z.number().int().min(0).default(DEFAULT_MIN_SCORE),
				confirm,
			},
			annotations: { ...writeAnnotations, destructiveHint: true },
		},
		run(({ product, min_score }) => removeFromCart(product, { minScore: min_score })),
	);

	server.registerTool(
		"cart_set",
		{
			title: "Replace cart",
			description:
				"Replace the entire cart with the given items in one call. Omit coupon to keep the current one; pass an empty string to remove it.",
			inputSchema: {
				items: z
					.array(
						z.object({
							id: z.number().int().positive().describe("Product ID"),
							qty: z.number().int().min(1).max(99).default(1),
						}),
					)
					.max(100),
				coupon: z.string().trim().optional(),
				confirm,
			},
			annotations: { ...writeAnnotations, destructiveHint: true },
		},
		run(({ items, coupon }) => replaceCart(items, coupon)),
	);

	server.registerTool(
		"cart_clear",
		{
			title: "Clear cart",
			description: "Empty the cart and remove any coupon.",
			inputSchema: { confirm },
			annotations: { ...writeAnnotations, destructiveHint: true },
		},
		run(() => clearCart()),
	);

	server.registerTool(
		"cart_coupon",
		{
			title: "Set coupon",
			description: "Apply a coupon code to the cart, or remove it with an empty string.",
			inputSchema: {
				code: z.string().trim().describe("Coupon code; empty string removes the coupon"),
				confirm,
			},
			annotations: writeAnnotations,
		},
		run(({ code }) => setCoupon(code || null)),
	);

	return server;
}

export async function serve(): Promise<void> {
	await createServer().connect(new StdioServerTransport());
}
