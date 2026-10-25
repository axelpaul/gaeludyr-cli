import { type ShippingQuery, shippingOptions } from "../lib/checkout.ts";
import { GaeludyrClient } from "../lib/client.ts";
import { formatPrice, log, output, outputError } from "../lib/output.ts";

export interface ShippingOpts extends ShippingQuery {
	json?: boolean;
}

export async function checkoutShipping(opts: ShippingOpts): Promise<void> {
	if (!opts.postcode || !opts.street || !opts.city) {
		outputError(
			"Usage: gaeludyr checkout shipping --postcode <NNN> --street <addr> --city <name> [--country IS] [--ssn <kennitala>]",
		);
	}
	const resp = await shippingOptions(opts);

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
	const methods = await new GaeludyrClient().checkoutPayment();
	if (opts.json) {
		output({ count: methods.length, methods });
		return;
	}
	for (const m of methods.sort((a, b) => a.order - b.order)) {
		log(`  ${m.label.padEnd(20)} [${m.name}]`);
	}
}
