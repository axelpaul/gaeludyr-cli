import {
	addToCart,
	type CartState,
	clearCart,
	removeFromCart,
	replaceCart,
	setCoupon,
	viewCart,
} from "../lib/cart.ts";
import { formatPrice, log, output, outputError } from "../lib/output.ts";
import type { CartResponse } from "../lib/types.ts";

function show(state: CartState, json: boolean, extra: Record<string, unknown> = {}): void {
	if (json) output({ ...state, ...extra });
	else if (state.server) printCart(state.server);
	else log("Cart is empty.");
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

export async function cartShow(opts: { json?: boolean; refresh?: boolean }): Promise<void> {
	show(await viewCart(opts.refresh ?? true), opts.json === true);
}

export async function cartAdd(
	query: string,
	opts: { qty?: number; json?: boolean; minScore?: number },
): Promise<void> {
	if (!query) outputError("Usage: gaeludyr cart add <product id, slug, or name> [--qty N]");
	const { match, label, ...state } = await addToCart(query, opts);
	if (!opts.json) log(`Added ${Math.max(1, opts.qty ?? 1)}× ${label}`);
	show(state, opts.json === true, { match });
}

export async function cartRemove(
	query: string,
	opts: { json?: boolean; minScore?: number },
): Promise<void> {
	if (!query) outputError("Usage: gaeludyr cart remove <product name or slug or id>");
	const { removedId, ...state } = await removeFromCart(query, opts);
	if (!opts.json) log(`Removed product ${removedId}`);
	show(state, opts.json === true);
}

export async function cartClear(opts: { json?: boolean }): Promise<void> {
	show(await clearCart(), opts.json === true);
}

export async function cartCoupon(code: string | null, opts: { json?: boolean }): Promise<void> {
	const state = await setCoupon(code);
	if (!opts.json)
		log(state.cart.coupon ? `Applied coupon: ${state.cart.coupon}` : "Removed coupon.");
	show(state, opts.json === true);
}

async function readStdinJson(): Promise<unknown> {
	if (process.stdin.isTTY) throw new Error("No --items flag and no stdin input.");
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
	const text = Buffer.concat(chunks).toString("utf-8").trim();
	if (!text) throw new Error("Empty stdin.");
	return JSON.parse(text);
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
	const { count, ...state } = await replaceCart(raw, opts.coupon);
	if (!opts.json) log(`Set cart to ${count} item(s).`);
	show(state, opts.json === true);
}
