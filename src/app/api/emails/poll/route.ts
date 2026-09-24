// Email polling endpoint: Vercel cron job that pulls new messages from IMAP for each org with email configured.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/db/supabase";
import { pollNewEmails } from "@/server/email/imap";
import { processEmail } from "@/server/pipeline/processor";
import { verifyCronRequest } from "@/server/auth/cron";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
	const denied = verifyCronRequest(req);
	if (denied) return denied;

	try {
		// Only poll orgs that have email_config set
		const { data: orgs } = await supabaseAdmin
			.from("organizations")
			.select("id, email_config")
			.not("email_config", "is", null);

		if (!orgs || orgs.length === 0) {
			return NextResponse.json({
				message: "No organizations have connected their email yet",
				processed: 0,
				results: [],
			});
		}

		const allResults = [];

		for (const org of orgs) {
			const imapConfig = org.email_config?.imap;
			if (!imapConfig?.auth?.user || !imapConfig?.auth?.pass) continue;

			const rawEmails = await pollNewEmails(imapConfig);

			for (let i = 0; i < rawEmails.length; i++) {
				const result = await processEmail(rawEmails[i], org.id);
				allResults.push(result);

				// Rate limit between emails (Groq free tier: 30 RPM)
				if (i < rawEmails.length - 1) {
					await new Promise((resolve) => setTimeout(resolve, 4000));
				}
			}
		}

		return NextResponse.json({
			message: `Processed ${allResults.length} emails`,
			processed: allResults.length,
			results: allResults,
		});
	} catch (error) {
		console.error("Email poll error:", error);
		return NextResponse.json(
			{ error: "Failed to poll emails" },
			{ status: 500 },
		);
	}
}

export async function GET(req: NextRequest) {
	return handle(req);
}

export async function POST(req: NextRequest) {
	return handle(req);
}
