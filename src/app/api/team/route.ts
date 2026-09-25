// Workspace members. GET lists them (inactive members only for admins);
// POST lets an admin add a member with a one-time initial password.
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { z } from "zod";
import { supabaseAdmin } from "@/server/db/supabase";
import { requireAuth } from "@/server/auth/helpers";
import { getOrgId } from "@/server/auth/org-context";
import { can, forbidden } from "@/server/auth/policy";

const MEMBER_COLUMNS = "id, name, email, role, is_active, is_available, last_login, created_at";

export async function GET(req: NextRequest) {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;
	const orgId = getOrgId(session);

	const includeInactive = new URL(req.url).searchParams.get("include") === "inactive";
	if (includeInactive && !can.manageTeam(session)) return forbidden();

	try {
		let membersQuery = supabaseAdmin
			.from("users")
			.select(MEMBER_COLUMNS)
			.eq("organization_id", orgId)
			.order("name");
		if (!includeInactive) membersQuery = membersQuery.eq("is_active", true);

		const [orgResult, membersResult] = await Promise.all([
			supabaseAdmin.from("organizations").select("id, name").eq("id", orgId).single(),
			membersQuery,
		]);

		if (orgResult.error || !orgResult.data) throw orgResult.error ?? new Error("Organization not found");
		if (membersResult.error) throw membersResult.error;

		return NextResponse.json({
			organization: orgResult.data,
			members: membersResult.data ?? [],
		});
	} catch (error) {
		console.error("Team lookup error:", error);
		return NextResponse.json({ error: "Failed to load team" }, { status: 500 });
	}
}

const createMemberSchema = z.object({
	name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
	email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
	role: z.enum(["agent", "viewer", "admin"]),
});

/** 16 characters from an unambiguous alphabet: ~95 bits of entropy. */
function generateInitialPassword(): string {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
	const bytes = randomBytes(16);
	return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export async function POST(req: NextRequest) {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;
	if (!can.manageTeam(session)) return forbidden("Only admins can add members");
	const orgId = getOrgId(session);

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
	}
	const parsed = createMemberSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
	}
	const { name, email, role } = parsed.data;

	try {
		const initialPassword = generateInitialPassword();
		const passwordHash = await hash(initialPassword, 12);

		const { data, error } = await supabaseAdmin
			.from("users")
			.insert({ organization_id: orgId, name, email, role, password_hash: passwordHash })
			.select(MEMBER_COLUMNS)
			.single();

		if (error) {
			if (error.code === "23505") {
				return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
			}
			throw error;
		}

		const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
			organization_id: orgId,
			action: "member_added",
			details: { member_id: data.id, role },
			performed_by: session.user.id,
			actor_user_id: session.user.id,
			actor_type: "user",
		});
		if (auditError) console.error("Audit log write failed:", auditError);

		// The initial password is returned exactly once and never stored in plain text.
		return NextResponse.json({ member: data, initial_password: initialPassword }, { status: 201 });
	} catch (error) {
		console.error("Add member error:", error);
		return NextResponse.json({ error: "Failed to add member" }, { status: 500 });
	}
}
