import { authPollLoop, authStart } from "../lib/auth-client.ts";
import { saveSession } from "../lib/config.ts";
import { log, output, outputError } from "../lib/output.ts";
import type { AuthType } from "../lib/types.ts";

export interface LoginOpts {
	phone: string;
	ssn: string;
	type: AuthType;
	json?: boolean;
}

export async function login(opts: LoginOpts): Promise<void> {
	if (!opts.phone) outputError("--phone is required (7-digit Icelandic mobile)");

	log(`Starting Audkenni ${opts.type} auth for +354${opts.phone}...`);
	const { authRequestId, setCookies } = await authStart({
		phoneNumber: opts.phone,
		ssn: opts.ssn,
		authType: opts.type,
	});
	log(`Confirm the request on your phone. (authRequestId: ${authRequestId})`);

	const session = await authPollLoop(authRequestId, setCookies, (msg) => log(`  ${msg}`));

	saveSession(session);
	if (opts.json) {
		output({ ok: true, sessionCookie: "kk_fe", saved: true });
	} else {
		log("Logged in. Session saved.");
	}
}
