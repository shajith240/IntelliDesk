// Workspace AI settings: the workspace's own Gemini API key (verified, then
// stored encrypted; never returned) and whether confident knowledge-base
// answers may be emailed without review. Admins change them; viewers can read.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { GoogleGenerativeAI, GoogleGenerativeAIFetchError } from "@google/generative-ai";
import { supabaseAdmin } from "@/server/db/supabase";
import { requireAuth } from "@/server/auth/helpers";
import { getOrgId } from "@/server/auth/org-context";
import { can, forbidden } from "@/server/auth/policy";
import { encryptSecret, isEncryptionConfigured } from "@/server/crypto/secrets";
import { MAX_PROCESSING_ATTEMPTS } from "@/server/email/intake";

export async function GET() {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;
	if (!can.manageSettings(session) && !can.viewAllTickets(session)) return forbidden();
	const orgId = getOrgId(session);

	const [{ data: org, error: orgError }, { data: key, error: keyError }] = await Promise.all([
		supabaseAdmin.from("organizations").select("ai_auto_send").eq("id", orgId).single(),
		supabaseAdmin
			.from("ai_credentials")
			.select("provider, key_hint, status, last_error, updated_at")
			.eq("organization_id", orgId)
			.maybeSingle(),
	]);
	if (orgError || keyError) {
		console.error("AI settings lookup error:", orgError?.message ?? keyError?.message);
		return NextResponse.json({ error: "Failed to load AI settings" }, { status: 500 });
	}

	return NextResponse.json({
		auto_send: org.ai_auto_send,
		key: key
			? { source: "workspace", ...key }
			: { source: process.env.GEMINI_API_KEY?.trim() ? "platform" : "none" },
	});
}

const patchSchema = z.object({ auto_send: z.boolean() }).strict();

export async function PATCH(req: NextRequest) {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;
	if (!can.manageSettings(session)) return forbidden("Only admins can change AI settings");
	const orgId = getOrgId(session);

	const parsed = patchSchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: "Expected { auto_send: boolean }" }, { status: 400 });

	const { error } = await supabaseAdmin
		.from("organizations")
		.update({ ai_auto_send: parsed.data.auto_send })
		.eq("id", orgId);
	if (error) {
		console.error("AI settings update error:", error.message);
		return NextResponse.json({ error: "Failed to save AI settings" }, { status: 500 });
	}
	await audit(orgId, session.user.id, "ai_auto_send_changed", { auto_send: parsed.data.auto_send });
	return NextResponse.json({ auto_send: parsed.data.auto_send });
}

const keySchema = z
	.object({
		api_key: z
			.string()
			.trim()
			.regex(/^[A-Za-z0-9_-]{30,100}$/, "That doesn't look like a Gemini API key"),
	})
	.strict();

export async function POST(req: NextRequest) {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;
	if (!can.manageSettings(session)) return forbidden("Only admins can change AI settings");
	const orgId = getOrgId(session);

	if (!isEncryptionConfigured()) {
		return NextResponse.json(
			{ error: "Secret storage isn't configured on this server. Contact your administrator." },
			{ status: 503 },
		);
	}
	const parsed = keySchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
	const apiKey = parsed.data.api_key;

	// Verify with a free call (token counting) before saving anything.
	try {
		await new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: "gemini-2.5-flash" }).countTokens("ping");
	} catch (err) {
		const status = err instanceof GoogleGenerativeAIFetchError ? err.status : undefined;
		const message =
			status === 400 || status === 401 || status === 403
				? "Google rejected this key. Create one at aistudio.google.com/apikey and paste it again."
				: "Couldn't reach Gemini to check the key. Try again.";
		return NextResponse.json({ error: message }, { status: 400 });
	}

	const { error } = await supabaseAdmin.from("ai_credentials").upsert(
		{
			organization_id: orgId,
			provider: "gemini",
			secret_ciphertext: encryptSecret(apiKey, orgId),
			key_hint: apiKey.slice(-4),
			status: "active",
			last_error: null,
			created_by: session.user.id,
		},
		{ onConflict: "organization_id" },
	);
	if (error) {
		console.error("AI key save error:", error.message);
		return NextResponse.json({ error: "Failed to save the key" }, { status: 500 });
	}

	// Emails that gave up while AI wasn't working get another chance now.
	await supabaseAdmin
		.from("emails")
		.update({ processing_attempts: 0, processing_error: null })
		.eq("organization_id", orgId)
		.eq("processed", false)
		.gte("processing_attempts", MAX_PROCESSING_ATTEMPTS);

	await audit(orgId, session.user.id, "ai_key_saved", { key_hint: apiKey.slice(-4) });
	return NextResponse.json({ key: { source: "workspace", key_hint: apiKey.slice(-4), status: "active" } });
}

export async function DELETE() {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;
	if (!can.manageSettings(session)) return forbidden("Only admins can change AI settings");
	const orgId = getOrgId(session);

	const { error } = await supabaseAdmin.from("ai_credentials").delete().eq("organization_id", orgId);
	if (error) {
		console.error("AI key delete error:", error.message);
		return NextResponse.json({ error: "Failed to remove the key" }, { status: 500 });
	}
	await audit(orgId, session.user.id, "ai_key_removed", {});
	return NextResponse.json({ key: { source: process.env.GEMINI_API_KEY?.trim() ? "platform" : "none" } });
}

async function audit(orgId: string, userId: string, action: string, details: Record<string, unknown>) {
	const { error } = await supabaseAdmin.from("audit_logs").insert({
		organization_id: orgId,
		action,
		details,
		performed_by: userId,
		actor_user_id: userId,
		actor_type: "user",
	});
	if (error) console.error("Audit log write failed:", error.message);
}
