// Email ingest webhook: accepts incoming emails from external email service via bearer token auth.
import { NextRequest, NextResponse } from "next/server";
import { processEmail } from "@/server/pipeline/processor";
import { verifyBearerSecret } from "@/server/auth/cron";
import { supabaseAdmin } from "@/server/db/supabase";
import type { RawEmail } from "@/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
	const denied = verifyBearerSecret(
		req,
		process.env.EMAIL_INGEST_SECRET,
		"EMAIL_INGEST_SECRET",
	);
	if (denied) return denied;

	try {
		const body = await req.json();

		// Validate required fields
		const required = [
			"from_address",
			"subject",
			"received_at",
			"organization_id",
		];
		for (const field of required) {
			if (!body[field]) {
				return NextResponse.json(
					{ error: `Missing required field: ${field}` },
					{ status: 400 },
				);
			}
		}

		const orgId: string = body.organization_id;
		if (typeof orgId !== "string" || !UUID_RE.test(orgId)) {
			return NextResponse.json(
				{ error: "organization_id must be a valid UUID" },
				{ status: 400 },
			);
		}

		const { data: org, error: orgError } = await supabaseAdmin
			.from("organizations")
			.select("id")
			.eq("id", orgId)
			.maybeSingle();
		if (orgError) throw orgError;
		if (!org) {
			return NextResponse.json({ error: "Unknown organization" }, { status: 400 });
		}

		const rawEmail: RawEmail = {
			message_id: body.message_id || null,
			from_address: body.from_address,
			from_name: body.from_name || "",
			to_address: body.to_address || "",
			cc: body.cc || null,
			subject: body.subject,
			body_text: body.body_text || "",
			body_html: body.body_html || "",
			received_at: body.received_at,
			in_reply_to: body.in_reply_to || null,
			references: body.references || [],
			raw_headers: body.headers || body.raw_headers || {},
		};

		const result = await processEmail(rawEmail, orgId);

		return NextResponse.json(result, {
			status: result.status === "error" ? 500 : 200,
		});
	} catch (error) {
		console.error("Email ingest error:", error);
		return NextResponse.json(
			{ error: "Failed to process email" },
			{ status: 500 },
		);
	}
}
