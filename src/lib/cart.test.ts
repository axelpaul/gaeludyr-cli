import { expect, test } from "bun:test";
import { normalizeItems } from "./cart.ts";

test("normalizeItems accepts {id, qty} and {productId, quantity}", () => {
	const items = normalizeItems([
		{ id: 46685, qty: 2 },
		{ productId: "123", quantity: 1 },
		{ id: 7 },
	]);
	expect(items.map((i) => [i.productId, i.quantity])).toEqual([
		[46685, 2],
		[123, 1],
		[7, 1],
	]);
	expect(items.every((i) => i.version === 2 && i.isVariation === false)).toBe(true);
});

test("normalizeItems rejects bad input", () => {
	expect(() => normalizeItems({})).toThrow("Expected an array");
	expect(() => normalizeItems([{ qty: 1 }])).toThrow("missing id");
	expect(() => normalizeItems([{ id: "abc" }])).toThrow("invalid productId");
	expect(() => normalizeItems([{ id: 1, qty: 0 }])).toThrow("invalid quantity");
	expect(() => normalizeItems([{ id: 1, qty: 1.5 }])).toThrow("invalid quantity");
});
