import "server-only";
import { supabaseAdmin } from "@/server/db/supabase";
import { escapeHtml, newMessageId, sendEmail } from "@/server/email/smtp";
import { getMailbox, recordMailboxSync } from "@/server/email/mailbox";
import type { TicketStatus } from "@/types";

// Every message the team sends goes through here, whether an agent typed it or
// the AI answered automatically, so they all follow one protocol:
//
//   1. record the intent: a ticket_messages row with delivery_status 'sending'
//   2. hand the email to SMTP, with our own Message-ID so replies thread back
//   3. complete_ticket_reply(): outbound email row, 'sent', first-response time,
//      status change, AI-draft link and audit row, in one transaction
//
// SMTP can't take part in a database transaction, so step 1 exists to make a
// crash between 2 and 3 visible (a reply stuck in 'sending') instead of silent.

export type ReplyAuthor = { type: "agent"; userId: string } | { type: "ai" };

export class ReplyError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = "ReplyError";
	}
}

interface ThreadEmail {
	message_id: string | null;
	references_header: string[] | null;
	from_address: string;
	direction: "inbound" | "outbound";
}

interface ThreadRow {
	kind: "customer" | "reply" | "note";
	created_at: string;
	emails: ThreadEmail | null;
}

const MAX_REFERENCES = 20;

function replySubject(subject: string, ticketNumber: string): string {
	const base = subject.replace(/[\r\n]+/g, " ").replace(/^\s*((re|fwd?|aw)\s*:\s*)+/i, "").trim();
	return `Re: ${base || "Your request"} [${ticketNumber}]`;
}

export async function isAllowedTransition(from: TicketStatus, to: TicketStatus): Promise<boolean> {
	if (from === to) return true;
	const { data, error } = await supabaseAdmin
		.from("ticket_status_transitions")
		.select("to_status")
		.eq("from_status", from)
		.eq("to_status", to)
		.maybeSingle();
	if (error) throw error;
	return Boolean(data);
}

/** The statuses a ticket may move to next, read from the workflow table. */
export async function allowedNextStatuses(from: TicketStatus): Promise<TicketStatus[]> {
	const { data, error } = await supabaseAdmin
		.from("ticket_status_transitions")
		.select("to_status")
		.eq("from_status", from);
	if (error) throw error;
	return (data ?? []).map((row) => row.to_status as TicketStatus);
}

export interface SendReplyInput {
	orgId: string;
	ticketId: string;
	author: ReplyAuthor;
	/** Plain-text body; stored on the message and sent as the text part. */
	body: string;
	/** Optional HTML part. Defaults to the escaped text. */
	html?: string;
	statusAfter?: TicketStatus | null;
	/** The AI draft this reply was sent from, if any. */
	draftId?: string | null;
	/** Company name for the From header. */
	fromName?: string;
}

export interface SendReplyResult {
	messageId: string;
	status: TicketStatus;
	to: string;
}

