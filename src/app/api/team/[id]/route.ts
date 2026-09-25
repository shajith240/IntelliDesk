// Update a member's role, active state, or name (admins only). Deactivating is
// used instead of deleting so ticket history and audit records stay intact.
import { NextRequest, NextResponse } from "next/server";
import { OPEN_STATUSES } from "@/lib/ticket-meta";
import { z } from "zod";
import { supabaseAdmin } from "@/server/db/supabase";
import { requireAuth } from "@/server/auth/helpers";
import { getOrgId } from "@/server/auth/org-context";
import { can, forbidden, notFound } from "@/server/auth/policy";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const updateMemberSchema = z
	.object({
		name: z.string().trim().min(2).max(100).optional(),
		role: z.enum(["admin", "agent", "viewer"]).optional(),
		is_active: z.boolean().optional(),
	})
	.strict()
	.refine((v) => Object.keys(v).length > 0, "Nothing to update");

export async function PATCH(
	req: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;
	if (!can.manageTeam(session)) return forbidden("Only admins can manage members");
	const orgId = getOrgId(session);

	const { id } = await params;
	if (!UUID_RE.test(id)) return notFound("Member not found");

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
	}
	const parsed = updateMemberSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
	}
	const updates = parsed.data;

	try {
		const { data: member, error: loadError } = await supabaseAdmin
			.from("users")
			.select("id, role, is_active")
			.eq("id", id)
			.eq("organization_id", orgId)
			.maybeSingle();
		if (loadError) throw loadError;
		if (!member) return notFound("Member not found");

		const losingAdmin =
			member.role === "admin" &&
			member.is_active &&
			((updates.role !== undefined && updates.role !== "admin") || updates.is_active === false);

		if (losingAdmin && id === session.user.id) {
			return NextResponse.json(
				{ error: "You can't remove your own admin access. Ask another admin to do it." },
				{ status: 400 },
			);
		}
		if (losingAdmin) {
			const { count, error: countError } = await supabaseAdmin
				.from("users")
				.select("id", { count: "exact", head: true })
				.eq("organization_id", orgId)
				.eq("role", "admin")
				.eq("is_active", true);
			if (countError) throw countError;
			if ((count ?? 0) <= 1) {
				return NextResponse.json(
					{ error: "A workspace must keep at least one active admin" },
					{ status: 400 },
				);
			}
		}

		// Tickets held by someone who can no longer work them go back to the unassigned pool.
		const loosesTickets = updates.is_active === false || updates.role === "viewer";
		if (loosesTickets) {
			const { data: held, error: heldError } = await supabaseAdmin
				.from("tickets")
				.select("id")
				.eq("organization_id", orgId)
				.eq("assigned_agent", id)
				.in("status", OPEN_STATUSES);
			if (heldError) throw heldError;
			// Through assign_ticket() so each release is recorded in the assignment history.
			for (const ticket of held ?? []) {
				const { error: releaseError } = await supabaseAdmin.rpc("assign_ticket", {
					p_org_id: orgId,
					p_ticket_id: ticket.id,
					p_assignee_id: null,
					p_actor_id: session.user.id,
					p_note: updates.is_active === false ? "Released: member deactivated" : "Released: member is now a viewer",
				});
				if (releaseError) throw releaseError;
			}
		}

		const { data, error } = await supabaseAdmin
			.from("users")
			.update(updates)
			.eq("id", id)
			.eq("organization_id", orgId)
			.select("id, name, email, role, is_active, is_available, last_login, created_at")
			.single();
		if (error) throw error;

		const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
			organization_id: orgId,
			action: "member_updated",
			details: { member_id: id, updates, released_tickets: loosesTickets },
			actor_user_id: session.user.id,
			actor_type: "user",
		});
		if (auditError) console.error("Audit log write failed:", auditError);

		return NextResponse.json({ member: data });
	} catch (error) {
		console.error("Update member error:", error);
		return NextResponse.json({ error: "Failed to update member" }, { status: 500 });
	}
}
