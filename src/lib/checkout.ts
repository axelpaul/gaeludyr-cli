/**
 * Read-only checkout helpers shared by the CLI and MCP server. These compute
 * shipping options / list payment methods; nothing here places an order.
 */
import { GaeludyrClient } from "./client.ts";
import { loadCart } from "./config.ts";
import type { CheckoutShippingResponse } from "./types.ts";

export interface ShippingQuery {
	postcode: string;
	street: string;
	city: string;
	country?: string;
	ssn?: string;
}

/** Shipping methods + costs for the current local cart and a destination. */
export async function shippingOptions(q: ShippingQuery): Promise<CheckoutShippingResponse> {
	if (!q.postcode || !q.street || !q.city) {
		throw new Error("postcode, street and city are required");
	}
	const client = new GaeludyrClient();
	let ssn = q.ssn;
	if (ssn === undefined) {
		const profile = await client.getProfile().catch(() => null);
		ssn = profile?.user_ssn ?? "";
	}
	return client.checkoutShipping({
		cart: loadCart().items,
		hasPrescriptions: false,
		prescriptionCart: [],
		prescriptionCount: 0,
		destination: {
			country: q.country ?? "IS",
			postcode: q.postcode,
			street: q.street,
			city: q.city,
		},
		ssn,
	});
}
