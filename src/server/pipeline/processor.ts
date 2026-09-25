import "server-only";
import { v4 as uuidv4 } from "uuid";
import { supabaseAdmin } from "@/server/db/supabase";
import { upsertVectors } from "@/server/db/pinecone";
import { classifyEmail, generateEmailEmbedding } from "@/server/gemini/classify";
import { generateAutoResponse } from "@/server/gemini/respond";
import { detectThread } from "@/server/email/thread-detector";
import { checkDuplicate } from "./deduplicator";
import { identifyCustomer } from "./customer-identifier";
import {
	cleanEmailBody,
	isLikelySpam,
} from "@/server/email/parser";
import { sendEmail, buildAutoResponseEmail } from "@/server/email/smtp";
import { getMailbox, recordMailboxSync } from "@/server/email/mailbox";
import { orgNamespace } from "@/server/auth/org-context";
import type { RawEmail, PipelineResult } from "@/types";

/**
 * Main email processing pipeline.
 * Steps: Parse → Quick Spam Check → Dedup → Thread Detect → Classify → Customer ID → Auto-Response → Create/Update Ticket
 */
export interface ProcessEmailOptions {
	/** Id of an already-stored queue row: it is updated in place and excluded from dedup. */
	existingEmailId?: string;
}

export async function processEmail(
	rawEmail: RawEmail,
	orgId: string,
	options: ProcessEmailOptions = {},
): Promise<PipelineResult> {
	const startTime = Date.now();
	const emailId = options.existingEmailId ?? uuidv4();

	try {
		// 0. Clean body
		const cleanBody = cleanEmailBody(
			rawEmail.body_text || rawEmail.body_html || "",
		);

		// 1. Quick local spam check (no API call)
		const spamCheck = isLikelySpam(
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

		// 2. Generate embedding for dedup and search
		const embedding = await generateEmailEmbedding(rawEmail.subject, cleanBody);

		// 3. Check for duplicates
		const dupResult = await checkDuplicate(
			rawEmail.message_id,
			rawEmail.from_address,
			embedding,
			new Date(rawEmail.received_at),
			orgId,
			options.existingEmailId,
		);

		if (dupResult.is_duplicate) {
			console.log(
				`[Pipeline] Duplicate email ${emailId}: method=${dupResult.method} score=${dupResult.similarity_score.toFixed(2)}`,
			);
			const result = await saveEmailToDb(emailId, rawEmail, orgId, {
				processed: true,
			});
			return {
				email_id: result,
				status: "duplicate",
				message: `Duplicate detected (${dupResult.method}, score: ${dupResult.similarity_score.toFixed(2)})`,
				processing_time_ms: Date.now() - startTime,
			};
		}

		// 4. Thread detection
		const threadResult = await detectThread(
			rawEmail.message_id,
			rawEmail.in_reply_to || null,
			rawEmail.references || [],
			rawEmail.from_address,
			rawEmail.subject,
			cleanBody,
			new Date(rawEmail.received_at),
		);

		// 5. AI Classification (1 Gemini call)
		const classification = await classifyEmail(
			rawEmail.subject,
			cleanBody,
			rawEmail.from_address,
			rawEmail.from_name,
		);

		// 5b. Skip ticket creation for AI-flagged spam/irrelevant emails
		if (classification.is_spam) {
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

		// 7. Save email to database
		const savedEmailId = await saveEmailToDb(emailId, rawEmail, orgId, {
			is_spam: classification.is_spam,
			language: classification.language,
			processed: true,
		});

		// 8. Store embedding in Pinecone
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

		// 9. Create or update ticket
		let ticketId: string;
		let ticketNumber: string;

		if (threadResult.is_thread && threadResult.existing_ticket_id) {
			// Add to existing ticket
			ticketId = threadResult.existing_ticket_id;
			await supabaseAdmin.from("ticket_emails").insert({
				ticket_id: ticketId,
				email_id: savedEmailId,
				relationship: "reply",
			});

			// Update ticket severity if new email is higher priority
			const { data: existingTicket } = await supabaseAdmin
				.from("tickets")
				.select("severity, ticket_number")
				.eq("id", ticketId)
				.single();

			ticketNumber = existingTicket?.ticket_number || "";
			const severityOrder = { P1: 1, P2: 2, P3: 3, P4: 4 };
			if (
				existingTicket &&
				severityOrder[classification.severity] <
					severityOrder[existingTicket.severity as keyof typeof severityOrder]
			) {
				await supabaseAdmin
					.from("tickets")
					.update({ severity: classification.severity })
					.eq("id", ticketId);
			}
		} else {
			// Create new ticket
			const { data: newTicket } = await supabaseAdmin
				.from("tickets")
				.insert({
					organization_id: orgId,
					subject: rawEmail.subject,
					summary: classification.summary,
					status: "New",
					severity: classification.severity,
					category: classification.category,
					subcategory: classification.subcategory || null,
					contact_id: customer.contact_id || null,
					account_id: customer.account_id || null,
					ai_confidence: classification.confidence,
					is_flagged_for_review: classification.requires_human_review || false,
					ai_classification: {
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
					},
				})
				.select("id, ticket_number")
				.single();

			if (!newTicket) throw new Error("Failed to create ticket");
			ticketId = newTicket.id;
			ticketNumber = newTicket.ticket_number;

			// Link email to ticket
			await supabaseAdmin.from("ticket_emails").insert({
				ticket_id: ticketId,
				email_id: savedEmailId,
				relationship: "original",
			});

			// Store ticket embedding
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

		// 10. Auto-response (1 Gemini call - only for non-spam, P3/P4)
		let autoResponseSent = false;
		if (!classification.is_spam) {
			const autoResponse = await generateAutoResponse(
				rawEmail.subject,
				cleanBody,
				classification.category,
				classification.severity,
				customer.contact_name,
				customer.account_tier,
				orgId,
			);

			if (autoResponse.should_respond && autoResponse.response_text) {
				// Send first, then record what actually happened: a failed send must
				// stay unsent so an agent sees the draft and can send it manually.
				let sentOk = false;
				if (autoResponse.response_type === "auto") {
					const mailbox = await getMailbox(orgId).catch(() => null);
					if (mailbox) {
						const slaResponse = await getSlaResponseTime(classification.severity, orgId);
						const companyName = await getOrgName(orgId);
						const email = buildAutoResponseEmail(
							customer.contact_name || "Customer",
							ticketNumber,
							slaResponse,
							autoResponse.response_text,
							rawEmail.subject,
							companyName,
						);
						sentOk = await sendEmail({
							to: rawEmail.from_address,
							subject: email.subject,
							html: email.html,
							text: email.text,
							inReplyTo: rawEmail.message_id || undefined,
							smtpConfig: mailbox.smtp,
							fromName: companyName,
						});
						if (!sentOk) await recordMailboxSync(orgId, new Error("SMTP send failed"));
					}
				}

				await supabaseAdmin.from("auto_responses").insert({
					organization_id: orgId,
					ticket_id: ticketId,
					email_id: savedEmailId,
					match_type: autoResponse.response_type || "none",
					response_text: autoResponse.response_text,
					match_score: autoResponse.confidence || 0,
					sent: sentOk,
					sent_at: sentOk ? new Date().toISOString() : null,
				});
				autoResponseSent = sentOk;
			}
		}

		// 11. Audit log (store full classification for AI Analysis tab)
		await supabaseAdmin.from("audit_logs").insert({
			organization_id: orgId,
			ticket_id: ticketId,
			action: threadResult.is_thread ? "email_added" : "ticket_created",
			details: {
				email_id: savedEmailId,
				ai_classification: {
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
				},
				thread: threadResult.thread_type,
				customer: customer.method,
				auto_response_sent: autoResponseSent,
				processing_time_ms: Date.now() - startTime,
			},
			performed_by: "system",
			actor_type: "system",
		});

		return {
			email_id: savedEmailId,
			ticket_id: ticketId,
			ticket_number: ticketNumber,
			status: "processed",
			classification,
			thread: threadResult,
			customer,
			auto_response_sent: autoResponseSent,
			message: `Email processed → ${threadResult.is_thread ? "added to" : "created"} ticket ${ticketNumber}`,
			processing_time_ms: Date.now() - startTime,
		};
	} catch (error) {
		console.error("Pipeline error:", error);

		// Save failed email for retry
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
