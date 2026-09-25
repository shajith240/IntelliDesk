// Assign or unassign a ticket (admins only). Delegates to the assign_ticket()
// database function, which re-checks the admin rule and writes the ticket,
// assignment history and audit log in one transaction.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/db/supabase";
import { requireAuth } from "@/server/auth/helpers";
import { getOrgId } from "@/server/auth/org-context";
import { can, forbidden, notFound } from "@/server/auth/policy";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
	req: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;
	if (!can.assignTickets(session)) return forbidden("Only admins can assign tickets");
	const orgId = getOrgId(session);

	const { id } = await params;
	if (!UUID_RE.test(id)) return notFound("Ticket not found");

	let body: { assignee_id?: unknown; note?: unknown };
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
	}

	const assigneeId = body.assignee_id ?? null;
	if (assigneeId !== null && (typeof assigneeId !== "string" || !UUID_RE.test(assigneeId))) {
		return NextResponse.json({ error: "assignee_id must be a user id or null" }, { status: 400 });
	}
	const note = body.note ?? null;
	if (note !== null && (typeof note !== "string" || note.length > 500)) {
		return NextResponse.json({ error: "note must be a string of at most 500 characters" }, { status: 400 });
	}

	const { data, error } = await supabaseAdmin.rpc("assign_ticket", {
		p_org_id: orgId,
		p_ticket_id: id,
		p_assignee_id: assigneeId,
		p_actor_id: session.user.id,
		p_note: note,
	});

	if (error) {
		switch (error.code) {
			case "P0002": // no_data_found
				return notFound("Ticket not found");
			case "42501": // insufficient_privilege
				return forbidden("Only an active admin of this workspace can assign tickets");
			case "23514": // check_violation: assignee is not an active admin/agent here
			case "23503": // foreign_key_violation: assignee is in another organization
				return NextResponse.json(
					{ error: "Assignee must be an active admin or agent in this workspace" },
					{ status: 400 },
				);
			default:
				console.error("Assign ticket error:", error);
				return NextResponse.json({ error: "Failed to assign ticket" }, { status: 500 });
		}
	}

	return NextResponse.json({ ticket: data });
}
