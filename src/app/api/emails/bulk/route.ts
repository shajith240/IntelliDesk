import { NextRequest, NextResponse } from "next/server";
import { processEmailBatch } from "@/server/pipeline/processor";
import type { RawEmail } from "@/types";
import { requireAuth } from "@/server/auth/helpers";
import { getOrgId } from "@/server/auth/org-context";

export async function POST(req: NextRequest) {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;

	const orgId = getOrgId(session);

	try {
		const body = await req.json();

		if (!Array.isArray(body.emails) || body.emails.length === 0) {
			return NextResponse.json(
				{ error: "Request must include a non-empty emails array" },
				{ status: 400 },
			);
		}

		if (body.emails.length > 50) {
			return NextResponse.json(
				{ error: "Maximum 50 emails per batch" },
				{ status: 400 },
			);
		}

		const rawEmails: RawEmail[] = body.emails.map(
			(e: Record<string, unknown>) => ({
				message_id: (e.message_id as string) || null,
				from_address: e.from_address as string,
				from_name: (e.from_name as string) || "",
				to_address: (e.to_address as string) || "",
				subject: e.subject as string,
				body_text: (e.body_text as string) || "",
				body_html: (e.body_html as string) || "",
				received_at: e.received_at as string,
				in_reply_to: (e.in_reply_to as string) || null,
				references: (e.references as string[]) || [],
				headers: (e.headers as Record<string, string>) || {},
			}),
		);

		const results = await processEmailBatch(rawEmails, orgId);

		return NextResponse.json({
			message: `Processed ${results.length} emails`,
			total: results.length,
			success: results.filter((r) => r.status === "processed").length,
			duplicates: results.filter((r) => r.status === "duplicate").length,
			spam: results.filter((r) => r.status === "spam").length,
			errors: results.filter((r) => r.status === "error").length,
			results,
		});
	} catch (error) {
		console.error("Bulk ingest error:", error);
		return NextResponse.json(
			{ error: "Failed to process bulk emails" },
			{ status: 500 },
		);
	}
}
