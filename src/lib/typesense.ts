import {
	TYPESENSE_API_KEY,
	TYPESENSE_HOST,
	TYPESENSE_PRODUCT_COLLECTION,
	TYPESENSE_PRODUCT_QUERY_BY,
	USER_AGENT,
} from "./config.ts";
import type { ProductDocument, TypesenseMultiSearchResponse, TypesenseSearch } from "./types.ts";

export interface ProductSearchOpts {
	q?: string;
	categorySlug?: string;
	brandSlug?: string;
	inStock?: boolean;
	page?: number;
	perPage?: number;
	sortBy?: string;
}

function buildFilter(opts: ProductSearchOpts): string | undefined {
	const parts: string[] = [];
	if (opts.categorySlug) parts.push(`category_slugs:=[\`${opts.categorySlug}\`]`);
	if (opts.brandSlug) parts.push(`brand_slugs:=[\`${opts.brandSlug}\`]`);
	if (opts.inStock) parts.push("is_in_stock:=[`true`]");
	return parts.length > 0 ? parts.join(" && ") : undefined;
}

export async function searchProducts(opts: ProductSearchOpts): Promise<ProductDocument[]> {
	const search: TypesenseSearch = {
		collection: TYPESENSE_PRODUCT_COLLECTION,
		q: opts.q && opts.q.length > 0 ? opts.q : "*",
		query_by: TYPESENSE_PRODUCT_QUERY_BY,
		sort_by: opts.sortBy ?? "is_featured:desc,name_icelandic:asc",
		per_page: opts.perPage ?? 20,
		page: opts.page ?? 1,
		prefix: true,
		max_candidates: 10000,
	};
	const filter = buildFilter(opts);
	if (filter) search.filter_by = filter;

	const res = await fetch(
		`${TYPESENSE_HOST}/multi_search?x-typesense-api-key=${TYPESENSE_API_KEY}`,
		{
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json",
				"user-agent": USER_AGENT,
			},
			body: JSON.stringify({ searches: [search] }),
		},
	);

	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`Typesense search failed: ${res.status} ${text.slice(0, 300)}`);
	}

	const data = (await res.json()) as TypesenseMultiSearchResponse;
	const first = data.results[0];
	if (!first) return [];
	return first.hits.map((h) => h.document);
}
