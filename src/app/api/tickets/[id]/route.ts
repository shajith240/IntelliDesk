// Ticket detail (GET) and field updates (PATCH). Assignment has its own route
// (./assign) because only admins may do it and it must write history atomically.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/db/supabase";
import { getTicketSLAStatus } from "@/server/pipeline/sla-tracker";
import { requireAuth } from "@/server/auth/helpers";
import { getOrgId } from "@/server/auth/org-context";
import { can, forbidden, notFound } from "@/server/auth/policy";
import { allowedNextStatuses } from "@/server/tickets/replies";
import type { TicketStatus } from "@/types";

const STATUSES = ["New", "In Progress", "Pending", "Resolved", "Closed"] as const;
const SEVERITIES = ["P1", "P2", "P3", "P4"] as const;
const CATEGORIES = [
	"Technical Support",
	"Access Request",
	"Billing/Invoice",
	"Feature Request",
	"Hardware/Infrastructure",
	"How-To/Documentation",
	"Data Request",
	"Complaint/Escalation",
	"General Inquiry",
] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
	_req: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;
	const orgId = getOrgId(session);

	const { id } = await params;
	if (!UUID_RE.test(id)) return notFound("Ticket not found");

	try {
		const { data: ticket, error } = await supabaseAdmin
			.from("tickets")
			.select(
				`
        *,
        contacts(id, name, email, role, phone),
        accounts(id, company_name, domain, tier),
        ticket_messages(
          id, kind, author_type, author_user_id, body_text, delivery_status, delivery_error, created_at,
          users(id, name),
          emails(from_address, from_name, to_address, subject, language)
        ),
        auto_responses(id, match_type, response_text, match_score, sent, sent_message_id, created_at)
      `,
			)
			.eq("id", id)
			.eq("organization_id", orgId)
			.maybeSingle();

		if (error) throw error;
		// Agents get the same 404 for "doesn't exist" and "not assigned to you".
		if (!ticket || !can.viewTicket(session, ticket)) return notFound("Ticket not found");

		const [slaStatus, nextStatuses, parent] = await Promise.all([
			getTicketSLAStatus(id),
			allowedNextStatuses(ticket.status as TicketStatus),
			ticket.follow_up_of
				? supabaseAdmin
						.from("tickets")
						.select("id, ticket_number")
						.eq("id", ticket.follow_up_of)
						.eq("organization_id", orgId)
						.maybeSingle()
						.then(({ data }) => data)
				: Promise.resolve(null),
		]);

		let similarQuery = supabaseAdmin
			.from("tickets")
			.select("id, ticket_number, subject, severity, status, created_at")
			.eq("organization_id", orgId)
			.eq("category", ticket.category)
			.neq("id", id)
			.order("created_at", { ascending: false })
			.limit(5);
		if (!can.viewAllTickets(session)) {
			similarQuery = similarQuery.eq("assigned_agent", session.user.id);
		}
		const { data: relatedTickets } = await similarQuery;

		return NextResponse.json({
			ticket: { ...ticket, follow_up_parent: parent },
			sla: slaStatus,
			allowed_statuses: nextStatuses,
			similar_tickets: relatedTickets || [],
		});
	} catch (error) {
		console.error("Get ticket error:", error);
		return NextResponse.json({ error: "Failed to fetch ticket" }, { status: 500 });
	}
}

export async function PATCH(
	req: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;
	const orgId = getOrgId(session);

	const { id } = await params;
	if (!UUID_RE.test(id)) return notFound("Ticket not found");

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
	}
	if (!body || typeof body !== "object" || Array.isArray(body)) {
		return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
	}
	const input = body as Record<string, unknown>;

	try {
		const { data: current, error: loadError } = await supabaseAdmin
			.from("tickets")
			.select("id, status, assigned_agent")
			.eq("id", id)
			.eq("organization_id", orgId)
			.maybeSingle();
		if (loadError) throw loadError;
		if (!current || !can.viewTicket(session, current)) return notFound("Ticket not found");
		if (!can.workTicket(session, current)) {
			return forbidden("Only the assigned agent or an admin can change this ticket");
		}

		// Assignment and SLA timestamps are never writable here: assignment goes
		// through /assign (admin, audited); SLA timestamps are set by the system.
		for (const field of ["assigned_agent", "sla_first_response_at", "sla_resolved_at", "organization_id", "ticket_number"]) {
			if (field in input) {
				return NextResponse.json({ error: `"${field}" cannot be changed here` }, { status: 400 });
			}
		}

		const updates: Record<string, unknown> = {};

		if (input.status !== undefined) {
			if (!STATUSES.includes(input.status as (typeof STATUSES)[number])) {
				return NextResponse.json({ error: "Invalid status" }, { status: 400 });
			}
			updates.status = input.status;
		}
		if (input.severity !== undefined) {
			if (!SEVERITIES.includes(input.severity as (typeof SEVERITIES)[number])) {
				return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
			}
			updates.severity = input.severity;
		}
		if (input.category !== undefined) {
			if (!CATEGORIES.includes(input.category as (typeof CATEGORIES)[number])) {
				return NextResponse.json({ error: "Invalid category" }, { status: 400 });
			}
			updates.category = input.category;
		}
		if (input.assigned_team_id !== undefined) {
			if (!can.assignTickets(session)) return forbidden("Only admins can change the team");
			if (input.assigned_team_id !== null && (typeof input.assigned_team_id !== "string" || !UUID_RE.test(input.assigned_team_id))) {
				return NextResponse.json({ error: "Invalid team" }, { status: 400 });
			}
			updates.assigned_team_id = input.assigned_team_id;
		}

		if (Object.keys(updates).length === 0) {
			return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
		}

		// The resolution timestamp and the allowed status transitions are enforced
		// by the enforce_ticket_status trigger (migration 009), not here.
		const { data, error } = await supabaseAdmin
			.from("tickets")
			.update(updates)
			.eq("id", id)
			.eq("organization_id", orgId)
			.select()
			.single();

		if (error) {
			// Composite FK: team must belong to this organization.
			if (error.code === "23503") return NextResponse.json({ error: "Invalid team" }, { status: 400 });
			if (error.code === "23514" && error.hint === "invalid_status_transition") {
				return NextResponse.json({ error: `A ${current.status} ticket can't be set to ${updates.status}` }, { status: 400 });
			}
			throw error;
		}

		const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
			organization_id: orgId,
			ticket_id: id,
			action: "ticket_updated",
			details: { updates },
			performed_by: session.user.id,
			actor_user_id: session.user.id,
			actor_type: "user",
		});
		if (auditError) console.error("Audit log write failed:", auditError);

		return NextResponse.json({ ticket: data });
	} catch (error) {
		console.error("Update ticket error:", error);
		return NextResponse.json({ error: "Failed to update ticket" }, { status: 500 });
	}
}
