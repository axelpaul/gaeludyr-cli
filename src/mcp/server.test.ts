import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("Gæludýr MCP exposes bounded public search only", async () => {
	const client = new Client({ name: "gaeludyr-test", version: "0.1.0" });
	try {
		await client.connect(
			new StdioClientTransport({
				command: process.execPath,
				args: ["src/index.ts", "serve"],
				cwd: process.cwd(),
				stderr: "pipe",
			}),
		);
		expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(["search"]);
		const invalid = await client.callTool({
			name: "search",
			arguments: { query: "cat", limit: 100 },
		});
		expect(invalid.isError).toBe(true);
	} finally {
		await client.close();
	}
});
