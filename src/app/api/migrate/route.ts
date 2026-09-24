import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/db/supabase";

// PATCH /api/migrate — Reassign all orphaned (NULL org) data to the sharpflow org.
// Run this if dashboard shows no data after seeding.
export async function PATCH() {
	if (process.env.NODE_ENV === "production") {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	try {
		const { data: org, error: orgError } = await supabaseAdmin
			.from("organizations")
			.select("id")
			.eq("slug", "sharpflow")
			.single();

		if (orgError || !org) {
			return NextResponse.json(
				{ error: "Organization 'sharpflow' not found. Run migration 005 first." },
				{ status: 400 },
			);
		}
		const orgId = org.id;

		const tables = [
			"emails",
			"tickets",
			"accounts",
			"faqs",
			"auto_responses",
			"audit_logs",
			"teams",
		] as const;

		const results: Record<string, number> = {};
		for (const table of tables) {
			const { data, error } = await supabaseAdmin
				.from(table)
				.update({ organization_id: orgId })
				.is("organization_id", null)
				.select("id");

			if (error) {
				console.error(`Failed to update ${table}:`, error.message);
				results[table] = -1;
			} else {
				results[table] = data?.length ?? 0;
			}
		}

		return NextResponse.json({
			success: true,
			organization_id: orgId,
			rows_updated: results,
			message: "All orphaned records reassigned to sharpflow org.",
		});
	} catch (error) {
		return NextResponse.json({ error: String(error) }, { status: 500 });
	}
}

export async function POST() {
	if (process.env.NODE_ENV === "production") {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	try {
		// Add ai_classification JSONB column to tickets table
		const { error } = await supabaseAdmin.rpc("exec_sql", {
			sql: "ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ai_classification JSONB;",
		});

		if (error) {
			// If RPC doesn't exist, try raw query via postgrest
			// Alternative: just check if column exists by trying to update
			const { error: testError } = await supabaseAdmin
				.from("tickets")
				.select("ai_classification")
				.limit(1);

			if (testError && testError.message.includes("ai_classification")) {
				return NextResponse.json(
					{
						error:
							"Column does not exist and cannot be added via API. Please run SQL manually in Supabase dashboard.",
						sql: "ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ai_classification JSONB;",
					},
					{ status: 500 },
				);
			}

			return NextResponse.json({
				message: "Column already exists or was added successfully",
			});
		}

		return NextResponse.json({ message: "Migration successful" });
	} catch (error) {
		return NextResponse.json({ error: String(error) }, { status: 500 });
	}
}
