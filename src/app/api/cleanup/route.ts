import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/db/supabase";
import { getIndex } from "@/server/db/pinecone";

/**
 * DELETE /api/cleanup
 * Removes all tickets, emails, auto_responses, ticket_emails, audit_logs,
 * and Pinecone vectors (emails + tickets namespaces).
 * Used to reset the system after importing irrelevant/old emails.
 * BLOCKED in production.
 */
export async function DELETE() {
	if (process.env.NODE_ENV === "production") {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	try {
		// Delete in correct order to respect foreign key constraints
		const steps = [
			{ table: "audit_logs", label: "audit logs" },
			{ table: "auto_responses", label: "auto responses" },
			{ table: "ticket_emails", label: "ticket-email links" },
			{ table: "tickets", label: "tickets" },
			{ table: "emails", label: "emails" },
		];

		const results: Record<string, number | string> = {};

		for (const step of steps) {
			const { data, error } = await supabaseAdmin
				.from(step.table)
				.delete()
				.neq("id", "00000000-0000-0000-0000-000000000000")
				.select("id");

			if (error) {
				console.error(`Failed to clean ${step.label}:`, error.message);
				results[step.label] = -1;
			} else {
				results[step.label] = data?.length || 0;
			}
		}

		// Clear Pinecone vectors for emails and tickets namespaces
		try {
			const index = getIndex();
			await index.namespace("emails").deleteAll();
			await index.namespace("tickets").deleteAll();
			results["pinecone_emails"] = "cleared";
			results["pinecone_tickets"] = "cleared";
		} catch (err) {
			console.error("Pinecone cleanup error:", err);
			results["pinecone"] = "failed";
		}

		return NextResponse.json({
			message: "Database and vectors cleaned successfully",
			deleted: results,
		});
	} catch (error) {
		console.error("Cleanup error:", error);
		return NextResponse.json(
			{ error: "Failed to clean database" },
			{ status: 500 },
		);
	}
}
