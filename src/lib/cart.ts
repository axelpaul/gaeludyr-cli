/**
 * Cart operations shared by the CLI and the MCP server.
 *
 * The gaeludyr.is cart is stateless on the server: POST /api/cart takes the
 * desired cart and returns enriched line items + totals. The canonical state
 * lives in the local cart file; every mutation rewrites it and re-POSTs it.
 * None of these functions print — callers decide how to present results.
 */
import { GaeludyrClient } from "./client.ts";
import { loadCart, saveCart } from "./config.ts";
import { scoreProduct, topMatches } from "./fuzzy.ts";
import type { CartItem, CartResponse, LocalCart, ProductDocument } from "./types.ts";
import { searchProducts } from "./typesense.ts";

export const DEFAULT_MIN_SCORE = 5;

export interface CartState {
	cart: LocalCart;
	server: CartResponse | null;
}

export interface MatchInfo {
	resolution: "id" | "fuzzy";
	query?: string;
	productId?: number;
	matched?: { id: string; name: string; slug: string; score: number };
	alternatives?: { id: string; name: string; slug: string; score: number }[];
}

interface MatchResult {
	product: ProductDocument;
	score: number;
	alternatives: { id: string; name: string; slug: string; score: number }[];
}

/** POST the cart for server-side totals, then persist it locally. */
async function compute(local: LocalCart): Promise<CartState> {
	const server = await new GaeludyrClient().postCart({ cart: local.items, coupon: local.coupon });
	local.updatedAt = Date.now();
	saveCart(local);
	return { cart: local, server };
}

export async function resolveProduct(query: string, minScore: number): Promise<MatchResult> {
	const candidates = await searchProducts({ q: query, perPage: 25 });
	if (candidates.length === 0) throw new Error(`No product matches "${query}"`);
	const matches = topMatches(candidates, (p) => scoreProduct(p, query), 5, 1);
	if (matches.length === 0) throw new Error(`No confident match for "${query}"`);
	const top = matches[0]!;
	if (top.score < minScore) {
		const alts = matches
			.slice(0, 3)
			.map((m) => `  [${m.score}] ${m.item.name} (id ${m.item.id}, ${m.item.slug})`)
			.join("\n");
		throw new Error(
			`Best match for "${query}" scored only ${top.score} (below min score ${minScore}).\nCandidates:\n${alts}`,
		);
	}
	return {
		product: top.item,
		score: top.score,
		alternatives: matches.slice(1).map((m) => ({
			id: m.item.id,
			name: m.item.name,
			slug: m.item.slug,
			score: m.score,
		})),
	};
}

/** Show the cart. With `refresh`, totals are recomputed by the server even if empty. */
export async function viewCart(refresh = true): Promise<CartState> {
	const local = loadCart();
	if (!refresh && local.items.length === 0) return { cart: local, server: null };
	return compute(local);
}

/** Add a product by numeric ID or fuzzy name/slug. Increments quantity if already present. */
export async function addToCart(
	query: string,
	opts: { qty?: number; minScore?: number } = {},
): Promise<CartState & { match: MatchInfo; label: string }> {
	if (!query) throw new Error("A product id, slug, or name is required");
	const qty = Math.max(1, opts.qty ?? 1);

	let productId: number;
	let label: string;
	let match: MatchInfo;
	if (/^\d+$/.test(query)) {
		productId = Number.parseInt(query, 10);
		label = `product #${productId}`;
		match = { resolution: "id", productId };
	} else {
		const result = await resolveProduct(query, opts.minScore ?? DEFAULT_MIN_SCORE);
		productId = Number.parseInt(result.product.id, 10);
		if (Number.isNaN(productId)) throw new Error(`Invalid product id: ${result.product.id}`);
		label = result.product.name;
		match = {
			resolution: "fuzzy",
			query,
			matched: {
				id: result.product.id,
				name: result.product.name,
				slug: result.product.slug,
				score: result.score,
			},
			alternatives: result.alternatives,
		};
	}

	const local = loadCart();
	const existing = local.items.find((i) => i.productId === productId);
	if (existing) {
		existing.quantity += qty;
		existing.timestamp = Date.now();
	} else {
		local.items.push({
			productId,
			quantity: qty,
			isVariation: false,
			timestamp: Date.now(),
			version: 2,
		});
	}
	return { ...(await compute(local)), match, label };
}

/** Remove a product (all quantity) by ID, slug, or fuzzy name. */
export async function removeFromCart(
	query: string,
	opts: { minScore?: number } = {},
): Promise<CartState & { removedId: number }> {
	if (!query) throw new Error("A product id, slug, or name is required");
	const local = loadCart();
	let removedId: number;
	const asId = /^\d+$/.test(query) ? Number.parseInt(query, 10) : Number.NaN;
	if (!Number.isNaN(asId) && local.items.some((i) => i.productId === asId)) {
		removedId = asId;
	} else {
		const result = await resolveProduct(query, opts.minScore ?? DEFAULT_MIN_SCORE);
		removedId = Number.parseInt(result.product.id, 10);
	}
	const before = local.items.length;
	local.items = local.items.filter((i) => i.productId !== removedId);
	if (local.items.length === before) throw new Error(`Product ${removedId} not in cart.`);
	return { ...(await compute(local)), removedId };
}

/** Empty the cart (and drop any coupon). */
export async function clearCart(): Promise<CartState> {
	const local: LocalCart = { items: [], coupon: null, updatedAt: Date.now() };
	saveCart(local);
	return compute(local);
}

/** Apply a coupon code, or remove it with null/empty. */
export async function setCoupon(code: string | null): Promise<CartState> {
	const local = loadCart();
	local.coupon = code && code.length > 0 ? code : null;
	return compute(local);
}

export interface SetInputItem {
	id?: number | string;
	productId?: number | string;
	qty?: number;
	quantity?: number;
	isVariation?: boolean;
}

/** Validate `[{id, qty}]` / `[{productId, quantity}]` input into cart items. */
export function normalizeItems(input: unknown): CartItem[] {
	if (!Array.isArray(input)) {
		throw new Error("Expected an array of items like [{id: 123, qty: 1}, ...]");
	}
	const now = Date.now();
	return input.map((raw, i) => {
		const obj = (raw ?? {}) as SetInputItem;
		const rawId = obj.id ?? obj.productId;
		if (rawId == null) throw new Error(`Item ${i}: missing id/productId`);
		const productId = typeof rawId === "string" ? Number.parseInt(rawId, 10) : rawId;
		if (!Number.isInteger(productId) || productId <= 0) {
			throw new Error(`Item ${i}: invalid productId (${rawId})`);
		}
		const qty = obj.qty ?? obj.quantity ?? 1;
		if (!Number.isInteger(qty) || qty < 1) {
			throw new Error(`Item ${i}: invalid quantity (${qty})`);
		}
		return {
			productId,
			quantity: qty,
			isVariation: obj.isVariation ?? false,
			timestamp: now,
			version: 2,
		};
	});
}

/** Replace the whole cart. `coupon` undefined keeps the current coupon; null removes it. */
export async function replaceCart(
	input: unknown,
	coupon?: string | null,
): Promise<CartState & { count: number }> {
	const items = normalizeItems(input);
	const local: LocalCart = {
		items,
		coupon: coupon !== undefined ? coupon || null : loadCart().coupon,
		updatedAt: Date.now(),
	};
	saveCart(local);
	return { ...(await compute(local)), count: items.length };
}
