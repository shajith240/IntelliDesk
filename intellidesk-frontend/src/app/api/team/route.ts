// Team info endpoint: lists the organization and its active members for the authenticated user.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/helpers";
import { getOrgId } from "@/lib/auth/org-context";

export async function GET() {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;

	const orgId = getOrgId(session);

	try {
		const [orgResult, membersResult] = await Promise.all([
			supabaseAdmin
				.from("organizations")
				.select("id, name")
				.eq("id", orgId)
				.single(),
			supabaseAdmin
				.from("users")
				.select("id, name, email, role")
				.eq("organization_id", orgId)
				.eq("is_active", true)
				.order("name"),
		]);

		if (orgResult.error || !orgResult.data) throw orgResult.error ?? new Error("Organization not found");
		if (membersResult.error) throw membersResult.error;

		return NextResponse.json({
			organization: orgResult.data,
			members: membersResult.data ?? [],
		});
	} catch (error) {
		console.error("Team lookup error:", error);
		return NextResponse.json(
			{ error: "Failed to load team" },
			{ status: 500 },
		);
	}
}
