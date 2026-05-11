import {
	BASE_URL,
	USER_AGENT,
	cookieHeader,
	loadBuildId,
	requireSession,
	saveBuildId,
} from "./config.ts";

const BUILDID_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Discover the current Next.js build ID by fetching the root HTML and parsing
 * the embedded <script id="__NEXT_DATA__">. Cached for an hour.
 */
export async function getBuildId(forceRefresh = false): Promise<string> {
	if (!forceRefresh) {
		const cached = loadBuildId();
		if (cached && Date.now() - cached.fetchedAt < BUILDID_TTL_MS) {
			return cached.buildId;
		}
	}

	const res = await fetch(`${BASE_URL}/`, {
		headers: { "user-agent": USER_AGENT, accept: "text/html" },
	});
	if (!res.ok) throw new Error(`Failed to fetch ${BASE_URL}/ for buildId discovery: ${res.status}`);
	const html = await res.text();
	const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
	if (!match || !match[1]) throw new Error("Could not find __NEXT_DATA__ in page HTML");
	let data: { buildId?: string };
	try {
		data = JSON.parse(match[1]) as { buildId?: string };
	} catch {
		throw new Error("__NEXT_DATA__ was not valid JSON");
	}
	if (!data.buildId) throw new Error("__NEXT_DATA__ did not contain a buildId");
	saveBuildId(data.buildId);
	return data.buildId;
}

/** Fetch a Next.js SSR data route as JSON. Auto-retries once if the buildId has rotated. */
export async function fetchSsrData<T = unknown>(path: string): Promise<T> {
	const session = requireSession();
	const cookie = cookieHeader(session);
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;

	for (let attempt = 0; attempt < 2; attempt++) {
		const buildId = await getBuildId(attempt > 0);
		const url = `${BASE_URL}/_next/data/${buildId}${normalizedPath}`;
		const res = await fetch(url, {
			headers: {
				"user-agent": USER_AGENT,
				accept: "application/json, text/plain, */*",
				"x-nextjs-data": "1",
				referer: `${BASE_URL}${normalizedPath.replace(/\.json$/, "")}`,
				cookie,
			},
		});
		if (res.status === 404 && attempt === 0) continue; // buildId rotated, refresh and retry
		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new Error(`SSR fetch ${url}: ${res.status} ${text.slice(0, 300)}`);
		}
		return (await res.json()) as T;
	}
	throw new Error("SSR fetch failed after buildId refresh");
}
