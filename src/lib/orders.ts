import { GaeludyrClient } from "./client.ts";
import { fetchSsrData } from "./nextjs.ts";
import type { OrderSummary } from "./types.ts";

export function listOrders(page = 1): Promise<OrderSummary[]> {
	return new GaeludyrClient().listOrders(page);
}

/** Order detail via the Next.js SSR data route (there is no /api/orders/{id}). */
export async function orderDetail(id: string | number): Promise<unknown> {
	const s = String(id);
	if (!/^\d+$/.test(s)) throw new Error(`Order id must be numeric, got "${s}"`);
	return fetchSsrData<unknown>(`/is/minar-sidur/pantanir/${s}.json`);
}
