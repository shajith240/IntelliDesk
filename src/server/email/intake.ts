import "server-only";
import { supabaseAdmin } from "@/server/db/supabase";
import { processEmail } from "@/server/pipeline/processor";
import { fetchUnseenMessages } from "./imap";
import { listPollableMailboxes, recordMailboxSync } from "./mailbox";
import type { RawEmail } from "@/types";

// Two-step intake:
//   1. ingest: fetch unseen mail and durably store each message as an
//      unprocessed row BEFORE marking it read in the mailbox;
//   2. drain: process stored rows until a time budget runs out.
// Nothing is lost if a run times out mid-way: unstored mail stays unread in the
// mailbox and stored-but-unprocessed rows are picked up by the next run.

/** A message that failed this many times is left for inspection instead of retried forever. */
export const MAX_PROCESSING_ATTEMPTS = 5;

/** Pause between messages so model calls stay under free-tier per-minute limits. */
const PACE_MS = 4_000;

export interface IntakeSummary {
	mailboxes: number;
	fetched: number;
	stored: number;
	mailboxErrors: number;
}

async function storeRawEmail(email: RawEmail, organizationId: string): Promise<void> {
	// Idempotent: a message re-fetched after an interrupted run is stored once.
	if (email.message_id) {
		const { data: existing, error } = await supabaseAdmin
			.from("emails")
			.select("id")
			.eq("organization_id", organizationId)
			.eq("message_id", email.message_id)
			.limit(1)
			.maybeSingle();
		if (error) throw error;
		if (existing) return;
	}
	const { error } = await supabaseAdmin.from("emails").insert({
		organization_id: organizationId,
		message_id: email.message_id,
		in_reply_to: email.in_reply_to || null,
		references_header: email.references || [],
		from_address: email.from_address,
		from_name: email.from_name,
		to_address: email.to_address,
		cc: email.cc || null,
		subject: email.subject,
		body_text: email.body_text,
		body_html: email.body_html,
		raw_headers: (email.raw_headers || {}) as Record<string, unknown>,
		received_at: email.received_at,
		processed: false,
	});
	if (error) throw error;
}

export async function ingestAllMailboxes(): Promise<IntakeSummary> {
	const mailboxes = await listPollableMailboxes();
	const summary: IntakeSummary = { mailboxes: mailboxes.length, fetched: 0, stored: 0, mailboxErrors: 0 };

	for (const { organizationId, config } of mailboxes) {
		try {
			const result = await fetchUnseenMessages(config.imap, (email) => storeRawEmail(email, organizationId));
			summary.fetched += result.fetched;
			summary.stored += result.stored;
			await recordMailboxSync(organizationId);
		} catch (err) {
			summary.mailboxErrors++;
			await recordMailboxSync(organizationId, err instanceof Error ? err : new Error(String(err)));
		}
	}
	return summary;
}

export interface DrainSummary {
	processed: number;
	failed: number;
	remaining: boolean;
}

interface QueuedEmailRow {
	id: string;
	organization_id: string;
	message_id: string | null;
	in_reply_to: string | null;
	references_header: string[] | null;
	from_address: string;
	from_name: string | null;
	to_address: string | null;
	cc: string | null;
	subject: string;
	body_text: string | null;
	body_html: string | null;
	raw_headers: Record<string, string> | null;
	received_at: string;
	processing_attempts: number;
}

/**
 * Process stored, unprocessed emails oldest-first until `deadline` (epoch ms).
 * Each row is claimed with a compare-and-set on processing_attempts, so two
 * overlapping runs never process the same email twice.
 */
export async function drainIntakeQueue(deadline: number): Promise<DrainSummary> {
	const summary: DrainSummary = { processed: 0, failed: 0, remaining: false };

	const { data: rows, error } = await supabaseAdmin
		.from("emails")
		.select(
			"id, organization_id, message_id, in_reply_to, references_header, from_address, from_name, to_address, cc, subject, body_text, body_html, raw_headers, received_at, processing_attempts",
		)
		.eq("processed", false)
		.lt("processing_attempts", MAX_PROCESSING_ATTEMPTS)
		.order("received_at", { ascending: true })
		.limit(50);
	if (error) throw error;

	for (const [index, row] of ((rows ?? []) as QueuedEmailRow[]).entries()) {
		if (Date.now() + PACE_MS > deadline) {
			summary.remaining = true;
			break;
		}

		const { data: claimed, error: claimError } = await supabaseAdmin
			.from("emails")
			.update({ processing_attempts: row.processing_attempts + 1, last_attempt_at: new Date().toISOString() })
			.eq("id", row.id)
			.eq("processed", false)
			.eq("processing_attempts", row.processing_attempts)
			.select("id")
			.maybeSingle();
		if (claimError) throw claimError;
		if (!claimed) continue; // another run took it

		const result = await processEmail(
			{
				message_id: row.message_id,
				in_reply_to: row.in_reply_to,
				references: row.references_header ?? [],
				from_address: row.from_address,
				from_name: row.from_name,
				to_address: row.to_address ?? "",
				cc: row.cc,
				subject: row.subject,
				body_text: row.body_text ?? "",
				body_html: row.body_html,
				raw_headers: row.raw_headers ?? {},
				received_at: new Date(row.received_at),
			},
			row.organization_id,
			{ existingEmailId: row.id },
		);

		if (result.status === "error") {
			summary.failed++;
			await supabaseAdmin
				.from("emails")
				.update({ processing_error: (result.message ?? "Processing failed").slice(0, 1000) })
				.eq("id", row.id);
		} else {
			summary.processed++;
			await supabaseAdmin.from("emails").update({ processing_error: null }).eq("id", row.id);
		}

		if (index < (rows?.length ?? 0) - 1) await new Promise((r) => setTimeout(r, PACE_MS));
	}
	if ((rows?.length ?? 0) === 50 && !summary.remaining) summary.remaining = true;
	return summary;
}
