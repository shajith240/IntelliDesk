import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/db/supabase";
import { requireAuth } from "@/server/auth/helpers";
import { getOrgId } from "@/server/auth/org-context";

export async function GET(req: NextRequest) {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;

	const orgId = getOrgId(session);

	try {
		const { searchParams } = new URL(req.url);
		const search = searchParams.get("search");
		const page = parseInt(searchParams.get("page") || "1");
		const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
		const offset = (page - 1) * limit;

		let query = supabaseAdmin
			.from("accounts")
			.select("*, contacts(id, name, email, role)", { count: "exact" })
			.eq("organization_id", orgId);

		if (search) {
			query = query.or(
				`company_name.ilike.%${search}%,domain.ilike.%${search}%`,
			);
		}

		const { data, count, error } = await query
			.order("created_at", { ascending: false })
			.range(offset, offset + limit - 1);

		if (error) throw error;

		return NextResponse.json({
			accounts: data,
			total: count,
			page,
			limit,
		});
	} catch (error) {
		console.error("Get customers error:", error);
		return NextResponse.json(
			{ error: "Failed to fetch customers" },
			{ status: 500 },
		);
	}
}
