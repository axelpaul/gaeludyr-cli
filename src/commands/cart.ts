import { GaeludyrClient } from "../lib/client.ts";
import { loadCart, saveCart } from "../lib/config.ts";
import { scoreProduct, topMatches } from "../lib/fuzzy.ts";
import { formatPrice, log, output, outputError } from "../lib/output.ts";
import type { CartItem, CartResponse, LocalCart, ProductDocument } from "../lib/types.ts";
import { searchProducts } from "../lib/typesense.ts";

const DEFAULT_MIN_SCORE = 5;

interface MatchResult {
	product: ProductDocument;
	score: number;
	alternatives: { id: string; name: string; slug: string; score: number }[];
}

async function pushAndShow(
	local: LocalCart,
	jsonOut: boolean,
	extra: Record<string, unknown> = {},
): Promise<CartResponse> {
	const client = new GaeludyrClient();
	const resp = await client.postCart({ cart: local.items, coupon: local.coupon });
	local.updatedAt = Date.now();
	saveCart(local);
	if (jsonOut) output({ cart: local, server: resp, ...extra });
	else printCart(resp);
	return resp;
}

function printCart(resp: CartResponse): void {
	if (!resp.line_items || resp.line_items.length === 0) {
		log("Cart is empty.");
		return;
	}
	for (const item of resp.line_items) {
		const name = item.name ?? `Product ${item.product_id}`;
		log(`  ${item.quantity}× ${name} — ${formatPrice(item.total ?? item.subtotal ?? item.price)}`);
	}
	log("");
	log(`Subtotal:   ${formatPrice(resp.subtotal)}`);
	if (Number(resp.total_discount) > 0) log(`Discount:  -${formatPrice(resp.total_discount)}`);
	log(`Tax:        ${formatPrice(resp.total_tax)}`);
	log(`Total:      ${formatPrice(resp.total)}`);
}

