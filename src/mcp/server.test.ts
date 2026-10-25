import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import pkg from "../../package.json" with { type: "json" };
import { createServer, writesEnabled } from "./server.ts";

const READ_TOOLS = [
	"search",
	"product",
	"postcode",
	"dropp_locations",
	"me",
	"orders",
	"order",
	"cart_view",
	"checkout_shipping",
	"payment_methods",
].sort();
const WRITE_TOOLS = ["cart_add", "cart_remove", "cart_set", "cart_clear", "cart_coupon"].sort();

let dir: string;
beforeAll(() => {
	// Isolate from any real login/cart on the machine running the tests.
	dir = mkdtempSync(join(tmpdir(), "gaeludyr-test-"));
	process.env.GAELUDYR_CONFIG_DIR = dir;
	delete process.env.GAELUDYR_KK_FE;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function connect(enableWrites: boolean): Promise<Client> {
	const server = createServer({ enableWrites });
	const [clientT, serverT] = InMemoryTransport.createLinkedPair();
	await server.connect(serverT);
	const client = new Client({ name: "gaeludyr-test", version: "0.0.0" });
	await client.connect(clientT);
	return client;
}

const text = (r: Awaited<ReturnType<Client["callTool"]>>) =>
	(r.content as { type: string; text: string }[])[0]?.text ?? "";

describe("tool listing", () => {
	test("read-only by default", async () => {
		const client = await connect(false);
		const names = (await client.listTools()).tools.map((t) => t.name).sort();
		expect(names).toEqual(READ_TOOLS);
		await client.close();
	});

	test("writes appear only when enabled", async () => {
		const client = await connect(true);
		const names = (await client.listTools()).tools.map((t) => t.name).sort();
		expect(names).toEqual([...READ_TOOLS, ...WRITE_TOOLS].sort());
		await client.close();
	});

	test("env var gate", () => {
		expect(writesEnabled({})).toBe(false);
		expect(writesEnabled({ GAELUDYR_MCP_ENABLE_WRITES: "true" })).toBe(false);
		expect(writesEnabled({ GAELUDYR_MCP_ENABLE_WRITES: "1" })).toBe(true);
	});
});

describe("input validation and auth (offline)", () => {
	test("search needs a query, category or brand", async () => {
		const client = await connect(false);
		const r = await client.callTool({ name: "search", arguments: {} });
		expect(r.isError).toBe(true);
		expect(text(r)).toContain("Provide query");
		const big = await client.callTool({ name: "search", arguments: { query: "x", per_page: 500 } });
		expect(big.isError).toBe(true);
		await client.close();
	});

	test("authenticated tools fail cleanly without a session", async () => {
		const client = await connect(false);
		for (const name of ["me", "orders"]) {
			const r = await client.callTool({ name, arguments: {} });
			expect(r.isError).toBe(true);
			expect(text(r)).toContain("Not authenticated");
		}
		const r = await client.callTool({ name: "order", arguments: { id: 12345 } });
		expect(r.isError).toBe(true);
		expect(text(r)).toContain("Not authenticated");
		await client.close();
	});

	test("write tools require confirm: true", async () => {
		const client = await connect(true);
		for (const args of [{}, { confirm: false }]) {
			const r = await client.callTool({ name: "cart_clear", arguments: args });
			expect(r.isError).toBe(true);
		}
		const r = await client.callTool({
			name: "cart_set",
			arguments: { items: [{ id: -1, qty: 1 }], confirm: true },
		});
		expect(r.isError).toBe(true);
		await client.close();
	});
});

test("`gaeludyr serve` speaks MCP over stdio", async () => {
	const client = new Client({ name: "gaeludyr-test", version: "0.0.0" });
	try {
		await client.connect(
			new StdioClientTransport({
				command: process.execPath,
				args: ["src/index.ts", "serve"],
				cwd: join(import.meta.dir, "../.."),
				env: { ...(process.env as Record<string, string>), GAELUDYR_MCP_ENABLE_WRITES: "" },
				stderr: "pipe",
			}),
		);
		expect(client.getServerVersion()?.version).toBe(pkg.version);
		const names = (await client.listTools()).tools.map((t) => t.name).sort();
		expect(names).toEqual(READ_TOOLS);
	} finally {
		await client.close();
	}
});
