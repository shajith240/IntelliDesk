// Assignee candidates for the admin's assign menu: active admins and agents,
// available people first, then by how many open tickets they already hold.
import { NextResponse } from "next/server";
import { OPEN_STATUSES } from "@/lib/ticket-meta";
import { supabaseAdmin } from "@/server/db/supabase";
import { requireAuth } from "@/server/auth/helpers";
import { getOrgId } from "@/server/auth/org-context";
import { can, forbidden } from "@/server/auth/policy";

export async function GET() {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;
	if (!can.assignTickets(session)) return forbidden();
	const orgId = getOrgId(session);

	try {
		const [membersResult, openResult] = await Promise.all([
			supabaseAdmin
				.from("users")
				.select("id, name, email, role, is_available")
				.eq("organization_id", orgId)
				.eq("is_active", true)
				.in("role", ["admin", "agent"]),
			supabaseAdmin
				.from("tickets")
				.select("assigned_agent")
				.eq("organization_id", orgId)
				.in("status", OPEN_STATUSES)
				.not("assigned_agent", "is", null),
		]);
		if (membersResult.error) throw membersResult.error;
		if (openResult.error) throw openResult.error;

		const openCounts = new Map<string, number>();
		for (const row of openResult.data ?? []) {
			const id = row.assigned_agent as string;
			openCounts.set(id, (openCounts.get(id) ?? 0) + 1);
		}

		const candidates = (membersResult.data ?? [])
			.map((m) => ({ ...m, open_tickets: openCounts.get(m.id) ?? 0 }))
			.sort(
				(a, b) =>
					Number(b.is_available) - Number(a.is_available) ||
					a.open_tickets - b.open_tickets ||
					a.name.localeCompare(b.name),
			);

		return NextResponse.json({ candidates });
	} catch (error) {
		console.error("Workload lookup error:", error);
		return NextResponse.json({ error: "Failed to load workload" }, { status: 500 });
	}
}
