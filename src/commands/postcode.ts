import { GaeludyrClient } from "../lib/client.ts";
import { log, output, outputError } from "../lib/output.ts";

export async function postcode(code: string, opts: { json?: boolean }): Promise<void> {
	if (!code) outputError("Usage: gaeludyr postcode <NNN>");
	const client = new GaeludyrClient();
	const result = await client.postcodeLookup(code);
	if (opts.json) {
		output(result);
		return;
	}
	log(`Postcode: ${result.postalCode}`);
	log(`City:     ${result.city}`);
	log(`Country:  ${result.country}`);
	if (result.street1) log(`Street 1: ${result.street1}`);
	if (result.street2) log(`Street 2: ${result.street2}`);
}
