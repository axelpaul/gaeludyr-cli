#!/usr/bin/env bun

import { cartAdd, cartClear, cartCoupon, cartRemove, cartSet, cartShow } from "./commands/cart.ts";
import { checkoutPayment, checkoutShipping } from "./commands/checkout.ts";
import { dropp } from "./commands/dropp.ts";
import { login } from "./commands/login.ts";
import { logout } from "./commands/logout.ts";
import { me } from "./commands/me.ts";
import { orderDetail, ordersList } from "./commands/orders.ts";
import { postcode } from "./commands/postcode.ts";
import { product } from "./commands/product.ts";
import { search } from "./commands/search.ts";
import { jsonMode, output, outputError } from "./lib/output.ts";
import type { AuthType } from "./lib/types.ts";

// ─── Arg helpers ────────────────────────────────────────────────

const argv = process.argv.slice(2);

function getFlag(name: string): string | undefined {
	const i = argv.indexOf(`--${name}`);
	if (i >= 0 && i + 1 < argv.length) {
		const next = argv[i + 1];
		if (next && !next.startsWith("--")) return next;
	}
	return undefined;
}

function hasFlag(name: string): boolean {
	return argv.includes(`--${name}`);
}

const positional = argv.filter((a, i) => {
	if (a.startsWith("--")) return false;
	const prev = argv[i - 1];
	if (prev?.startsWith("--") && !["--json", "--pretty"].includes(prev)) return false;
	return true;
});

// ─── Help / schema ──────────────────────────────────────────────

const COMMANDS = [
	{
		name: "login",
		description: "Log in via Audkenni (Sim by default). Caches kk_fe session cookie.",
		args: [
			{
				name: "--phone",
				type: "string",
				required: true,
				description: "7-digit Icelandic mobile (no country code)",
			},
			{
				name: "--ssn",
				type: "string",
				required: false,
				description: "Kennitala (required for App/Card auth types)",
			},
			{
				name: "--type",
				type: "string",
				enum: ["Sim", "App", "Card"],
				default: "Sim",
				required: false,
				description: "Audkenni auth type",
			},
		],
	},
	{ name: "logout", description: "Clear the cached session.", args: [] },
	{ name: "me", description: "Show authenticated user's profile.", args: [] },
	{
		name: "search",
		description: "Search the product catalog via Typesense.",
		args: [
			{
				name: "<query>",
				type: "string",
				positional: true,
				required: false,
				description: "Search term (or omit and use --category/--brand)",
			},
			{
				name: "--category",
				type: "string",
				required: false,
				description: "Category slug (e.g. kettir)",
			},
			{
				name: "--brand",
				type: "string",
				required: false,
				description: "Brand slug (e.g. happy-cat)",
			},
			{
				name: "--in-stock",
				type: "boolean",
				required: false,
				description: "Only in-stock products",
			},
			{
				name: "--page",
				type: "integer",
				default: 1,
				required: false,
				description: "Result page",
			},
			{
				name: "--per-page",
				type: "integer",
				default: 20,
				required: false,
				description: "Results per page",
			},
		],
	},
	{
		name: "product",
		description: "Show stock and pricing for a product by slug.",
		args: [
			{
				name: "<slug>",
				type: "string",
				positional: true,
				required: true,
				description: "Product slug",
			},
		],
	},
	{
		name: "cart",
		description: "Cart subcommands: show | add | remove | set | clear | coupon",
		args: [
			{
				name: "<subcommand>",
				type: "string",
				positional: true,
				enum: ["show", "add", "remove", "set", "clear", "coupon"],
				default: "show",
				required: false,
				description: "Subcommand",
			},
			{
				name: "<arg>",
				type: "string",
				positional: true,
				required: false,
				description: "For add/remove: product id|slug|name. For coupon: code (empty to clear).",
			},
			{
				name: "--qty",
				type: "integer",
				default: 1,
				required: false,
				description: "Quantity (for 'add')",
			},
			{
				name: "--min-score",
				type: "integer",
				default: 5,
				required: false,
				description: "Minimum fuzzy-match score to accept (raise to be stricter)",
			},
			{
				name: "--items",
				type: "string",
				required: false,
				description:
					"JSON array for 'cart set' (e.g. '[{\"id\":46685,\"qty\":2}]'). Or pipe JSON via stdin.",
			},
			{
				name: "--coupon",
				type: "string",
				required: false,
				description: "Coupon code for 'cart set' (optional)",
			},
		],
	},
	{
		name: "orders",
		description: "List authenticated user's orders.",
		args: [
			{
				name: "--page",
				type: "integer",
				default: 1,
				required: false,
				description: "Page number",
			},
		],
	},
	{
		name: "order",
		description: "Show details for a specific order (line items, totals, etc.).",
		args: [
			{
				name: "<id>",
				type: "integer",
				positional: true,
				required: true,
				description: "Order ID",
			},
		],
	},
	{
		name: "checkout",
		description: "Checkout subcommands: shipping | payment",
		args: [
			{
				name: "<subcommand>",
				type: "string",
				positional: true,
				enum: ["shipping", "payment"],
				required: true,
				description: "Subcommand",
			},
			{
				name: "--postcode",
				type: "string",
				required: false,
				description: "Destination postcode (for shipping)",
			},
			{
				name: "--street",
				type: "string",
				required: false,
				description: "Destination street address",
			},
			{
				name: "--city",
				type: "string",
				required: false,
				description: "Destination city",
			},
			{
				name: "--country",
				type: "string",
				default: "IS",
				required: false,
				description: "Destination country",
			},
			{
				name: "--ssn",
				type: "string",
				required: false,
				description: "Kennitala (default: from profile)",
			},
		],
	},
	{
		name: "postcode",
		description: "Look up city/street info for a postcode.",
		args: [
			{
				name: "<code>",
				type: "string",
				positional: true,
				required: true,
				description: "Icelandic postcode (e.g. 104)",
			},
		],
	},
	{
		name: "dropp",
		description: "List Dropp parcel pickup locations.",
		args: [
			{
				name: "--near",
				type: "string",
				required: false,
				description: "Filter by name/address substring",
			},
		],
	},
] as const;

