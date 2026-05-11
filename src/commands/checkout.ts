import { GaeludyrClient } from "../lib/client.ts";
import { loadCart } from "../lib/config.ts";
import { formatPrice, log, output, outputError } from "../lib/output.ts";

export interface ShippingOpts {
	postcode: string;
	street: string;
	city: string;
	country?: string;
	ssn?: string;
	json?: boolean;
}

export async function checkoutShipping(opts: ShippingOpts): Promise<void> {
	if (!opts.postcode || !opts.street || !opts.city) {
		outputError(
			"Usage: gaeludyr checkout shipping --postcode <NNN> --street <addr> --city <name> [--country IS] [--ssn <kennitala>]",
		);
	}
	const client = new GaeludyrClient();
	const local = loadCart();
	const profile = await client.getProfile().catch(() => null);
	const ssn = opts.ssn ?? profile?.user_ssn ?? "";

	const resp = await client.checkoutShipping({
		cart: local.items,
		hasPrescriptions: false,
		prescriptionCart: [],
		prescriptionCount: 0,
		destination: {
			country: opts.country ?? "IS",
			postcode: opts.postcode,
			street: opts.street,
			city: opts.city,
		},
		ssn,
	});

	if (opts.json) {
		output(resp);
		return;
	}

	if (!resp.shippable) log("⚠ Cart is NOT shippable to this destination.");
	log(`Available shipping methods (${resp.shippingMethods.length}):`);
	for (const m of resp.shippingMethods) {
		log(`  ${m.label.padEnd(30)} ${formatPrice(m.cost).padStart(12)}    [${m.id}]`);
	}
}

export async function checkoutPayment(opts: { json?: boolean }): Promise<void> {
	const client = new GaeludyrClient();
	const methods = await client.checkoutPayment();
	if (opts.json) {
		output({ count: methods.length, methods });
		return;
	}
	for (const m of methods.sort((a, b) => a.order - b.order)) {
		log(`  ${m.label.padEnd(20)} [${m.name}]`);
	}
}
