import "server-only";
import { v4 as uuidv4 } from "uuid";
import { supabaseAdmin } from "@/server/db/supabase";
import { upsertVectors } from "@/server/db/pinecone";
import { classifyEmail, generateEmailEmbedding } from "@/server/gemini/classify";
import { generateAutoResponse } from "@/server/gemini/respond";
import { detectThread } from "@/server/email/thread-detector";
import { checkDuplicate } from "./deduplicator";
import { identifyCustomer } from "./customer-identifier";
import { cleanEmailBody, isLikelySpam, stripHtml } from "@/server/email/parser";
import { buildAutoResponseEmail } from "@/server/email/smtp";
import { ReplyError, sendTicketReply } from "@/server/tickets/replies";
import { detectAutomatedMail } from "@/server/email/automated";
import { decideAutoSend } from "./auto-reply-policy";
import { AiCallError, getAiContext, recordAiKeyFailure, type AiContext } from "@/server/gemini/client";
import { orgNamespace } from "@/server/auth/org-context";
import type { RawEmail, PipelineResult, ThreadDetectionResult } from "@/types";

/**
 * Main email processing pipeline.
 * Steps: Clean → Spam check → Embed → Dedup → Thread → Classify → Customer →
 *        record_inbound_message (the commit point) → Auto-response → Audit → mark processed
 *
 * Retry-safe: the email is marked processed only at the very end, and
 * record_inbound_message is idempotent per email, so a run that fails at any
 * step can be repeated by the intake queue without creating a second ticket.
 */
export interface ProcessEmailOptions {
	/** Id of an already-stored queue row: it is updated in place and excluded from dedup. */
	existingEmailId?: string;
	/** An admin marked this email "not spam": skip both spam filters. */
	notSpam?: boolean;
}

interface InboundResult {
	ticket_id: string;
	ticket_number: string;
	created: boolean;
	reopened: boolean;
}

