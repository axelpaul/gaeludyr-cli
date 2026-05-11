import { BASE_URL, USER_AGENT } from "./config.ts";
import type {
	AuthPollResponse,
	AuthStartRequest,
	AuthStartResponse,
	SessionCookies,
} from "./types.ts";

const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 120_000;

interface SetCookieParts {
	name: string;
	value: string;
}

function parseSetCookieHeader(headerValue: string): SetCookieParts[] {
	// Multiple Set-Cookie headers are concatenated with newlines by undici.
	// Each cookie is name=value; attr=val; attr=val
	const cookies: SetCookieParts[] = [];
	for (const line of headerValue.split(/[\n,](?=[^=]+=)/)) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const [pair] = trimmed.split(";");
		if (!pair) continue;
		const eq = pair.indexOf("=");
		if (eq < 0) continue;
		const name = pair.slice(0, eq).trim();
		const value = pair.slice(eq + 1).trim();
		if (!name) continue;
		cookies.push({ name, value });
	}
	return cookies;
}

/** Step 1: POST /api/auth/start with phone + ssn + authType */
export async function authStart(req: AuthStartRequest): Promise<{
	authRequestId: string;
	setCookies: SetCookieParts[];
}> {
	const res = await fetch(`${BASE_URL}/api/auth/start`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			accept: "application/json",
			"user-agent": USER_AGENT,
			origin: BASE_URL,
			referer: `${BASE_URL}/`,
		},
		body: JSON.stringify(req),
	});
	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`auth/start failed: ${res.status} ${text}`);
	}
	const data = (await res.json()) as AuthStartResponse;
	if (!data.authRequestId) throw new Error("auth/start returned no authRequestId");
	const setCookieHeader = res.headers.get("set-cookie") ?? "";
	return {
		authRequestId: data.authRequestId,
		setCookies: parseSetCookieHeader(setCookieHeader),
	};
}

/** Step 2: poll /api/auth/poll until done=true or timeout */
export async function authPollLoop(
	authRequestId: string,
	startedCookies: SetCookieParts[],
	onTick?: (msg: string) => void,
): Promise<SessionCookies> {
	const deadline = Date.now() + POLL_TIMEOUT_MS;
	const accumulated = new Map<string, string>();
	for (const c of startedCookies) accumulated.set(c.name, c.value);

	while (Date.now() < deadline) {
		const cookieHeader = [...accumulated.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
		const res = await fetch(`${BASE_URL}/api/auth/poll`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json",
				"user-agent": USER_AGENT,
				origin: BASE_URL,
				referer: `${BASE_URL}/`,
				...(cookieHeader ? { cookie: cookieHeader } : {}),
			},
			body: JSON.stringify({ authRequestId }),
		});

		// Capture any Set-Cookie that lands during the poll loop
		const sc = res.headers.get("set-cookie");
		if (sc) {
			for (const c of parseSetCookieHeader(sc)) accumulated.set(c.name, c.value);
		}

		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new Error(`auth/poll failed: ${res.status} ${text}`);
		}

		const data = (await res.json()) as AuthPollResponse;
		if (onTick && data.statusMessage) onTick(data.statusMessage);

		if (data.done) {
			const kk_fe = accumulated.get("kk_fe");
			if (!kk_fe) {
				throw new Error(
					"Auth completed but no kk_fe cookie was set. Site behavior may have changed.",
				);
			}
			const session: SessionCookies = { kk_fe };
			const kk_fe_2 = accumulated.get("kk_fe_2");
			if (kk_fe_2) session.kk_fe_2 = kk_fe_2;
			const extra: Record<string, string> = {};
			for (const [k, v] of accumulated) {
				if (k === "kk_fe" || k === "kk_fe_2") continue;
				extra[k] = v;
			}
			if (Object.keys(extra).length > 0) session.extra = extra;
			return session;
		}

		await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
	}

	throw new Error(`Auth polling timed out after ${POLL_TIMEOUT_MS / 1000}s`);
}
