import { NextRequest, NextResponse } from "next/server";
import { generateEmbedding } from "@/server/gemini/embeddings";
import { queryVectors } from "@/server/db/pinecone";
import { supabaseAdmin } from "@/server/db/supabase";
import { requireAuth } from "@/server/auth/helpers";
import { getOrgId, orgNamespace } from "@/server/auth/org-context";

export async function GET(req: NextRequest) {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;

	const orgId = getOrgId(session);

	try {
		const { searchParams } = new URL(req.url);
		const q = searchParams.get("q");
		const type = searchParams.get("type") || "all"; // tickets, emails, faqs, all
		const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 50);

		if (!q) {
			return NextResponse.json(
				{ error: "Missing search query parameter: q" },
				{ status: 400 },
			);
		}

		const embedding = await generateEmbedding(q);

		const results: Record<string, unknown[]> = {};

		// Search tickets
		if (type === "all" || type === "tickets") {
			const ticketResults = await queryVectors(
				orgNamespace(orgId, "tickets"),
				embedding,
				limit,
			);
			if (ticketResults.length > 0) {
				const ticketIds = ticketResults.map((m: { id: string }) => m.id);
				const { data: tickets } = await supabaseAdmin
					.from("tickets")
					.select(
						"id, ticket_number, subject, status, severity, category, created_at",
					)
					.in("id", ticketIds);

				results.tickets = (tickets || []).map((t) => ({
					...t,
					score:
						ticketResults.find(
							(m: { id: string; score?: number }) => m.id === t.id,
						)?.score || 0,
				}));
			} else {
				results.tickets = [];
			}
		}

		// Search emails
		if (type === "all" || type === "emails") {
			const emailResults = await queryVectors(
				orgNamespace(orgId, "emails"),
				embedding,
				limit,
			);
			if (emailResults.length > 0) {
				const emailIds = emailResults.map((m: { id: string }) => m.id);
				const { data: emails } = await supabaseAdmin
					.from("emails")
					.select("id, from_address, from_name, subject, received_at")
					.in("id", emailIds);

				results.emails = (emails || []).map((e) => ({
					...e,
					score:
						emailResults.find(
							(m: { id: string; score?: number }) => m.id === e.id,
						)?.score || 0,
				}));
			} else {
				results.emails = [];
			}
		}

		// Search FAQs
		if (type === "all" || type === "faqs") {
			const faqResults = await queryVectors(
				orgNamespace(orgId, "faqs"),
				embedding,
				limit,
			);
			if (faqResults.length > 0) {
				const faqIds = faqResults.map((m: { id: string }) => m.id);
				const { data: faqs } = await supabaseAdmin
					.from("faqs")
					.select("id, question, answer, category")
					.in("id", faqIds);

				results.faqs = (faqs || []).map((f) => ({
					...f,
					score:
						faqResults.find(
							(m: { id: string; score?: number }) => m.id === f.id,
						)?.score || 0,
				}));
			} else {
				results.faqs = [];
			}
		}

		return NextResponse.json({ query: q, results });
	} catch (error) {
		console.error("Search error:", error);
		return NextResponse.json({ error: "Search failed" }, { status: 500 });
	}
}
