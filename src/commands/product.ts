import { GaeludyrClient } from "../lib/client.ts";
import { log, output, outputError } from "../lib/output.ts";

export async function product(slug: string, opts: { json?: boolean }): Promise<void> {
	if (!slug) outputError("Usage: gaeludyr product <slug>");
	const client = new GaeludyrClient();
	const data = await client.getProductCartData(slug);

	if (opts.json) {
		output(data);
		return;
	}

	log(`Product ID:    ${data.id}`);
	log(`Type:          ${data.type}`);
	log(`Stock status:  ${data.stock_status}${data.low_stock ? " (low)" : ""}`);
	if (data.stock != null) log(`Stock:         ${data.stock}`);
	log(
		`Price:         ${data.display_full_price ?? data.price} kr${data.on_sale ? " (on sale)" : ""}`,
	);
	if (data.on_sale) log(`Sale price:    ${data.sale_price} kr (regular ${data.regular_price} kr)`);
	log(`Max qty:       ${data.maximum_allowed_quantity}`);
}
