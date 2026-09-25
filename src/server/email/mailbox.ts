import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ImapFlow } from "imapflow";
import { supabaseAdmin } from "@/server/db/supabase";
import { decryptSecret } from "@/server/crypto/secrets";
import { createSmtpTransport, type SmtpConfig } from "./smtp";
import type { ImapConfig } from "./imap";

// The only module that reads mailbox credentials. Everything else asks for a
// decrypted config here, so the plaintext app password exists in memory only
// for the duration of a poll or send.

export type MailboxProvider = "gmail" | "imap_smtp";

export interface MailboxSettings {
	provider: MailboxProvider;
	email: string;
	username: string;
	imapHost: string;
	imapPort: number;
	smtpHost: string;
	smtpPort: number;
}

export interface MailboxConfig {
	settings: MailboxSettings;
	imap: ImapConfig;
	smtp: SmtpConfig;
}

export const GMAIL_SETTINGS = {
	imapHost: "imap.gmail.com",
	imapPort: 993,
	smtpHost: "smtp.gmail.com",
	smtpPort: 587,
} as const;

interface MailboxRow {
	organization_id: string;
	provider: MailboxProvider;
	email_address: string;
	username: string;
	imap_host: string;
	imap_port: number;
	smtp_host: string;
	smtp_port: number;
	secret_ciphertext: string;
}

const ROW_COLUMNS =
	"organization_id, provider, email_address, username, imap_host, imap_port, smtp_host, smtp_port, secret_ciphertext";

function toConfig(row: MailboxRow): MailboxConfig {
	const pass = decryptSecret(row.secret_ciphertext, row.organization_id);
	return {
		settings: {
			provider: row.provider,
			email: row.email_address,
			username: row.username,
			imapHost: row.imap_host,
			imapPort: row.imap_port,
			smtpHost: row.smtp_host,
			smtpPort: row.smtp_port,
		},
		imap: { host: row.imap_host, port: row.imap_port, auth: { user: row.username, pass } },
		smtp: { host: row.smtp_host, port: row.smtp_port, user: row.username, pass },
	};
}

/** Decrypted config for an organization's connected mailbox, or null if none. */
export async function getMailbox(organizationId: string): Promise<MailboxConfig | null> {
	const { data, error } = await supabaseAdmin
		.from("mailbox_connections")
		.select(ROW_COLUMNS)
		.eq("organization_id", organizationId)
		.neq("status", "disconnected")
		.maybeSingle();
	if (error) throw error;
	return data ? toConfig(data as MailboxRow) : null;
}

/** Every mailbox the poller should read. A row that fails to decrypt is marked as errored, not fatal. */
export async function listPollableMailboxes(): Promise<Array<{ organizationId: string; config: MailboxConfig }>> {
	const { data, error } = await supabaseAdmin
		.from("mailbox_connections")
		.select(ROW_COLUMNS)
		.neq("status", "disconnected");
	if (error) throw error;

	const result: Array<{ organizationId: string; config: MailboxConfig }> = [];
	for (const row of (data ?? []) as MailboxRow[]) {
		try {
			result.push({ organizationId: row.organization_id, config: toConfig(row) });
		} catch (err) {
			console.error("Mailbox credentials could not be decrypted for org", row.organization_id);
			await recordMailboxSync(row.organization_id, err instanceof Error ? err : new Error("Decryption failed"));
		}
	}
	return result;
}

/** Record the outcome of a poll/send so admins can see a broken connection in Settings. */
export async function recordMailboxSync(organizationId: string, failure?: Error): Promise<void> {
	const update = failure
		? { status: "error", last_error: describeMailboxError(failure).slice(0, 1000) }
		: { status: "active", last_error: null, last_synced_at: new Date().toISOString() };
	const { error } = await supabaseAdmin
		.from("mailbox_connections")
		.update(update)
		.eq("organization_id", organizationId);
	if (error) console.error("Mailbox status update failed:", error.message);
}

// ---------------------------------------------------------------------------
// Validation before saving
// ---------------------------------------------------------------------------

