// The signed-in user's own profile. PATCH toggles availability for new
// assignments — the only thing an agent can change about their own routing.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/server/db/supabase";
import { requireAuth } from "@/server/auth/helpers";
import { getOrgId } from "@/server/auth/org-context";
import { can, forbidden } from "@/server/auth/policy";

const ME_COLUMNS = "id, name, email, role, is_available";

export async function GET() {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;
	const orgId = getOrgId(session);

	const { data, error } = await supabaseAdmin
		.from("users")
		.select(ME_COLUMNS)
		.eq("id", session.user.id)
		.eq("organization_id", orgId)
		.single();
	if (error) {
		console.error("Profile lookup error:", error);
		return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
	}
	return NextResponse.json({ me: data });
}

const updateSchema = z.object({ is_available: z.boolean() }).strict();

export async function PATCH(req: NextRequest) {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;
	if (!can.setOwnAvailability(session)) return forbidden();
	const orgId = getOrgId(session);

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
	}
	const parsed = updateSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json({ error: "Send { is_available: boolean }" }, { status: 400 });
	}

	const { data, error } = await supabaseAdmin
		.from("users")
		.update({ is_available: parsed.data.is_available })
		.eq("id", session.user.id)
		.eq("organization_id", orgId)
		.select(ME_COLUMNS)
		.single();
	if (error) {
		console.error("Availability update error:", error);
		return NextResponse.json({ error: "Failed to update availability" }, { status: 500 });
	}
	return NextResponse.json({ me: data });
}
