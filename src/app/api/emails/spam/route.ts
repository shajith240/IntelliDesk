// Spam review (admin): email the filters kept out of the queue, newest first.
// A false positive is recovered with POST /api/emails/[id]/not-spam.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/db/supabase";
import { requireAuth } from "@/server/auth/helpers";
import { getOrgId } from "@/server/auth/org-context";
import { can, forbidden } from "@/server/auth/policy";

const WINDOW_DAYS = 30;

export async function GET() {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;
	if (!can.manageSettings(session)) return forbidden("Only admins can review spam");
	const orgId = getOrgId(session);

	const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
	const { data, error } = await supabaseAdmin
		.from("emails")
		.select("id, from_address, from_name, subject, body_text, received_at")
		.eq("organization_id", orgId)
		.eq("direction", "inbound")
		.eq("is_spam", true)
		.gte("received_at", since)
		.order("received_at", { ascending: false })
		.limit(100);
	if (error) {
		console.error("Spam list error:", error.message);
		return NextResponse.json({ error: "Failed to load spam" }, { status: 500 });
	}

	return NextResponse.json({
		window_days: WINDOW_DAYS,
		emails: (data ?? []).map(({ body_text, ...email }) => ({
			...email,
			preview: (body_text ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
		})),
	});
}
