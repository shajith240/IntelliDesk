// Email queue processor: Vercel cron job that reprocesses unprocessed emails from the queue (used for retries and seed data).
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { processEmail } from "@/lib/pipeline/processor";
import { verifyCronRequest } from "@/lib/auth/cron";
import type { RawEmail } from "@/types";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
	const denied = verifyCronRequest(req);
	if (denied) return denied;

	try {
		const { data: unprocessed, error } = await supabaseAdmin
			.from("emails")
			.select("*")
			.eq("processed", false)
			.order("received_at", { ascending: true })
			.limit(50);

		if (error) {
			return NextResponse.json(
				{ error: `DB query failed: ${error.message}` },
				{ status: 500 },
			);
		}

		if (!unprocessed || unprocessed.length === 0) {
			return NextResponse.json({
				message: "No unprocessed emails in queue",
				processed: 0,
			});
		}

		const results = [];
		for (let i = 0; i < unprocessed.length; i++) {
			const e = unprocessed[i];
			const rawEmail: RawEmail = {
				message_id: e.message_id || null,
				from_address: e.from_address,
				from_name: e.from_name || "",
				to_address: e.to_address || "",
				cc: e.cc || null,
				subject: e.subject,
				body_text: e.body_text || "",
				body_html: e.body_html || "",
				received_at: e.received_at,
				in_reply_to: e.in_reply_to || null,
				references: e.references_header || [],
				raw_headers: e.raw_headers || {},
			};

			const result = await processEmail(rawEmail, e.organization_id);
			results.push(result);

			// Mark original seeded email as processed
			await supabaseAdmin
				.from("emails")
				.update({ processed: true })
				.eq("id", e.id);

			// Rate limit: 2s between emails (Groq 30 RPM + Gemini embedding calls)
			if (i < unprocessed.length - 1) {
				await new Promise((resolve) => setTimeout(resolve, 2000));
			}
		}

		const summary = {
			message: `Processed ${results.length} emails from queue`,
			total: results.length,
			success: results.filter((r) => r.status === "processed").length,
			duplicates: results.filter((r) => r.status === "duplicate").length,
			spam: results.filter((r) => r.status === "spam").length,
			errors: results.filter((r) => r.status === "error").length,
			results,
		};

		return NextResponse.json(summary);
	} catch (error) {
		console.error("Process queue error:", error);
		return NextResponse.json(
			{ error: "Failed to process email queue" },
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
