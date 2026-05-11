import { GaeludyrClient } from "../lib/client.ts";
import { log, output } from "../lib/output.ts";

export async function me(opts: { json?: boolean }): Promise<void> {
	const client = new GaeludyrClient();
	const profile = await client.getProfile();

	if (opts.json) {
		output(profile);
		return;
	}

	const s = profile.shipping;
	const b = profile.billing;
	log(`Name:        ${s.first_name} ${s.last_name}`);
	log(`Email:       ${b.email ?? "—"}`);
	log(`Phone:       +${s.phone_cc}${s.phone || b.phone || "—"}`);
	log(`Kennitala:   ${profile.user_ssn}`);
	log("");
	log("Shipping address:");
	log(`  ${s.address_1}`);
	if (s.address_2) log(`  ${s.address_2}`);
	log(`  ${s.postcode} ${s.city}`);
	log("");
	log(
		`Preferred shipping: ${profile.preferredShipmentMethod.label} (${profile.preferredShipmentMethod.cost} kr)`,
	);
}