const PRIVATE_V4: Array<[number, number]> = [
	[0x00000000, 8], // 0.0.0.0/8
	[0x0a000000, 8], // 10.0.0.0/8
	[0x64400000, 10], // 100.64.0.0/10 (CGNAT)
	[0x7f000000, 8], // 127.0.0.0/8
	[0xa9fe0000, 16], // 169.254.0.0/16 (link-local, cloud metadata)
	[0xac100000, 12], // 172.16.0.0/12
	[0xc0a80000, 16], // 192.168.0.0/16
	[0xe0000000, 3], // 224.0.0.0/3 (multicast, reserved)
];

function isPrivateAddress(address: string): boolean {
	if (isIP(address) === 4) {
		const n = address.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
		return PRIVATE_V4.some(([net, bits]) => (n >>> (32 - bits)) === (net >>> (32 - bits)));
	}
	const a = address.toLowerCase();
	if (a.startsWith("::ffff:")) return isPrivateAddress(a.slice(7));
	return a === "::" || a === "::1" || a.startsWith("fc") || a.startsWith("fd") || a.startsWith("fe8") ||
		a.startsWith("fe9") || a.startsWith("fea") || a.startsWith("feb");
}

/**
 * Custom IMAP/SMTP hosts are chosen by a workspace admin and then connected to
 * from our servers, so they must resolve only to public addresses; otherwise
 * the mailbox form becomes a way to probe internal networks (SSRF).
 */
export async function assertPublicMailHost(host: string): Promise<void> {
	if (isIP(host)) throw new MailboxInputError("Use the mail server's hostname, not an IP address.");
	if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(host)) {
		throw new MailboxInputError(`"${host}" isn't a valid hostname.`);
	}
	let addresses: Array<{ address: string }>;
	try {
		addresses = await lookup(host, { all: true, verbatim: true });
	} catch {
		throw new MailboxInputError(`Couldn't find the mail server "${host}". Check the hostname.`);
	}
	if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
		throw new MailboxInputError(`"${host}" doesn't resolve to a public mail server.`);
	}
}

export class MailboxInputError extends Error {}

/** Map low-level IMAP/SMTP failures to messages an admin can act on. */
export function describeMailboxError(error: Error & { code?: string; responseCode?: number; authenticationFailed?: boolean }): string {
	const text = `${error.message} ${error.code ?? ""}`;
	if (error.authenticationFailed || error.responseCode === 535 || /AUTHENTICATIONFAILED|Invalid credentials|Username and Password not accepted|EAUTH/i.test(text)) {
		return "The mail server rejected the sign-in. For Gmail, use a 16-character app password (requires 2-Step Verification), not your normal password.";
	}
	if (/ENOTFOUND|EAI_AGAIN/i.test(text)) return "The mail server's hostname couldn't be found.";
	if (/ECONNREFUSED|ETIMEDOUT|ESOCKET|timeout/i.test(text)) return "Couldn't reach the mail server on that port. Check the host and port.";
	if (/certificate|self.signed|TLS|SSL/i.test(text)) return "The mail server's TLS certificate couldn't be verified.";
	if (/Unrecognized secret format|MAILBOX_ENCRYPTION_KEY|decrypt|Unsupported state/i.test(text)) {
		return "Stored credentials can't be decrypted. Reconnect the mailbox.";
	}
	return "The mail server returned an unexpected error. Try again, then reconnect the mailbox if it persists.";
}

/** Log in over IMAP and SMTP with the given credentials. Nothing is stored. */
export async function verifyMailboxCredentials(imap: ImapConfig, smtp: SmtpConfig): Promise<void> {
	const client = new ImapFlow({
		host: imap.host,
		port: imap.port,
		secure: true,
		auth: imap.auth,
		logger: false,
		greetingTimeout: 15_000,
		socketTimeout: 20_000,
		tls: { rejectUnauthorized: true },
	});
	client.on("error", () => {
		// Connection errors surface through connect(); this only prevents an unhandled 'error' event.
	});
	try {
		await client.connect();
	} finally {
		await client.logout().catch(() => client.close());
	}
	await createSmtpTransport(smtp).verify();
}
