import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configDir, loadCart, loadSession, saveSession, sessionPath } from "./config.ts";

const saved = { ...process.env };
afterEach(() => {
	process.env = { ...saved };
});

test("config dir honours GAELUDYR_CONFIG_DIR then XDG_CONFIG_HOME", () => {
	process.env.GAELUDYR_CONFIG_DIR = "/tmp/x";
	expect(configDir()).toBe("/tmp/x");
	delete process.env.GAELUDYR_CONFIG_DIR;
	process.env.XDG_CONFIG_HOME = "/tmp/xdg";
	expect(configDir()).toBe("/tmp/xdg/gaeludyr-cli");
});

test("session round-trips with 0600 perms; env cookie wins", () => {
	const dir = mkdtempSync(join(tmpdir(), "gaeludyr-cfg-"));
	try {
		process.env.GAELUDYR_CONFIG_DIR = dir;
		delete process.env.GAELUDYR_KK_FE;
		expect(loadSession()).toBeNull();
		expect(loadCart().items).toEqual([]);
		saveSession({ kk_fe: "Fe26.2*test" });
		expect(loadSession()?.kk_fe).toBe("Fe26.2*test");
		expect(statSync(sessionPath()).mode & 0o777).toBe(0o600);
		process.env.GAELUDYR_KK_FE = "from-env";
		expect(loadSession()?.kk_fe).toBe("from-env");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
