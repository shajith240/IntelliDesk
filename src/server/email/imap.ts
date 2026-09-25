import "server-only";
import { ImapFlow } from "imapflow";
import { simpleParser, ParsedMail } from "mailparser";
import type { RawEmail } from "@/types";

export interface ImapConfig {
	host: string;
	port: number;
	auth: { user: string; pass: string };
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

/**
 * Fetch unseen INBOX messages from the last two days and hand each to `store`.
 * A message is marked \Seen only after `store` resolves, so a crash or timeout
 * between fetch and storage leaves it unread and it is fetched again next run
 * (at-least-once delivery; callers must make `store` idempotent).
 * Connection and login failures are thrown so the caller can record them.
 */
export async function fetchUnseenMessages(
	config: ImapConfig,
	store: (email: RawEmail) => Promise<void>,
): Promise<{ fetched: number; stored: number }> {
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
	client.on("error", (err: Error) => {
		// Surfaced through the awaited calls below; this only prevents an unhandled 'error' event.
		console.warn("[IMAP] Client error:", err.message);
	});

	let fetched = 0;
	let stored = 0;
	await client.connect();
	try {
		const lock = await client.getMailboxLock("INBOX");
		try {
			const since = new Date();
			since.setDate(since.getDate() - 2);

			// Collect first: imapflow must not run other commands (like setting
			// flags) while a FETCH stream is still being iterated.
			const pending: Array<{ uid: number; source: Buffer }> = [];
			for await (const msg of client.fetch({ seen: false, since }, { source: true, uid: true })) {
				if (msg.source) pending.push({ uid: msg.uid, source: msg.source });
			}
			fetched = pending.length;

			for (const { uid, source } of pending) {
				let email: RawEmail;
				try {
					email = parsedMailToRawEmail((await simpleParser(source)) as ParsedMail);
				} catch (err) {
					// Unparseable message: mark it read so it doesn't block every future run.
					console.error(`[IMAP] Could not parse UID ${uid}:`, (err as Error).message);
					await client.messageFlagsAdd({ uid }, ["\\Seen"], { uid: true }).catch(() => {});
					continue;
				}
				await store(email);
				stored++;
				await client.messageFlagsAdd({ uid }, ["\\Seen"], { uid: true });
			}
		} finally {
			lock.release();
		}
	} finally {
		await client.logout().catch(() => client.close());
	}
	return { fetched, stored };
}
