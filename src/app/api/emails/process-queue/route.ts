// Process stored, unprocessed emails without polling mailboxes (e.g. to catch
// up on a backlog). Called with Authorization: Bearer $CRON_SECRET.
import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/server/auth/cron";
import { drainIntakeQueue } from "@/server/email/intake";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const BUDGET_MS = 50_000;

async function handle(req: NextRequest) {
	const denied = verifyCronRequest(req);
	if (denied) return denied;

	try {
		const drain = await drainIntakeQueue(Date.now() + BUDGET_MS);
		return NextResponse.json({ drain });
	} catch (error) {
		console.error("Queue processing error:", error instanceof Error ? error.message : error);
		return NextResponse.json({ error: "Failed to process the queue" }, { status: 500 });
	}
}

export async function GET(req: NextRequest) {
	return handle(req);
}

export async function POST(req: NextRequest) {
	return handle(req);
}