async function resolveProduct(query: string, minScore: number): Promise<MatchResult> {
	const candidates = await searchProducts({ q: query, perPage: 25 });
	if (candidates.length === 0) throw new Error(`No product matches "${query}"`);
	const matches = topMatches(candidates, (p) => scoreProduct(p, query), 5, 1);
	if (matches.length === 0) throw new Error(`No confident match for "${query}"`);
	const top = matches[0]!;
	if (top.score < minScore) {
		const alts = matches
			.slice(0, 3)
			.map((m) => `  [${m.score}] ${m.item.name} (${m.item.slug})`)
			.join("\n");
		throw new Error(
			`Best match for "${query}" scored only ${top.score} (below --min-score ${minScore}).\nCandidates:\n${alts}`,
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

// ─── show ───────────────────────────────────────────────────────

export async function cartShow(opts: { json?: boolean; refresh?: boolean }): Promise<void> {
	const local = loadCart();
	if (!opts.refresh && local.items.length === 0) {
		if (opts.json) output({ cart: local, server: null });
		else log("Cart is empty.");
		return;
	}
	await pushAndShow(local, opts.json === true);
}

// ─── add ────────────────────────────────────────────────────────

export async function cartAdd(
	query: string,
	opts: { qty?: number; json?: boolean; minScore?: number },
): Promise<void> {
	if (!query) {
		outputError("Usage: gaeludyr cart add <product id, slug, or name> [--qty N]");
	}
	const qty = Math.max(1, opts.qty ?? 1);

	let productId: number;
	let label: string;
	let matchInfo: Record<string, unknown> | undefined;

	if (/^\d+$/.test(query)) {
		productId = Number.parseInt(query, 10);
		label = `product #${productId}`;
		matchInfo = { resolution: "id", productId };
	} else {
		const result = await resolveProduct(query, opts.minScore ?? DEFAULT_MIN_SCORE);
		productId = Number.parseInt(result.product.id, 10);
		if (Number.isNaN(productId)) outputError(`Invalid product id: ${result.product.id}`);
		label = result.product.name;
		matchInfo = {
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
	if (!opts.json) log(`Added ${qty}× ${label}`);
	await pushAndShow(local, opts.json === true, { match: matchInfo });
}

// ─── remove ─────────────────────────────────────────────────────

export async function cartRemove(
	query: string,
	opts: { json?: boolean; minScore?: number },
): Promise<void> {
	if (!query) outputError("Usage: gaeludyr cart remove <product name or slug or id>");
	const local = loadCart();
	let removedId: number | null = null;

	const asId = Number.parseInt(query, 10);
	if (!Number.isNaN(asId) && local.items.some((i) => i.productId === asId)) {
		removedId = asId;
	} else {
		const result = await resolveProduct(query, opts.minScore ?? DEFAULT_MIN_SCORE);
		removedId = Number.parseInt(result.product.id, 10);
	}

	const before = local.items.length;
	local.items = local.items.filter((i) => i.productId !== removedId);
	if (local.items.length === before) {
		outputError(`Product ${removedId} not in cart.`);
	}
	if (!opts.json) log(`Removed product ${removedId}`);
	await pushAndShow(local, opts.json === true);
}

// ─── clear ──────────────────────────────────────────────────────

export async function cartClear(opts: { json?: boolean }): Promise<void> {
	const local: LocalCart = { items: [], coupon: null, updatedAt: Date.now() };
	saveCart(local);
	await pushAndShow(local, opts.json === true);
}

// ─── coupon ─────────────────────────────────────────────────────

export async function cartCoupon(code: string | null, opts: { json?: boolean }): Promise<void> {
	const local = loadCart();
	local.coupon = code && code.length > 0 ? code : null;
	if (!opts.json) log(local.coupon ? `Applied coupon: ${local.coupon}` : "Removed coupon.");
	await pushAndShow(local, opts.json === true);
}

// ─── set (batch replace) ────────────────────────────────────────

interface SetInputItem {
	id?: number | string;
	productId?: number | string;
	qty?: number;
	quantity?: number;
	isVariation?: boolean;
}

async function readStdinJson(): Promise<unknown> {
	if (process.stdin.isTTY) throw new Error("No --items flag and no stdin input.");
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
	const text = Buffer.concat(chunks).toString("utf-8").trim();
	if (!text) throw new Error("Empty stdin.");
	return JSON.parse(text);
}

function normalizeItems(input: unknown): CartItem[] {
	if (!Array.isArray(input)) {
		throw new Error("Expected an array of items like [{id: 123, qty: 1}, ...]");
	}
	const now = Date.now();
	return input.map((raw, i) => {
		const obj = raw as SetInputItem;
		const rawId = obj.id ?? obj.productId;
		if (rawId == null) throw new Error(`Item ${i}: missing id/productId`);
		const productId = typeof rawId === "string" ? Number.parseInt(rawId, 10) : rawId;
		if (!Number.isFinite(productId) || productId <= 0) {
			throw new Error(`Item ${i}: invalid productId (${rawId})`);
		}
		const qty = obj.qty ?? obj.quantity ?? 1;
		if (!Number.isFinite(qty) || qty < 1) {
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

export async function cartSet(
	itemsArg: string | null,
	opts: { json?: boolean; coupon?: string | null },
): Promise<void> {
	let raw: unknown;
	if (itemsArg) {
		try {
			raw = JSON.parse(itemsArg);
		} catch (err) {
			outputError(`--items must be valid JSON: ${err instanceof Error ? err.message : err}`);
		}
	} else {
		raw = await readStdinJson();
	}
	const items = normalizeItems(raw);

	const local: LocalCart = {
		items,
		coupon: opts.coupon !== undefined ? opts.coupon : loadCart().coupon,
		updatedAt: Date.now(),
	};
	saveCart(local);
	if (!opts.json) log(`Set cart to ${items.length} item(s).`);
	await pushAndShow(local, opts.json === true);
}
