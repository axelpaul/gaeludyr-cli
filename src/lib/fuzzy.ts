import type { ProductDocument } from "./types.ts";

/** Lowercase, strip accents, split on non-alphanumerics. */
function tokenize(s: string): string[] {
	return s
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.split(/[^a-z0-9]+/)
		.filter((t) => t.length > 0);
}

export interface FuzzyMatch<T> {
	item: T;
	score: number;
}

/**
 * Score a product against a free-text query. Higher = better.
 * Matches against name, slug, brand names, and SKU.
 */
export function scoreProduct(product: ProductDocument, query: string): number {
	const qTokens = tokenize(query);
	if (qTokens.length === 0) return 0;
	const haystack = tokenize(
		[product.name, product.slug, ...(product.brand_names ?? []), product.sku ?? ""]
			.filter(Boolean)
			.join(" "),
	);
	let score = 0;
	for (const t of qTokens) {
		if (haystack.includes(t)) score += 10;
		else if (haystack.some((h) => h.startsWith(t))) score += 5;
		else if (haystack.some((h) => h.includes(t))) score += 2;
	}
	// Exact name match bonus
	if (product.name.toLowerCase() === query.toLowerCase()) score += 50;
	if (product.slug === query.toLowerCase()) score += 50;
	return score;
}

export function bestMatch<T>(
	items: T[],
	scoreFn: (item: T) => number,
	minScore = 1,
): FuzzyMatch<T> | null {
	let best: FuzzyMatch<T> | null = null;
	for (const item of items) {
		const score = scoreFn(item);
		if (score < minScore) continue;
		if (!best || score > best.score) best = { item, score };
	}
	return best;
}

/** Return all items with score >= minScore, sorted descending. Empty if none qualify. */
export function topMatches<T>(
	items: T[],
	scoreFn: (item: T) => number,
	limit = 5,
	minScore = 1,
): FuzzyMatch<T>[] {
	const scored: FuzzyMatch<T>[] = [];
	for (const item of items) {
		const score = scoreFn(item);
		if (score < minScore) continue;
		scored.push({ item, score });
	}
	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, limit);
}
