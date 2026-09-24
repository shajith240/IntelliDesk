import "server-only";
import Fuse from "fuse.js";
import { supabaseAdmin } from "@/server/db/supabase";
import { normalizeSubject, extractTicketReferences } from "./parser";
import type { ThreadDetectionResult } from "@/types";

/**
 * Detect if an incoming email belongs to an existing thread.
 * Priority: header match > ticket reference > subject+sender match > none
 */
export async function detectThread(
	messageId: string | null,
	inReplyTo: string | null,
	references: string[],
	fromAddress: string,
	subject: string,
	bodyText: string,
	receivedAt: Date,
): Promise<ThreadDetectionResult> {
	// 1. Header-based: match In-Reply-To to existing Message-ID
	if (inReplyTo) {
		const { data: parentEmail } = await supabaseAdmin
			.from("emails")
			.select("id, ticket_emails(ticket_id)")
			.eq("message_id", inReplyTo)
			.single();

		if (parentEmail) {
			const ticketLink = (
				parentEmail as unknown as { ticket_emails: { ticket_id: string }[] }
			).ticket_emails?.[0];
			return {
				is_thread: true,
				existing_ticket_id: ticketLink?.ticket_id || null,
				thread_type: "header",
				confidence: 1.0,
				matched_email_id: parentEmail.id,
			};
		}
	}

	// 1b. Check References header for any known message IDs
	if (references.length > 0) {
		const { data: refEmails } = await supabaseAdmin
			.from("emails")
			.select("id, ticket_emails(ticket_id)")
			.in("message_id", references)
			.limit(1);

		if (refEmails && refEmails.length > 0) {
			const ticketLink = (
				refEmails[0] as unknown as { ticket_emails: { ticket_id: string }[] }
			).ticket_emails?.[0];
			return {
				is_thread: true,
				existing_ticket_id: ticketLink?.ticket_id || null,
				thread_type: "header",
				confidence: 0.95,
				matched_email_id: refEmails[0].id,
			};
		}
	}

	// 2. Ticket reference in subject or body
	const allText = `${subject} ${bodyText}`;
	const ticketRefs = extractTicketReferences(allText);

	if (ticketRefs.length > 0) {
		for (const ref of ticketRefs) {
			// Try TKT- format first
			const tktMatch = ref.match(/TKT-\d{5}/i);
			if (tktMatch) {
				const { data: ticket } = await supabaseAdmin
					.from("tickets")
					.select("id")
					.eq("ticket_number", tktMatch[0].toUpperCase())
					.single();

				if (ticket) {
					return {
						is_thread: true,
						existing_ticket_id: ticket.id,
						thread_type: "ticket_ref",
						confidence: 0.95,
						matched_email_id: null,
					};
				}
			}
		}
	}

	// 3. Subject + sender fuzzy matching within 48 hours
	const normalized = normalizeSubject(subject);
	if (normalized.length > 3) {
		const cutoff = new Date(
			receivedAt.getTime() - 48 * 60 * 60 * 1000,
		).toISOString();

		const { data: recentEmails } = await supabaseAdmin
			.from("emails")
			.select("id, subject, from_address, ticket_emails(ticket_id)")
			.eq("from_address", fromAddress)
			.gte("received_at", cutoff)
			.eq("processed", true)
			.limit(20);

		if (recentEmails && recentEmails.length > 0) {
			const candidates = recentEmails.map(
				(e: {
					id: string;
					subject: string;
					from_address: string;
					ticket_emails?: { ticket_id: string }[];
				}) => ({
					...e,
					normalized_subject: normalizeSubject(e.subject),
				}),
			);

			const fuse = new Fuse(candidates, {
				keys: ["normalized_subject"],
				threshold: 0.3,
				includeScore: true,
			});

			const results = fuse.search(normalized);

			if (
				results.length > 0 &&
				results[0].score !== undefined &&
				results[0].score < 0.3
			) {
				const matched = results[0].item;
				const ticketLink = (
					matched as unknown as { ticket_emails: { ticket_id: string }[] }
				).ticket_emails?.[0];
				return {
					is_thread: true,
					existing_ticket_id: ticketLink?.ticket_id || null,
					thread_type: "subject_match",
					confidence: 1 - (results[0].score || 0),
					matched_email_id: matched.id,
				};
			}
		}
	}

	return {
		is_thread: false,
		existing_ticket_id: null,
		thread_type: "none",
		confidence: 0,
		matched_email_id: null,
	};
}