function showHelp(): void {
	if (jsonMode) {
		output({ name: "gaeludyr-cli", version: "0.1.0", commands: COMMANDS });
		return;
	}
	console.log(`gaeludyr-cli v0.1.0 — CLI for gaeludyr.is

Usage: gaeludyr <command> [options]

Commands:
  login           Log in via Audkenni Sim (BFF-proxied)
  logout          Clear the cached session
  me              Show authenticated profile
  search          Search the product catalog
  product <slug>  Show product stock/pricing
  cart            Cart: show | add | remove | set | clear | coupon
  orders          List orders
  order <id>      Show order detail
  checkout        Checkout: shipping | payment
  postcode <NNN>  Look up postcode
  dropp           List Dropp pickup locations

Global flags:
  --json          Force JSON output (default when stdout is piped)
  --pretty        Force human-readable output
  --help, -h      Show this help

Examples:
  gaeludyr login --phone <7-digit-mobile>
  gaeludyr search "happy cat"
  gaeludyr cart add 46685 --qty 2                       # by product number
  gaeludyr cart add "happy cat lachs 10kg" --qty 2      # or by fuzzy name
  gaeludyr cart set --items '[{"id":46685,"qty":2}]'    # replace whole cart in one shot
  echo '[{"id":46685,"qty":2}]' | gaeludyr cart set     # or from stdin
  gaeludyr orders --page 1
  gaeludyr order 62331
  gaeludyr checkout shipping --postcode 104 --street "<street address>" --city Reykjavík`);
}

// ─── Router ─────────────────────────────────────────────────────

const command = positional[0];
const json = hasFlag("json") || (!process.stdout.isTTY && !hasFlag("pretty"));

async function main(): Promise<void> {
	if (!command || command === "help" || hasFlag("help") || argv.includes("-h")) {
		showHelp();
		return;
	}

	switch (command) {
		case "login": {
			const phone = getFlag("phone");
			if (!phone) outputError("--phone is required");
			const type = (getFlag("type") ?? "Sim") as AuthType;
			await login({ phone, ssn: getFlag("ssn") ?? "", type, json });
			break;
		}
		case "logout":
			logout({ json });
			break;
		case "me":
			await me({ json });
			break;
		case "search": {
			const q = positional[1];
			await search({
				q,
				categorySlug: getFlag("category"),
				brandSlug: getFlag("brand"),
				inStock: hasFlag("in-stock"),
				page: getFlag("page") ? Number.parseInt(getFlag("page")!, 10) : undefined,
				perPage: getFlag("per-page") ? Number.parseInt(getFlag("per-page")!, 10) : undefined,
				json,
			});
			break;
		}
		case "product":
			await product(positional[1] ?? "", { json });
			break;
		case "cart": {
			const sub = positional[1] ?? "show";
			const minScore = getFlag("min-score")
				? Number.parseInt(getFlag("min-score")!, 10)
				: undefined;
			switch (sub) {
				case "show":
					await cartShow({ json, refresh: true });
					break;
				case "add":
					await cartAdd(positional[2] ?? "", {
						qty: getFlag("qty") ? Number.parseInt(getFlag("qty")!, 10) : 1,
						minScore,
						json,
					});
					break;
				case "remove":
				case "rm":
					await cartRemove(positional[2] ?? "", { json, minScore });
					break;
				case "set":
					await cartSet(getFlag("items") ?? null, {
						json,
						coupon: getFlag("coupon"),
					});
					break;
				case "clear":
					await cartClear({ json });
					break;
				case "coupon":
					await cartCoupon(positional[2] ?? null, { json });
					break;
				default:
					outputError(`Unknown cart subcommand: ${sub}`);
			}
			break;
		}
		case "orders":
			await ordersList({
				page: getFlag("page") ? Number.parseInt(getFlag("page")!, 10) : undefined,
				json,
			});
			break;
		case "order":
			await orderDetail(positional[1] ?? "", { json });
			break;
		case "checkout": {
			const sub = positional[1];
			if (sub === "shipping") {
				await checkoutShipping({
					postcode: getFlag("postcode") ?? "",
					street: getFlag("street") ?? "",
					city: getFlag("city") ?? "",
					country: getFlag("country"),
					ssn: getFlag("ssn"),
					json,
				});
			} else if (sub === "payment") {
				await checkoutPayment({ json });
			} else {
				outputError("Usage: gaeludyr checkout (shipping|payment)");
			}
			break;
		}
		case "postcode":
			await postcode(positional[1] ?? "", { json });
			break;
		case "dropp":
			await dropp({ json, near: getFlag("near") });
			break;
		default:
			outputError(`Unknown command: ${command}. Run 'gaeludyr help'.`);
	}
}

main().catch((err) => {
	const msg = err instanceof Error ? err.message : String(err);
	outputError(msg);
});
