import { ApiError, GaeludyrClient } from "./client.ts";
import { loadSession } from "./config.ts";
import type { UserProfile } from "./types.ts";

export interface AuthCheckResult {
	authenticated: boolean;
	hasCachedSession: boolean;
	reason?: string;
	profile?: UserProfile;
}

function isUserProfile(value: unknown): value is UserProfile {
	if (!value || typeof value !== "object") return false;
	const obj = value as Partial<UserProfile>;
	return typeof obj.user_ssn === "string" && !!obj.shipping && !!obj.billing;
}

export async function checkAuth(): Promise<AuthCheckResult> {
	const session = loadSession();
	if (!session?.kk_fe) {
		return {
			authenticated: false,
			hasCachedSession: false,
			reason: 'No cached session. Run "gaeludyr login --phone <7-digit>".',
		};
	}

	try {
		const profile = await new GaeludyrClient().getProfile();
		if (!isUserProfile(profile)) {
			return {
				authenticated: false,
				hasCachedSession: true,
				reason: "Cached session did not return a valid user profile.",
			};
		}
		return { authenticated: true, hasCachedSession: true, profile };
	} catch (err) {
		if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
			return {
				authenticated: false,
				hasCachedSession: true,
				reason: `Cached session rejected by server (${err.status}). Run "gaeludyr login --phone <7-digit>".`,
			};
		}
		return {
			authenticated: false,
			hasCachedSession: true,
			reason: err instanceof Error ? err.message : String(err),
		};
	}
}

export async function requireValidAuth(action = "this command"): Promise<UserProfile> {
	const auth = await checkAuth();
	if (auth.authenticated && auth.profile) return auth.profile;
	throw new Error(
		`Cannot run ${action}: ${auth.reason ?? 'run "gaeludyr login --phone <7-digit>" first.'}`,
	);
}