export async function sendTicketReply(input: SendReplyInput): Promise<SendReplyResult> {
	const { orgId, ticketId, author } = input;
	const body = input.body.trim();
	if (!body) throw new ReplyError("Reply text cannot be empty", 400);

	const { data: ticket, error: ticketError } = await supabaseAdmin
		.from("tickets")
		.select("id, ticket_number, subject, status, contacts(email)")
		.eq("id", ticketId)
		.eq("organization_id", orgId)
		.maybeSingle();
	if (ticketError) throw ticketError;
	if (!ticket) throw new ReplyError("Ticket not found", 404);

	const currentStatus = ticket.status as TicketStatus;
	if (currentStatus === "Closed") {
		throw new ReplyError("This ticket is closed. A new message from the customer opens a follow-up ticket.", 409);
	}
	if (input.statusAfter && !(await isAllowedTransition(currentStatus, input.statusAfter))) {
		throw new ReplyError(`A ${currentStatus} ticket can't be set to ${input.statusAfter}`, 400);
	}

	// Thread headers point at the most recent email in the conversation, and the
	// reply goes to whoever last wrote in.
	const { data: thread, error: threadError } = await supabaseAdmin
		.from("ticket_messages")
		.select("kind, created_at, emails(message_id, references_header, from_address, direction)")
		.eq("ticket_id", ticketId)
		.eq("organization_id", orgId)
		.not("email_id", "is", null)
		.order("created_at", { ascending: false })
		.limit(20);
	if (threadError) throw threadError;

	const rows = (thread ?? []) as unknown as ThreadRow[];
	const parent = rows.find((row) => row.emails?.message_id)?.emails ?? null;
	const lastCustomer = rows.find((row) => row.kind === "customer" && row.emails)?.emails ?? null;
	const contact = ticket.contacts as unknown as { email: string } | null;
	const to = lastCustomer?.from_address ?? contact?.email ?? null;
	if (!to) throw new ReplyError("This ticket has no customer email address to reply to", 409);

	const references = parent?.message_id
		? [...(parent.references_header ?? []), parent.message_id].slice(-MAX_REFERENCES)
		: [];

	let mailbox: Awaited<ReturnType<typeof getMailbox>> = null;
	try {
		mailbox = await getMailbox(orgId);
	} catch (err) {
		await recordMailboxSync(orgId, err instanceof Error ? err : new Error(String(err)));
	}
	if (!mailbox) {
		throw new ReplyError("No working support mailbox is connected. An admin can connect one in Settings.", 409);
	}

	// 1. Record the intent.
	const { data: message, error: insertError } = await supabaseAdmin
		.from("ticket_messages")
		.insert({
			organization_id: orgId,
			ticket_id: ticketId,
			kind: "reply",
			author_type: author.type,
			author_user_id: author.type === "agent" ? author.userId : null,
			body_text: body,
			delivery_status: "sending",
		})
		.select("id")
		.single();
	if (insertError) throw insertError;

	// 2. Send.
	const subject = replySubject(ticket.subject, ticket.ticket_number);
	const html =
		input.html ??
		`<div style="font-family: Arial, sans-serif; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(body)}</div>`;
	const smtpMessageId = newMessageId(mailbox.settings.email, message.id);
	const sent = await sendEmail({
		to,
		subject,
		text: body,
		html,
		messageId: smtpMessageId,
		inReplyTo: parent?.message_id ?? undefined,
		references,
		smtpConfig: mailbox.smtp,
		fromName: input.fromName,
		automatic: author.type === "ai",
	});

	if (!sent.ok) {
		await supabaseAdmin
			.from("ticket_messages")
			.update({ delivery_status: "failed", delivery_error: sent.error.slice(0, 1000) })
			.eq("id", message.id);
		await recordMailboxSync(orgId, new Error(sent.error));
		throw new ReplyError("The email server rejected the message. Check the mailbox connection in Settings.", 502);
	}

	// 3. Record the outcome atomically.
	const { data: updated, error: completeError } = await supabaseAdmin.rpc("complete_ticket_reply", {
		p_org_id: orgId,
		p_message_id: message.id,
		p_smtp_message_id: sent.messageId || smtpMessageId,
		p_from_address: mailbox.settings.email,
		p_to_address: to,
		p_subject: subject,
		p_body_html: html,
		p_in_reply_to: parent?.message_id ?? null,
		p_references: references,
		p_status_after: input.statusAfter ?? null,
		p_draft_id: input.draftId ?? null,
	});
	if (completeError) {
		// The customer has the email; only our bookkeeping failed. Leave the row in
		// 'sending' so it is visible, and report success for the send itself.
		console.error("Reply sent but not recorded:", message.id, completeError.message);
		return { messageId: message.id, status: currentStatus, to };
	}

	return { messageId: message.id, status: (updated as { status: TicketStatus }).status, to };
}

export async function addInternalNote(input: {
	orgId: string;
	ticketId: string;
	userId: string;
	body: string;
}): Promise<{ messageId: string }> {
	const body = input.body.trim();
	if (!body) throw new ReplyError("Note text cannot be empty", 400);

	const { data, error } = await supabaseAdmin
		.from("ticket_messages")
		.insert({
			organization_id: input.orgId,
			ticket_id: input.ticketId,
			kind: "note",
			author_type: "agent",
			author_user_id: input.userId,
			body_text: body,
		})
		.select("id")
		.single();
	if (error) {
		// Composite FK: the ticket isn't in this organization.
		if (error.code === "23503") throw new ReplyError("Ticket not found", 404);
		throw error;
	}

	const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
		organization_id: input.orgId,
		ticket_id: input.ticketId,
		action: "note_added",
		details: { message_id: data.id },
		performed_by: input.userId,
		actor_user_id: input.userId,
		actor_type: "user",
	});
	if (auditError) console.error("Audit log write failed:", auditError.message);

	return { messageId: data.id };
}
