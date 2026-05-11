import { GaeludyrClient } from "../lib/client.ts";
import { fetchSsrData } from "../lib/nextjs.ts";
import { formatPrice, log, output, outputError } from "../lib/output.ts";

export async function ordersList(opts: { page?: number; json?: boolean }): Promise<void> {
	const client = new GaeludyrClient();
	const orders = await client.listOrders(opts.page ?? 1);

	if (opts.json) {
		output({ page: opts.page ?? 1, count: orders.length, orders });
		return;
	}

	if (orders.length === 0) {
		log("No orders found.");
		return;
	}
	for (const o of orders) {
		log(
			`#${o.id}  ${o.status.padEnd(10)}  ${formatPrice(o.total).padStart(12)}  ${o.date_created.date}`,
		);
		log(`         ${o.shipping_method} · ${o.payment_method_title}`);
	}
}

export async function orderDetail(id: string, opts: { json?: boolean }): Promise<void> {
	if (!id) outputError("Usage: gaeludyr order <id>");
	// Order detail lives at the Next.js SSR data route, not /api/orders/{id}
	const data = await fetchSsrData<unknown>(`/is/minar-sidur/pantanir/${id}.json`);

	if (opts.json) {
		output(data);
		return;
	}

	// Try to print the page-props body in a human format if shape is recognizable
	const obj = data as { pageProps?: Record<string, unknown> };
	if (!obj.pageProps) {
		log(JSON.stringify(data, null, 2));
		return;
	}
	const props = obj.pageProps;
	log(`Order #${id}`);
	for (const key of Object.keys(props)) {
		const value = props[key];
		if (value == null) continue;
		if (typeof value === "object") {
			log(`${key}:`);
			log(`  ${JSON.stringify(value, null, 2).split("\n").join("\n  ")}`);
		} else {
			log(`${key}: ${value}`);
		}
	}
}
