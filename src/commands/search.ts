import { log, output, outputError } from "../lib/output.ts";
import { type ProductSearchOpts, searchProducts } from "../lib/typesense.ts";

export interface SearchOpts extends ProductSearchOpts {
	json?: boolean;
}

export async function search(opts: SearchOpts): Promise<void> {
	if (!opts.q && !opts.categorySlug && !opts.brandSlug) {
		outputError(
			'Provide a search term (e.g. `gaeludyr search "feinsten"`), --category, or --brand',
		);
	}

	const products = await searchProducts(opts);

	if (opts.json) {
		output({
			query: opts.q ?? "*",
			category: opts.categorySlug,
			brand: opts.brandSlug,
			count: products.length,
			products: products.map((p) => ({
				id: p.id,
				name: p.name,
				slug: p.slug,
				price: p.price,
				display_price: p.display_price,
				on_sale: p.on_sale,
				stock_status: p.stock_status,
				is_in_stock: p.is_in_stock,
				brand_names: p.brand_names,
				image: p["image.medium_url"] ?? p["image.url"],
				permalink: p.permalink,
			})),
		});
		return;
	}

	if (products.length === 0) {
		log("No products found.");
		return;
	}
	for (const p of products) {
		const stock = p.is_in_stock ? "" : " [OUT OF STOCK]";
		const sale = p.on_sale ? " (on sale)" : "";
		const brand = p.brand_names?.[0] ?? "";
		log(`${p.name}${stock}${sale}`);
		log(`  ${brand ? `${brand} · ` : ""}${p.display_price ?? p.price} kr · /verslun/${p.slug}`);
	}
}
