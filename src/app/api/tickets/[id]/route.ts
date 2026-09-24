// Ticket detail endpoint: fetches a single ticket with relations (contacts, emails, responses, SLA status) and allows field updates.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/db/supabase";
import { getTicketSLAStatus } from "@/server/pipeline/sla-tracker";
import { requireAuth } from "@/server/auth/helpers";
import { getOrgId } from "@/server/auth/org-context";

export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;

	const orgId = getOrgId(session);

	try {
		const { id } = await params;

		// Get ticket with relations
		const { data: ticket, error } = await supabaseAdmin
			.from("tickets")
			.select(
				`
        *,
        contacts(id, name, email, role, phone),
        accounts(id, company_name, domain, tier),
        ticket_emails(
          email_id,
          relationship,
          emails(id, message_id, from_address, from_name, subject, body_text, body_html, received_at, language)
        ),
        auto_responses(id, match_type, response_text, match_score, sent, created_at)
      `,
			)
			.eq("id", id)
			.eq("organization_id", orgId)
			.single();

		if (error || !ticket) {
			return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
		}

		// Get SLA status
		const slaStatus = await getTicketSLAStatus(id);

		// AI classification is stored directly on the ticket as JSONB

		// Get similar tickets from the database using category match
		const { data: relatedTickets } = await supabaseAdmin
			.from("tickets")
			.select("id, ticket_number, subject, severity, status, created_at")
			.eq("organization_id", orgId)
			.eq("category", ticket.category)
			.neq("id", id)
			.order("created_at", { ascending: false })
			.limit(5);

		return NextResponse.json({
			ticket,
			sla: slaStatus,
			similar_tickets: relatedTickets || [],
		});
	} catch (error) {
		console.error("Get ticket error:", error);
		return NextResponse.json(
			{ error: "Failed to fetch ticket" },
			{ status: 500 },
		);
	}
}

export async function PATCH(
	req: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;

	const orgId = getOrgId(session);

	try {
		const { id } = await params;
		const body = await req.json();

		// Whitelist updatable fields
		const allowedFields = [
			"status",
			"severity",
			"category",
			"assigned_team",
			"assigned_agent",
			"sla_first_response_at",
			"sla_resolved_at",
		];

		const updates: Record<string, unknown> = {};
		for (const field of allowedFields) {
			if (body[field] !== undefined) {
				updates[field] = body[field];
			}
		}

		if (Object.keys(updates).length === 0) {
			return NextResponse.json(
				{ error: "No valid fields to update" },
				{ status: 400 },
			);
		}

		// Validate status
		if (updates.status !== undefined) {
			const validStatuses = ["New", "In Progress", "Resolved", "Closed"];
			if (!validStatuses.includes(updates.status as string)) {
				return NextResponse.json(
					{ error: "Invalid status" },
					{ status: 400 },
				);
			}
		}

		// Validate severity
		if (updates.severity !== undefined) {
			const validSeverities = ["P1", "P2", "P3", "P4"];
			if (!validSeverities.includes(updates.severity as string)) {
				return NextResponse.json(
					{ error: "Invalid priority" },
					{ status: 400 },
				);
			}
		}

		// Validate assigned_agent if provided
		if (updates.assigned_agent !== undefined && updates.assigned_agent !== null) {
			const assignedValue = updates.assigned_agent;
			if (typeof assignedValue !== "string") {
				return NextResponse.json(
					{ error: "Invalid assignee value" },
					{ status: 400 },
				);
			}

			const { data: assignee } = await supabaseAdmin
				.from("users")
				.select("id")
				.eq("id", assignedValue)
				.eq("organization_id", orgId)
				.eq("is_active", true)
				.maybeSingle();

			if (!assignee) {
				return NextResponse.json(
					{
						error:
							"Assignee must be an active member of your organization",
					},
					{ status: 400 },
				);
			}
		}

		// Auto-set resolved_at when status changes to resolved/closed
		if (
			updates.status === "Resolved" ||
			updates.status === "Closed"
		) {
			updates.sla_resolved_at = new Date().toISOString();
		}

		const { data, error } = await supabaseAdmin
			.from("tickets")
			.update(updates)
			.eq("id", id)
			.eq("organization_id", orgId)
			.select()
			.single();

		if (error) throw error;

		// Audit log
		await supabaseAdmin.from("audit_logs").insert({
			organization_id: orgId,
			entity_type: "ticket",
			entity_id: id,
			action: "ticket_updated",
			details: { updates, updated_by: session.user.id },
		});

		return NextResponse.json({ ticket: data });
	} catch (error) {
		console.error("Update ticket error:", error);
		return NextResponse.json(
			{ error: "Failed to update ticket" },
			{ status: 500 },
		);
	}
}
