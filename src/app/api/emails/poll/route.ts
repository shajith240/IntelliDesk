// Scheduled intake: fetch new mail from every connected mailbox into the queue,
// then process as much of the queue as fits in this invocation's time budget.
// Called by a scheduler with Authorization: Bearer $CRON_SECRET (GET or POST).
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/db/supabase";
import { verifyCronRequest } from "@/server/auth/cron";
import { drainIntakeQueue, ingestAllMailboxes } from "@/server/email/intake";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Leave headroom below maxDuration so the response is always returned.
const BUDGET_MS = 50_000;

async function handle(req: NextRequest) {
	const denied = verifyCronRequest(req);
	if (denied) return denied;
	const deadline = Date.now() + BUDGET_MS;

	try {
		const intake = await ingestAllMailboxes();
		const drain = await drainIntakeQueue(deadline);

		// Login-attempt rows only matter for the 15-minute throttle window; keep 30 days.
		const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
		const { error: cleanupError } = await supabaseAdmin.from("auth_login_attempts").delete().lt("created_at", cutoff);
		if (cleanupError) console.error("auth_login_attempts cleanup failed:", cleanupError.message);

		return NextResponse.json({ intake, drain });
	} catch (error) {
		console.error("Email poll error:", error instanceof Error ? error.message : error);
		return NextResponse.json({ error: "Failed to poll emails" }, { status: 500 });
	}
}

export async function GET(req: NextRequest) {
	return handle(req);
}

export async function POST(req: NextRequest) {
	return handle(req);
}
