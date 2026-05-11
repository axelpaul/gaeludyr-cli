import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { LocalCart, SessionCookies } from "./types.ts";

export const CONFIG_DIR = join(homedir(), ".gaeludyr");
export const SESSION_PATH = join(CONFIG_DIR, "session.json");
export const CART_PATH = join(CONFIG_DIR, "cart.json");
export const BUILDID_PATH = join(CONFIG_DIR, "buildid.json");

function ensureDir(): void {
	if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
}

// ─── Session (auth cookies) ─────────────────────────────────────

export function saveSession(cookies: SessionCookies): void {
	ensureDir();
	writeFileSync(SESSION_PATH, JSON.stringify(cookies, null, 2));
}

export function loadSession(): SessionCookies | null {
	if (!existsSync(SESSION_PATH)) return null;
	try {
		return JSON.parse(readFileSync(SESSION_PATH, "utf-8")) as SessionCookies;
	} catch {
		return null;
	}
}

export function clearSession(): void {
	if (existsSync(SESSION_PATH)) writeFileSync(SESSION_PATH, "");
}

export function requireSession(): SessionCookies {
	const session = loadSession();
	if (!session?.kk_fe) {
		throw new Error('Not authenticated. Run "gaeludyr login --phone <7-digit>" first.');
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
	if (!existsSync(CART_PATH)) {
		return { items: [], coupon: null, updatedAt: Date.now() };
	}
	try {
		return JSON.parse(readFileSync(CART_PATH, "utf-8")) as LocalCart;
	} catch {
		return { items: [], coupon: null, updatedAt: Date.now() };
	}
}

export function saveCart(cart: LocalCart): void {
	ensureDir();
	writeFileSync(CART_PATH, JSON.stringify(cart, null, 2));
}

// ─── Next.js build ID cache ─────────────────────────────────────

export interface CachedBuildId {
	buildId: string;
	fetchedAt: number;
}

export function loadBuildId(): CachedBuildId | null {
	if (!existsSync(BUILDID_PATH)) return null;
	try {
		return JSON.parse(readFileSync(BUILDID_PATH, "utf-8")) as CachedBuildId;
	} catch {
		return null;
	}
}

export function saveBuildId(buildId: string): void {
	ensureDir();
	const cached: CachedBuildId = { buildId, fetchedAt: Date.now() };
	writeFileSync(BUILDID_PATH, JSON.stringify(cached, null, 2));
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
