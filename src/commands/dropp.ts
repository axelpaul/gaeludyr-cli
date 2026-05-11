import { GaeludyrClient } from "../lib/client.ts";
import { log, output } from "../lib/output.ts";

export async function dropp(opts: { json?: boolean; near?: string }): Promise<void> {
	const client = new GaeludyrClient();
	const resp = await client.droppLocations();

	let locations = resp.locations;
	if (opts.near) {
		const needle = opts.near.toLowerCase();
		locations = locations.filter(
			(l) => l.name.toLowerCase().includes(needle) || l.address.toLowerCase().includes(needle),
		);
	}

	if (opts.json) {
		output({ count: locations.length, locations });
		return;
	}
	if (locations.length === 0) {
		log("No locations found.");
		return;
	}
	for (const l of locations) {
		const today = l.times.find((t) => t.today);
		log(`${l.name}  [${l.externalLocationId}]`);
		log(`  ${l.address}`);
		if (today) log(`  Open today: ${today.time}`);
	}
}
