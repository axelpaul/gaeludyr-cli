import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { LocalCart, SessionCookies } from "./types.ts";

// ─── Paths ──────────────────────────────────────────────────────
// Resolved lazily so tests (and users) can point them elsewhere via env vars.

const APP_DIR = "gaeludyr-cli";

/** `$GAELUDYR_CONFIG_DIR`, else `$XDG_CONFIG_HOME/gaeludyr-cli`, else `~/.config/gaeludyr-cli`. */
export function configDir(): string {
	if (process.env.GAELUDYR_CONFIG_DIR) return process.env.GAELUDYR_CONFIG_DIR;
	const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
	return join(base, APP_DIR);
}

/** `$XDG_CACHE_HOME/gaeludyr-cli`, else `~/.cache/gaeludyr-cli`. */
export function cacheDir(): string {
	const base = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
	return join(base, APP_DIR);
}

/** Pre-0.2 location; read as a fallback so existing logins keep working. */
const legacyDir = () => join(homedir(), ".gaeludyr");

export const sessionPath = () => join(configDir(), "session.json");
export const cartPath = () => join(configDir(), "cart.json");
export const buildIdPath = () => join(cacheDir(), "buildid.json");

function ensureDir(dir: string): void {
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function readJson<T>(path: string): T | null {
	if (!existsSync(path)) return null;
	try {
		const text = readFileSync(path, "utf-8");
		return text.trim() ? (JSON.parse(text) as T) : null;
	} catch {
		return null;
	}
}

/** Read from the current location, falling back to the legacy ~/.gaeludyr dir. */
function readWithLegacy<T>(path: string, file: string): T | null {
	if (existsSync(path)) return readJson<T>(path);
	if (process.env.GAELUDYR_CONFIG_DIR) return null;
	return readJson<T>(join(legacyDir(), file));
}

// ─── Session (auth cookies) ─────────────────────────────────────

export function saveSession(cookies: SessionCookies): void {
	ensureDir(configDir());
	const path = sessionPath();
	writeFileSync(path, JSON.stringify(cookies, null, 2), { mode: 0o600 });
	chmodSync(path, 0o600);
}

/** Session from `GAELUDYR_KK_FE` (cookie value) if set, else from the session file. */
export function loadSession(): SessionCookies | null {
	const fromEnv = process.env.GAELUDYR_KK_FE;
	if (fromEnv) return { kk_fe: fromEnv };
	const session = readWithLegacy<SessionCookies>(sessionPath(), "session.json");
	return session?.kk_fe ? session : null;
}

export function clearSession(): void {
	for (const path of [sessionPath(), join(legacyDir(), "session.json")]) {
		if (existsSync(path)) writeFileSync(path, "");
	}
}

export function requireSession(): SessionCookies {
	const session = loadSession();
	if (!session?.kk_fe) {
		throw new Error(
			'Not authenticated. Run "gaeludyr login --phone <7-digit mobile>" first (or set GAELUDYR_KK_FE).',
		);
	}
	return session;
}

/** Serialize cookies to a `Cookie:` header value. */
export function cookieHeader(session: SessionCookies): string {
	const parts = [`kk_fe=${session.kk_fe}`];
	if (session.kk_fe_2) parts.push(`kk_fe_2=${session.kk_fe_2}`);
	if (session.extra) {
		for (const [k, v] of Object.entries(session.extra)) parts.push(`${k}=${v}`);
	}
	return parts.join("; ");
}

// ─── Local cart ─────────────────────────────────────────────────

export function loadCart(): LocalCart {
	const cart = readWithLegacy<LocalCart>(cartPath(), "cart.json");
	if (!cart || !Array.isArray(cart.items)) {
		return { items: [], coupon: null, updatedAt: Date.now() };
	}
	return cart;
}

export function saveCart(cart: LocalCart): void {
	ensureDir(configDir());
	writeFileSync(cartPath(), JSON.stringify(cart, null, 2));
}

// ─── Next.js build ID cache ─────────────────────────────────────

export interface CachedBuildId {
	buildId: string;
	fetchedAt: number;
}

export function loadBuildId(): CachedBuildId | null {
	return readJson<CachedBuildId>(buildIdPath());
}

export function saveBuildId(buildId: string): void {
	ensureDir(cacheDir());
	const cached: CachedBuildId = { buildId, fetchedAt: Date.now() };
	writeFileSync(buildIdPath(), JSON.stringify(cached, null, 2));
}

// ─── Static config ──────────────────────────────────────────────

export const BASE_URL = "https://www.gaeludyr.is";

// Typesense Cloud cluster + public search-only API key (extracted from JS bundles).
// Both values are embedded client-side; safe to hardcode.
export const TYPESENSE_HOST = "https://x28lb9st5hgqn0fup-1.a1.typesense.net";
export const TYPESENSE_API_KEY = "1vbFMl2eI4Ene9ENwjgSn92aJpp3JW7T";
export const TYPESENSE_PRODUCT_COLLECTION = "gaeludyr_product";
export const TYPESENSE_POST_COLLECTION = "gaeludyr_post";

export const TYPESENSE_PRODUCT_QUERY_BY =
	"name,slug,category_slugs,brand_slugs,excerpt,cart_description,sku,brand_names,typesense_keywords,taxonomies.pa_brand,category_ids_and_names";

export const USER_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