export async function processEmail(
	rawEmail: RawEmail,
	orgId: string,
	options: ProcessEmailOptions = {},
): Promise<PipelineResult> {
	const startTime = Date.now();
	const emailId = options.existingEmailId ?? uuidv4();
	let ai: AiContext | null = null;

	try {
		// 0. Clean body (HTML-only mail is converted to text first)
		const plainBody = rawEmail.body_text?.trim()
			? rawEmail.body_text
			: rawEmail.body_html
				? stripHtml(rawEmail.body_html)
				: "";
		const cleanBody = cleanEmailBody(plainBody);

		// 0b. Machine-generated mail. Our own messages, bounces and out-of-office
		//     replies are stored but never ticketed (answering them is how mail
		//     loops start). Newsletters and no-reply senders are ticketed but
		//     never answered automatically.
		const { data: mailbox } = await supabaseAdmin
			.from("mailbox_connections")
			.select("email_address")
			.eq("organization_id", orgId)
			.maybeSingle();
		const automated = detectAutomatedMail(rawEmail, mailbox?.email_address ?? null);
		if (automated && automated.kind !== "bulk") {
			console.log(`[Pipeline] Ignoring ${automated.kind} email ${emailId}: ${automated.reason}`);
			const result = await saveEmailToDb(emailId, rawEmail, orgId, { processed: true, processing_error: null });
			return {
				email_id: result,
				status: "ignored",
				message: `Not ticketed: ${automated.reason}`,
				processing_time_ms: Date.now() - startTime,
			};
		}

		// 1. Quick local spam check (no API call)
		const spamCheck =
			!options.notSpam &&
			isLikelySpam(
				rawEmail.subject,
				cleanBody,
				rawEmail.from_address,
			);
		if (spamCheck) {
			console.log(`[Pipeline] Local spam filter matched email ${emailId}`);
			const result = await saveEmailToDb(emailId, rawEmail, orgId, {
				is_spam: true,
				processed: true,
			});
			return {
				email_id: result,
				status: "spam",
				message: "Email flagged as spam by local filter",
				processing_time_ms: Date.now() - startTime,
			};
		}

		// 2. Generate embedding for dedup and search (on the workspace's own AI key if it has one)
		ai = await getAiContext(orgId);
		const embedding = await generateEmailEmbedding(ai, rawEmail.subject, cleanBody);

		// 3. Duplicates. The exact same message delivered twice (same Message-ID)
		//    is dropped. A near-identical email from the same sender is usually the
		//    customer writing again, so it is attached to the earlier email's
		//    ticket instead of being thrown away.
		const dupResult = await checkDuplicate(
			rawEmail.message_id,
			rawEmail.from_address,
			embedding,
			new Date(rawEmail.received_at),
			orgId,
			options.existingEmailId,
		);

		if (dupResult.is_duplicate && dupResult.method === "message_id") {
			console.log(`[Pipeline] Duplicate delivery of email ${emailId}`);
			const result = await saveEmailToDb(emailId, rawEmail, orgId, {
				processed: true,
			});
			return {
				email_id: result,
				status: "duplicate",
				message: "Duplicate delivery (same Message-ID)",
				processing_time_ms: Date.now() - startTime,
			};
		}

		// 4. Thread detection
		let threadResult: ThreadDetectionResult = await detectThread(
			orgId,
			rawEmail.message_id,
			rawEmail.in_reply_to || null,
			rawEmail.references || [],
			rawEmail.from_address,
			rawEmail.subject,
			cleanBody,
			new Date(rawEmail.received_at),
		);
		if (!threadResult.existing_ticket_id && dupResult.is_duplicate && dupResult.duplicate_of) {
			const { data: earlier } = await supabaseAdmin
				.from("ticket_messages")
				.select("ticket_id")
				.eq("organization_id", orgId)
				.eq("email_id", dupResult.duplicate_of)
				.maybeSingle();
			if (earlier) {
				threadResult = {
					is_thread: true,
					existing_ticket_id: earlier.ticket_id,
					thread_type: "near_duplicate",
					confidence: dupResult.similarity_score,
					matched_email_id: dupResult.duplicate_of,
				};
			}
		}

		// 5. AI Classification (1 Gemini call)
		const classification = await classifyEmail(
			ai,
			rawEmail.subject,
			cleanBody,
			rawEmail.from_address,
			rawEmail.from_name,
		);

		// 5b. Skip ticket creation for AI-flagged spam/irrelevant emails
		if (classification.is_spam && !options.notSpam) {
			console.log(
				`[Pipeline] AI flagged email ${emailId} as spam (confidence: ${classification.confidence})`,
			);
			await saveEmailToDb(emailId, rawEmail, orgId, {
				is_spam: true,
				language: classification.language,
				processed: true,
			});
			return {
				email_id: emailId,
				status: "spam",
				message: `AI classified as spam: ${classification.reasoning}`,
				processing_time_ms: Date.now() - startTime,
			};
		}

		// 6. Customer identification
		const customer = await identifyCustomer(
			rawEmail.from_address,
			rawEmail.from_name,
			cleanBody,
			orgId,
		);

		// 7. Store the email (still unprocessed until every step below succeeds)
		const savedEmailId = await saveEmailToDb(emailId, rawEmail, orgId, {
			is_spam: false,
			language: classification.language,
			processed: false,
		});

		// 8. Store embedding in Pinecone (upsert by id: safe to repeat)
		await upsertVectors(orgNamespace(orgId, "emails"), [
			{
				id: savedEmailId,
				values: embedding,
				metadata: {
					from_address: rawEmail.from_address,
					category: classification.category,
					severity: classification.severity,
					timestamp: Math.floor(
						new Date(rawEmail.received_at).getTime() / 1000,
					),
				},
			},
		]);

		// 9. Commit point: append to the matched ticket (reopening it if needed),
		//    open a follow-up for a Closed one, or create a new ticket. One
		//    transaction, idempotent per email.
		const aiClassification = {
			category: classification.category,
			severity: classification.severity,
			confidence: classification.confidence,
			sentiment: classification.sentiment,
			language: classification.language,
			is_spam: classification.is_spam,
			summary: classification.summary,
			reasoning: classification.reasoning,
			key_entities: classification.key_entities,
			suggested_tags: classification.suggested_tags,
			requires_human_review: classification.requires_human_review,
		};
		const { data: inboundRows, error: inboundError } = await supabaseAdmin.rpc("record_inbound_message", {
			p_org_id: orgId,
			p_email_id: savedEmailId,
			p_body: cleanBody || plainBody,
			p_thread_ticket_id: threadResult.existing_ticket_id,
			p_new_ticket: {
				subject: rawEmail.subject,
				summary: classification.summary,
				severity: classification.severity,
				category: classification.category,
				subcategory: classification.subcategory || null,
				contact_id: customer.contact_id || null,
				account_id: customer.account_id || null,
				ai_confidence: classification.confidence,
				is_flagged_for_review: classification.requires_human_review || false,
				ai_classification: aiClassification,
			},
		});
		if (inboundError) throw new Error(`Failed to record the email on a ticket: ${inboundError.message}`);
		const inbound = (inboundRows as InboundResult[])[0];
		const ticketId = inbound.ticket_id;
		const ticketNumber = inbound.ticket_number;

		if (inbound.created) {
			await upsertVectors(orgNamespace(orgId, "tickets"), [
				{
					id: ticketId,
					values: embedding,
					metadata: {
						category: classification.category,
						severity: classification.severity,
						account_id: customer.account_id || "",
						timestamp: Math.floor(Date.now() / 1000),
					},
				},
			]);
		}

		// 10. Auto-response: only for a ticket this run created. A customer
		//     writing back on an existing conversation is answered by a person.
		let autoResponseSent = false;
		if (inbound.created) {
			autoResponseSent = await draftOrSendAutoResponse({
				ai,
				orgId,
				recipient: rawEmail.from_address,
				automatedReason: automated?.reason ?? null,
				ticketId,
				ticketNumber,
				emailId: savedEmailId,
				subject: rawEmail.subject,
				body: cleanBody,
				classification,
				customer,
			});
		}

		// 11. Audit log (full classification for the AI Analysis tab)
		await supabaseAdmin.from("audit_logs").insert({
			organization_id: orgId,
			ticket_id: ticketId,
			action: inbound.created ? "ticket_created" : "email_added",
			details: {
				email_id: savedEmailId,
				ai_classification: aiClassification,
				thread: threadResult.thread_type,
				reopened: inbound.reopened,
				customer: customer.method,
				auto_response_sent: autoResponseSent,
				processing_time_ms: Date.now() - startTime,
			},
			performed_by: "system",
			actor_type: "system",
		});

		// 12. Done: only now does the email leave the intake queue.
		const { error: doneError } = await supabaseAdmin
			.from("emails")
			.update({ processed: true, processing_error: null })
			.eq("id", savedEmailId);
		if (doneError) throw new Error(`Failed to mark the email processed: ${doneError.message}`);

		return {
			email_id: savedEmailId,
			ticket_id: ticketId,
			ticket_number: ticketNumber,
			status: "processed",
			classification,
			thread: threadResult,
			customer,
			auto_response_sent: autoResponseSent,
			message: `Email processed → ${inbound.created ? "created" : "added to"} ticket ${ticketNumber}`,
			processing_time_ms: Date.now() - startTime,
		};
	} catch (error) {
		console.error("Pipeline error:", error instanceof Error ? error.message : error);
		if (ai && error instanceof AiCallError) await recordAiKeyFailure(ai, error).catch(() => {});

		// Keep the email queued for a retry.
		await saveEmailToDb(emailId, rawEmail, orgId, {
			processed: false,
		}).catch(() => {});

		return {
			email_id: emailId,
			status: "error",
			message: `Processing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			processing_time_ms: Date.now() - startTime,
		};
	}
}

/**
 * Ask the AI for a knowledge-base answer. A confident match is emailed through
 * the same reply path agents use (recorded as an AI-authored message, ticket
 * set to Pending); anything else is stored as a draft for an agent.
 * Returns true when an email went out.
 */
async function draftOrSendAutoResponse(input: {
	ai: AiContext;
	orgId: string;
	recipient: string;
	automatedReason: string | null;
	ticketId: string;
	ticketNumber: string;
	emailId: string;
	subject: string;
	body: string;
	classification: Awaited<ReturnType<typeof classifyEmail>>;
	customer: Awaited<ReturnType<typeof identifyCustomer>>;
}): Promise<boolean> {
	const { orgId, ticketId, classification, customer } = input;
	const autoResponse = await generateAutoResponse(
		input.ai,
		input.subject,
		input.body,
		classification.category,
		classification.severity,
		customer.contact_name,
		customer.account_tier,
	);
	if (!autoResponse.should_respond || !autoResponse.response_text) return false;

	const { data: draft, error: draftError } = await supabaseAdmin
		.from("auto_responses")
		.insert({
			organization_id: orgId,
			ticket_id: ticketId,
			email_id: input.emailId,
			// The generator says auto/suggest; the table records how well the knowledge
			// base matched (perfect/partial). Writing "auto" here used to violate the
			// CHECK constraint, and because the error was ignored no draft was ever saved.
			match_type: autoResponse.response_type === "auto" ? "perfect" : "partial",
			response_text: autoResponse.response_text,
			match_score: autoResponse.confidence || 0,
			sent: false,
		})
		.select("id")
		.single();
	if (draftError) throw new Error(`Failed to store the AI draft: ${draftError.message}`);

	if (autoResponse.response_type !== "auto") return false;

	// A strong match is only *eligible*; the workspace's policy decides.
	const decision = await decideAutoSend({
		orgId,
		recipient: input.recipient,
		classification,
		automatedReason: input.automatedReason,
	});
	if (!decision.allowed) {
		console.log(`[Pipeline] Draft kept for review on ${input.ticketNumber}: ${decision.reason}`);
		return false;
	}

	const slaResponse = await getSlaResponseTime(classification.severity, orgId);
	const companyName = await getOrgName(orgId);
	const email = buildAutoResponseEmail(
		customer.contact_name || "Customer",
		input.ticketNumber,
		slaResponse,
		autoResponse.response_text,
		input.subject,
		companyName,
	);
	try {
		await sendTicketReply({
			orgId,
			ticketId,
			author: { type: "ai" },
			body: email.text,
			html: email.html,
			statusAfter: "Pending",
			draftId: draft.id,
			fromName: companyName,
		});
		return true;
	} catch (err) {
		// The draft stays unsent, so an agent sees it and can send it by hand.
		if (err instanceof ReplyError) {
			console.warn(`[Pipeline] Auto-response not sent for ${input.ticketNumber}: ${err.message}`);
			return false;
		}
		throw err;
	}
}

async function saveEmailToDb(
	emailId: string,
	rawEmail: RawEmail,
	orgId: string,
	extra: Record<string, unknown>,
): Promise<string> {
	const { data, error } = await supabaseAdmin
		.from("emails")
		.upsert({
			id: emailId,
			organization_id: orgId,
			message_id: rawEmail.message_id,
			from_address: rawEmail.from_address,
			from_name: rawEmail.from_name,
			to_address: rawEmail.to_address,
			cc: rawEmail.cc || null,
			subject: rawEmail.subject,
			body_text: rawEmail.body_text,
			body_html: rawEmail.body_html,
			received_at: rawEmail.received_at,
			in_reply_to: rawEmail.in_reply_to || null,
			references_header: rawEmail.references || [],
			raw_headers: (rawEmail.raw_headers || {}) as Record<string, unknown>,
			...extra,
		})
		.select("id")
		.single();

	if (error) throw new Error(`Failed to save email: ${error.message}`);
	return data!.id;
}

async function getSlaResponseTime(severity: string, orgId: string): Promise<string> {
	// Two rows can match (org override + global default); never .single() this.
	const { data } = await supabaseAdmin
		.from("sla_policies")
		.select("organization_id, first_response_minutes")
		.eq("severity", severity)
		.or(`organization_id.eq.${orgId},organization_id.is.null`);

	if (!data || data.length === 0) return "24 hours";

	const orgPolicy = data.find((p) => p.organization_id === orgId);
	const minutes = (orgPolicy ?? data[0]).first_response_minutes;
	if (minutes < 60) return `${minutes} minutes`;
	if (minutes < 1440) return `${Math.round(minutes / 60)} hours`;
	return `${Math.round(minutes / 1440)} days`;
}

async function getOrgName(orgId: string): Promise<string> {
	const { data } = await supabaseAdmin.from("organizations").select("name").eq("id", orgId).maybeSingle();
	return data?.name ?? "Support";
}

/**
 * Process multiple emails in bulk with rate limiting
 */
export async function processEmailBatch(
	emails: RawEmail[],
	orgId: string,
	delayMs: number = 4000,
): Promise<PipelineResult[]> {
	const results: PipelineResult[] = [];

	for (let i = 0; i < emails.length; i++) {
		const result = await processEmail(emails[i], orgId);
		results.push(result);

		// Rate limit: small pause between emails to smooth API/DB load
		if (i < emails.length - 1) {
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}

	return results;
}
