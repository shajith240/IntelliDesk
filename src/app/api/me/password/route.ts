// Change the signed-in user's password. Requires the current password so a
// hijacked session alone can't take over the account.
import { NextRequest, NextResponse } from "next/server";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { supabaseAdmin } from "@/server/db/supabase";
import { requireAuth } from "@/server/auth/helpers";
import { getOrgId } from "@/server/auth/org-context";

const schema = z
	.object({
		current_password: z.string().min(1, "Enter your current password").max(200),
		new_password: z
			.string()
			.min(12, "Use at least 12 characters")
			.max(200, "Use at most 200 characters"),
	})
	.strict()
	.refine((v) => v.current_password !== v.new_password, "The new password must be different");

export async function POST(req: NextRequest) {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;
	const orgId = getOrgId(session);

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
	}
	const parsed = schema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
	}

	try {
		const { data: user, error } = await supabaseAdmin
			.from("users")
			.select("id, password_hash")
			.eq("id", session.user.id)
			.eq("organization_id", orgId)
			.single();
		if (error || !user) throw error ?? new Error("User not found");

		if (!(await compare(parsed.data.current_password, user.password_hash))) {
			return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
		}

		const { error: updateError } = await supabaseAdmin
			.from("users")
			.update({ password_hash: await hash(parsed.data.new_password, 12) })
			.eq("id", user.id);
		if (updateError) throw updateError;

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Password change error:", error);
		return NextResponse.json({ error: "Failed to change password" }, { status: 500 });
	}
}
