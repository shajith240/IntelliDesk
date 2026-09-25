// The workspace's support mailbox. Admins connect it (credentials are verified
// against the real IMAP and SMTP servers before anything is saved, then stored
// encrypted); admins and viewers can see its status. The secret is never returned.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/server/db/supabase";
import { requireAuth } from "@/server/auth/helpers";
import { getOrgId } from "@/server/auth/org-context";
import { can, forbidden } from "@/server/auth/policy";
import { encryptSecret, isEncryptionConfigured } from "@/server/crypto/secrets";
import {
	GMAIL_SETTINGS,
	MailboxInputError,
	assertPublicMailHost,
	describeMailboxError,
	verifyMailboxCredentials,
} from "@/server/email/mailbox";

export const maxDuration = 60;

const STATUS_COLUMNS =
	"provider, email_address, imap_host, imap_port, smtp_host, smtp_port, status, last_error, last_synced_at, created_at, updated_at";

export async function GET() {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;
	if (!can.manageSettings(session) && !can.viewAllTickets(session)) return forbidden();
	const orgId = getOrgId(session);

	const { data, error } = await supabaseAdmin
		.from("mailbox_connections")
		.select(STATUS_COLUMNS)
		.eq("organization_id", orgId)
		.maybeSingle();
	if (error) {
		console.error("Mailbox lookup error:", error.message);
		return NextResponse.json({ error: "Failed to load mailbox settings" }, { status: 500 });
	}
	return NextResponse.json({ connected: Boolean(data && data.status !== "disconnected"), mailbox: data });
}

const gmailSchema = z.object({
	provider: z.literal("gmail"),
	email: z.string().trim().toLowerCase().email("Enter the Gmail address").max(254),
	// Google shows app passwords as four groups of four letters; spaces are optional.
	app_password: z
		.string()
		.transform((v) => v.replace(/\s+/g, ""))
		.pipe(z.string().regex(/^[a-z]{16}$/i, "A Gmail app password is 16 letters (spaces don't matter)")),
});

const customSchema = z.object({
	provider: z.literal("imap_smtp"),
	email: z.string().trim().toLowerCase().email("Enter the mailbox address").max(254),
	username: z.string().trim().min(1).max(254).optional(),
	app_password: z.string().min(1, "Enter the mailbox password").max(512),
	imap_host: z.string().trim().toLowerCase().max(253),
	imap_port: z.literal(993, { message: "IMAP must use port 993 (TLS)" }),
	smtp_host: z.string().trim().toLowerCase().max(253),
	smtp_port: z.union([z.literal(465), z.literal(587)], { message: "SMTP must use port 465 or 587" }),
});

const bodySchema = z.discriminatedUnion("provider", [gmailSchema, customSchema]);

export async function POST(req: NextRequest) {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;
	if (!can.manageSettings(session)) return forbidden("Only admins can change the support mailbox");
	const orgId = getOrgId(session);

	if (!isEncryptionConfigured()) {
		console.error("MAILBOX_ENCRYPTION_KEY is missing or invalid");
		return NextResponse.json(
			{ error: "Mailbox storage isn't configured on this server. Contact your administrator." },
			{ status: 503 },
		);
	}

	let raw: unknown;
	try {
		raw = await req.json();
	} catch {
		return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
	}
	const parsed = bodySchema.safeParse(raw);
	if (!parsed.success) {
		return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
	}
	const input = parsed.data;

	const settings =
		input.provider === "gmail"
			? { ...GMAIL_SETTINGS, username: input.email }
			: {
					imapHost: input.imap_host,
					imapPort: input.imap_port,
					smtpHost: input.smtp_host,
					smtpPort: input.smtp_port,
					username: input.username ?? input.email,
				};

	try {
		if (input.provider === "imap_smtp") {
			await assertPublicMailHost(settings.imapHost);
			await assertPublicMailHost(settings.smtpHost);
		}
		await verifyMailboxCredentials(
			{ host: settings.imapHost, port: settings.imapPort, auth: { user: settings.username, pass: input.app_password } },
			{ host: settings.smtpHost, port: settings.smtpPort, user: settings.username, pass: input.app_password },
		);
	} catch (err) {
		const message = err instanceof MailboxInputError ? err.message : describeMailboxError(err as Error);
		return NextResponse.json({ error: message }, { status: 400 });
	}

	const { data, error } = await supabaseAdmin
		.from("mailbox_connections")
		.upsert(
			{
				organization_id: orgId,
				provider: input.provider,
				email_address: input.email,
				username: settings.username,
				imap_host: settings.imapHost,
				imap_port: settings.imapPort,
				smtp_host: settings.smtpHost,
				smtp_port: settings.smtpPort,
				secret_ciphertext: encryptSecret(input.app_password, orgId),
				status: "active",
				last_error: null,
				connected_by: session.user.id,
			},
			{ onConflict: "organization_id" },
		)
		.select(STATUS_COLUMNS)
		.single();
	if (error) {
		console.error("Mailbox save error:", error.message);
		return NextResponse.json({ error: "Failed to save the mailbox" }, { status: 500 });
	}

	const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
		organization_id: orgId,
		action: "mailbox_connected",
		details: { provider: input.provider, email: input.email },
		actor_user_id: session.user.id,
		actor_type: "user",
	});
	if (auditError) console.error("Audit log write failed:", auditError.message);

	return NextResponse.json({ connected: true, mailbox: data });
}

export async function DELETE() {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;
	if (!can.manageSettings(session)) return forbidden("Only admins can change the support mailbox");
	const orgId = getOrgId(session);

	// Delete the row outright so the ciphertext doesn't linger after a disconnect.
	const { error } = await supabaseAdmin.from("mailbox_connections").delete().eq("organization_id", orgId);
	if (error) {
		console.error("Mailbox disconnect error:", error.message);
		return NextResponse.json({ error: "Failed to disconnect the mailbox" }, { status: 500 });
	}

	const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
		organization_id: orgId,
		action: "mailbox_disconnected",
		details: {},
		actor_user_id: session.user.id,
		actor_type: "user",
	});
	if (auditError) console.error("Audit log write failed:", auditError.message);

	return NextResponse.json({ connected: false, mailbox: null });
}
