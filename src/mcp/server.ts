import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { searchProducts } from "../lib/typesense.ts";

const server = new McpServer({ name: "gaeludyr", version: "0.1.0" });
const result = (data: unknown) => ({
	content: [{ type: "text" as const, text: JSON.stringify(data) }],
});
const error = (value: unknown) => ({
	isError: true,
	content: [
		{
			type: "text" as const,
			text: value instanceof Error ? value.message : "Catalog search failed.",
		},
	],
});

server.registerTool(
	"search",
	{
		description:
			"Search the public Gæludýr product catalogue. No account, cart, or checkout access.",
		inputSchema: {
			query: z.string().trim().min(1).max(100),
			inStock: z.boolean().default(false),
			limit: z.number().int().min(1).max(30).default(10),
		},
	},
	async ({ query, inStock, limit }) => {
		try {
			const products = await searchProducts({ q: query, inStock, perPage: limit });
			return result({
				query,
				products: products.map((p) => ({
					id: p.id,
					name: p.name,
					slug: p.slug,
					price: p.price,
					inStock: p.is_in_stock,
					url: p.permalink,
				})),
			});
		} catch (e) {
			return error(e);
		}
	},
);

export async function serve(): Promise<void> {
	await server.connect(new StdioServerTransport());
}
