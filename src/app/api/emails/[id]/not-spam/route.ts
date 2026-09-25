// Recover an email the spam filters caught by mistake (admin). The email goes
// back into the intake queue with an override, so the next poll turns it into
// a ticket without running the spam filters on it again.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/db/supabase";
import { requireAuth } from "@/server/auth/helpers";
import { getOrgId } from "@/server/auth/org-context";
import { can, forbidden, notFound } from "@/server/auth/policy";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;
	if (!can.manageSettings(session)) return forbidden("Only admins can review spam");
	const orgId = getOrgId(session);

	const { id } = await params;
	if (!UUID_RE.test(id)) return notFound("Email not found");

	const { data, error } = await supabaseAdmin
		.from("emails")
		.update({
			is_spam: false,
			not_spam_by: session.user.id,
			not_spam_at: new Date().toISOString(),
			processed: false,
			processing_attempts: 0,
			processing_error: null,
		})
		.eq("id", id)
		.eq("organization_id", orgId)
		.eq("is_spam", true)
		.select("id")
		.maybeSingle();
	if (error) {
		console.error("Not-spam update error:", error.message);
		return NextResponse.json({ error: "Failed to update the email" }, { status: 500 });
	}
	if (!data) return notFound("Email not found or already recovered");

	const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
		organization_id: orgId,
		action: "email_marked_not_spam",
		details: { email_id: id },
		actor_user_id: session.user.id,
		actor_type: "user",
	});
	if (auditError) console.error("Audit log write failed:", auditError.message);

	return NextResponse.json({ queued: true });
}
