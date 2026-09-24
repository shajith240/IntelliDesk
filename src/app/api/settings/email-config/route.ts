import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth/config";
import { supabaseAdmin } from "@/server/db/supabase";
import { getOrgId } from "@/server/auth/org-context";

/**
 * GET /api/settings/email-config
 * Returns the current org's email config (masking passwords).
 */
export async function GET() {
	const session = await auth();
	if (!session?.user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const orgId = getOrgId(session);

	const { data: org } = await supabaseAdmin
		.from("organizations")
		.select("email_config")
		.eq("id", orgId)
		.single();

	if (!org?.email_config) {
		return NextResponse.json({ connected: false, config: null });
	}

	// Return config with masked passwords
	const cfg = org.email_config;
	return NextResponse.json({
		connected: true,
		config: {
			email: cfg.imap?.auth?.user || cfg.smtp?.user || "",
			imap_host: cfg.imap?.host || "imap.gmail.com",
			imap_port: cfg.imap?.port || 993,
			smtp_host: cfg.smtp?.host || "smtp.gmail.com",
			smtp_port: cfg.smtp?.port || 587,
			// Show masked password so user knows it's set
			password_set: !!(cfg.imap?.auth?.pass || cfg.smtp?.pass),
		},
	});
}

/**
 * POST /api/settings/email-config
 * Save Gmail config for the current org.
 * Body: { email, password, imap_host?, imap_port?, smtp_host?, smtp_port? }
 */
export async function POST(req: NextRequest) {
	const session = await auth();
	if (!session?.user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	if (session.user.role !== "admin") {
		return NextResponse.json(
			{ error: "Only admins can update email settings" },
			{ status: 403 },
		);
	}

	const orgId = getOrgId(session);
	const body = await req.json();
	const { email, password, imap_host, imap_port, smtp_host, smtp_port } = body;

	if (!email || !password) {
		return NextResponse.json(
			{ error: "Email and password are required" },
			{ status: 400 },
		);
	}

	const emailConfig = {
		imap: {
			host: imap_host || "imap.gmail.com",
			port: imap_port || 993,
			auth: { user: email, pass: password },
		},
		smtp: {
			host: smtp_host || "smtp.gmail.com",
			port: smtp_port || 587,
			user: email,
			pass: password,
		},
	};

	const { error } = await supabaseAdmin
		.from("organizations")
		.update({ email_config: emailConfig })
		.eq("id", orgId);

	if (error) {
		console.error("Failed to save email config:", error);
		return NextResponse.json(
			{ error: "Failed to save email configuration" },
			{ status: 500 },
		);
	}

	return NextResponse.json({ message: "Email configuration saved" });
}

/**
 * DELETE /api/settings/email-config
 * Disconnect email — remove the org's email config.
 */
export async function DELETE() {
	const session = await auth();
	if (!session?.user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	if (session.user.role !== "admin") {
		return NextResponse.json(
			{ error: "Only admins can update email settings" },
			{ status: 403 },
		);
	}

	const orgId = getOrgId(session);

	const { error } = await supabaseAdmin
		.from("organizations")
		.update({ email_config: null })
		.eq("id", orgId);

	if (error) {
		console.error("Failed to remove email config:", error);
		return NextResponse.json(
			{ error: "Failed to disconnect email" },
			{ status: 500 },
		);
	}

	return NextResponse.json({ message: "Email disconnected" });
}
