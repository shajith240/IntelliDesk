// Response send endpoint: sends an email via SMTP, marks the response as sent, and updates ticket SLA and status.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/db/supabase";
import { sendEmail, escapeHtml } from "@/server/email/smtp";
import { getMailbox, recordMailboxSync } from "@/server/email/mailbox";
import { requireAuth } from "@/server/auth/helpers";
import { getOrgId } from "@/server/auth/org-context";
import { can, forbidden, notFound } from "@/server/auth/policy";

export async function POST(req: NextRequest) {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;

	const orgId = getOrgId(session);

	try {
		const body = await req.json();
		const responseText =
			typeof body.response_text === "string"
				? body.response_text.trim()
				: "";

		if (!body.response_id && !body.ticket_id) {
			return NextResponse.json(
				{ error: "Missing response_id or ticket_id" },
				{ status: 400 },
			);
		}
		if (!responseText) {
			return NextResponse.json(
				{ error: "Response text cannot be empty" },
				{ status: 400 },
			);
		}
		if (responseText.length > 20000) {
			return NextResponse.json(
				{ error: "Response text is too long" },
				{ status: 400 },
			);
		}

		let responseQuery = supabaseAdmin
			.from("auto_responses")
			.select(
				`*,
        tickets(id, ticket_number, subject, assigned_agent),
        emails(id, from_address, from_name, message_id, subject)`,
			)
			.eq("organization_id", orgId)
			.eq("sent", false)
			.order("created_at", { ascending: false })
			.limit(1);

		if (body.response_id) {
			responseQuery = responseQuery.eq("id", body.response_id);
		} else {
			responseQuery = responseQuery.eq("ticket_id", body.ticket_id);
		}

		const { data: responses, error } = await responseQuery;
		const autoResponse = responses?.[0];
		if (error || !autoResponse) {
			return NextResponse.json(
				{ error: "No unsent response found for this ticket" },
				{ status: 404 },
			);
		}

		const ticket = autoResponse.tickets as {
			id: string;
			ticket_number: string;
			subject: string;
			assigned_agent: string | null;
		};
		if (!can.viewTicket(session, ticket)) return notFound("No unsent response found for this ticket");
		if (!can.workTicket(session, ticket)) {
			return forbidden("Only the assigned agent or an admin can send a reply on this ticket");
		}
		const email = autoResponse.emails as {
			from_address: string;
			message_id: string | null;
			subject: string;
		};

		let mailbox: Awaited<ReturnType<typeof getMailbox>> = null;
		try {
			mailbox = await getMailbox(orgId);
		} catch (err) {
			await recordMailboxSync(orgId, err instanceof Error ? err : new Error(String(err)));
		}
		if (!mailbox) {
			return NextResponse.json(
				{ error: "No working support mailbox is connected. An admin can connect one in Settings." },
				{ status: 409 },
			);
		}
		const { data: orgData } = await supabaseAdmin
			.from("organizations")
			.select("name")
			.eq("id", orgId)
			.single();

		const sent = await sendEmail({
			to: email.from_address,
			// Inbound subjects are untrusted; strip line breaks so they can't inject headers.
			subject: `Re: ${email.subject.replace(/[\r\n]+/g, " ")} [${ticket.ticket_number}]`,
			html: `<div style="font-family: Arial, sans-serif; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(responseText)}</div>`,
			text: responseText,
			inReplyTo: email.message_id || undefined,
			smtpConfig: mailbox.smtp,
			fromName: orgData?.name,
		});
		if (!sent) {
			await recordMailboxSync(orgId, new Error("SMTP send failed"));
			return NextResponse.json(
				{ error: "Email could not be sent. Check the organization's SMTP configuration." },
				{ status: 502 },
			);
		}

		const sentAt = new Date().toISOString();
		const { error: responseUpdateError } = await supabaseAdmin
			.from("auto_responses")
			.update({ sent: true, sent_at: sentAt, response_text: responseText })
			.eq("id", autoResponse.id)
			.eq("organization_id", orgId);
		if (responseUpdateError) throw responseUpdateError;

		const { data: ticketData, error: ticketLookupError } = await supabaseAdmin
			.from("tickets")
			.select("sla_first_response_at")
			.eq("id", ticket.id)
			.eq("organization_id", orgId)
			.single();
		if (ticketLookupError) throw ticketLookupError;

		const ticketUpdate: Record<string, string> = {
			status: "Resolved",
			sla_resolved_at: sentAt,
		};
		if (!ticketData.sla_first_response_at) {
			ticketUpdate.sla_first_response_at = sentAt;
		}
		const { error: ticketUpdateError } = await supabaseAdmin
			.from("tickets")
			.update(ticketUpdate)
			.eq("id", ticket.id)
			.eq("organization_id", orgId);
		if (ticketUpdateError) throw ticketUpdateError;

		const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
			organization_id: orgId,
			ticket_id: ticket.id,
			action: "response_sent",
			details: {
				response_id: autoResponse.id,
				to: email.from_address,
				edited: true,
			},
			performed_by: session.user.id,
			actor_user_id: session.user.id,
			actor_type: "user",
		});
		if (auditError) throw auditError;

		return NextResponse.json({
			success: true,
			message: "Response sent",
			ticket_id: ticket.id,
		});
	} catch (error) {
		console.error("Send response error:", error);
		return NextResponse.json(
			{ error: "Failed to send response" },
			{ status: 500 },
		);
	}
}
