import "server-only";
import { ImapFlow } from "imapflow";
import { simpleParser, ParsedMail } from "mailparser";
import type { RawEmail } from "@/types";

export interface ImapConfig {
	host: string;
	port: number;
	auth: { user: string; pass: string };
}

function getImapConfig(override?: ImapConfig): ImapConfig | null {
	if (override?.auth?.user && override?.auth?.pass) {
		return override;
	}
	// No fallback to env vars — orgs must connect Gmail through Settings
	return null;
}

function parsedMailToRawEmail(parsed: ParsedMail): RawEmail {
	const fromAddr = parsed.from?.value?.[0];
	const toAddr = parsed.to
		? Array.isArray(parsed.to)
			? parsed.to[0]?.value?.[0]?.address || ""
			: parsed.to?.value?.[0]?.address || ""
		: "";

	const refs = parsed.references
		? Array.isArray(parsed.references)
			? parsed.references
			: [parsed.references]
		: [];

	return {
		message_id: parsed.messageId || null,
		in_reply_to: parsed.inReplyTo || null,
		references: refs,
		from_address: fromAddr?.address || "",
		from_name: fromAddr?.name || null,
		to_address: toAddr,
		cc: parsed.cc
			? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc])
					.flatMap((c) => c.value.map((v) => v.address))
					.join(", ")
			: null,
		subject: parsed.subject || "(No Subject)",
		body_text: parsed.text || "",
		body_html: parsed.html || null,
		raw_headers: Object.fromEntries(parsed.headers),
		received_at: parsed.date || new Date(),
	};
}

// Track processed UIDs in memory to avoid re-fetching when \Seen flag fails to persist
const processedUIDs = new Set<number>();

export async function pollNewEmails(
	imapOverride?: ImapConfig,
): Promise<RawEmail[]> {
	const config = getImapConfig(imapOverride);
	if (!config) {
		return [];
	}

	const client = new ImapFlow({
		host: config.host,
		port: config.port,
		secure: true,
		auth: config.auth,
		logger: false,
		socketTimeout: 60000,
		greetingTimeout: 30000,
		tls: { rejectUnauthorized: true },
	});

	// Suppress uncaught socket errors from ImapFlow
	client.on("error", (err: Error) => {
		console.warn("[IMAP] Client error (suppressed):", err.message);
	});

	const emails: RawEmail[] = [];

	try {
		await client.connect();
		const lock = await client.getMailboxLock("INBOX");

		try {
			// Only fetch unseen emails from the last 2 days to avoid importing old inbox history
			const twoDaysAgo = new Date();
			twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

			const messages = client.fetch(
				{ seen: false, since: twoDaysAgo },
				{ source: true, envelope: true, uid: true },
			);

			for await (const msg of messages) {
				try {
					// Skip UIDs we've already processed (in case \Seen flag didn't persist)
					if (processedUIDs.has(msg.uid)) {
						console.log(`[IMAP] Skipping already-processed UID ${msg.uid}`);
						continue;
					}

					if (!msg.source) continue;
					const parsed = await simpleParser(msg.source);
					const rawEmail = parsedMailToRawEmail(parsed as ParsedMail);
					console.log(
						`[IMAP] Fetched: "${rawEmail.subject}" from ${rawEmail.from_address}`,
					);
					emails.push(rawEmail);

					// Remember this UID so we never re-process it
					processedUIDs.add(msg.uid);

					// Try to mark as seen (best-effort, may fail if connection drops)
					try {
						await client.messageFlagsAdd({ uid: msg.uid }, ["\\Seen"], {
							uid: true,
						});
					} catch {
						console.warn(`[IMAP] Failed to mark UID ${msg.uid} as seen`);
					}
				} catch (err) {
					console.error("[IMAP] Error parsing email UID", msg.uid, ":", err);
					// Still mark as processed to avoid infinite retries
					processedUIDs.add(msg.uid);
				}
			}
		} finally {
			lock.release();
		}
	} catch (err) {
		console.error("IMAP connection error:", (err as Error).message);
	} finally {
		await client.logout().catch(() => {});
	}

	console.log(`[IMAP] Poll complete: ${emails.length} email(s) fetched`);
	return emails;
}
