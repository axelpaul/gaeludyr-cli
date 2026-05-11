import { clearSession } from "../lib/config.ts";
import { log, output } from "../lib/output.ts";

export function logout(opts: { json?: boolean }): void {
	clearSession();
	if (opts.json) output({ ok: true, cleared: true });
	else log("Session cleared.");
}
