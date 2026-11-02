import { checkAuth } from "../lib/auth-state.ts";
import { log, output } from "../lib/output.ts";

export async function doctor(opts: { json?: boolean }): Promise<void> {
	const auth = await checkAuth();
	const result = {
		authenticated: auth.authenticated,
		hasCachedSession: auth.hasCachedSession,
		reason: auth.authenticated ? null : auth.reason,
		profileLoaded: auth.authenticated,
	};

	if (opts.json) {
		output(result);
		return;
	}

	if (result.authenticated) {
		log("Auth: OK. Cached Gæludýr session returned a valid profile.");
	} else {
		log(`Auth: NOT OK. ${result.reason}`);
	}
}
