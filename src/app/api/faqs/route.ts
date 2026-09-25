import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/db/supabase";
import { generateEmbedding } from "@/server/gemini/embeddings";
import { aiErrorResponse, getAiContext } from "@/server/gemini/client";
import { upsertVectors } from "@/server/db/pinecone";
import { v4 as uuidv4 } from "uuid";
import { requireAuth } from "@/server/auth/helpers";
import { getOrgId, orgNamespace } from "@/server/auth/org-context";
import { can, forbidden } from "@/server/auth/policy";

export async function GET(req: NextRequest) {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;

	const orgId = getOrgId(session);

	try {
		const { searchParams } = new URL(req.url);
		const category = searchParams.get("category");
		const search = searchParams.get("search");
		const page = parseInt(searchParams.get("page") || "1");
		const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
		const offset = (page - 1) * limit;

		let query = supabaseAdmin
			.from("faqs")
			.select("*", { count: "exact" })
			.eq("organization_id", orgId);

		if (category) {
			query = query.eq("category", category);
		}
		if (search) {
			query = query.or(`question.ilike.%${search}%,answer.ilike.%${search}%`);
		}

		const { data, count, error } = await query
			.order("created_at", { ascending: false })
			.range(offset, offset + limit - 1);

		if (error) throw error;

		return NextResponse.json({
			faqs: data,
			total: count,
			page,
			limit,
		});
	} catch (error) {
		console.error("Get FAQs error:", error);
		return NextResponse.json(
			{ error: "Failed to fetch FAQs" },
			{ status: 500 },
		);
	}
}

export async function POST(req: NextRequest) {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;
	if (!can.manageKnowledgeBase(session)) {
		return forbidden("Only admins can edit the knowledge base");
	}

	const orgId = getOrgId(session);

	try {
		let body: Record<string, unknown>;
		try {
			body = await req.json();
		} catch {
			return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
		}

		const { question, answer, category } = body;
		if (
			typeof question !== "string" || !question ||
			typeof answer !== "string" || !answer ||
			typeof category !== "string" || !category
		) {
			return NextResponse.json(
				{ error: "Missing required fields: question, answer, category" },
				{ status: 400 },
			);
		}

		const id = uuidv4();

		// Embed first: if the AI call fails, nothing is saved, so the knowledge
		// base never holds an article the AI can't find.
		const ai = await getAiContext(orgId);
		const embedding = await generateEmbedding(ai, `${question} ${answer}`);

		const { data, error } = await supabaseAdmin
			.from("faqs")
			.insert({
				id,
				organization_id: orgId,
				question,
				answer,
				category,
			})
			.select()
			.single();

		if (error) throw error;

		await upsertVectors(orgNamespace(orgId, "faqs"), [
			{
				id,
				values: embedding,
				metadata: {
					category,
					question: question.slice(0, 200),
				},
			},
		]);

		return NextResponse.json({ faq: data }, { status: 201 });
	} catch (error) {
		const aiError = aiErrorResponse(error);
		if (aiError) return NextResponse.json({ error: aiError.error }, { status: aiError.status });
		console.error("Create FAQ error:", error);
		return NextResponse.json(
			{ error: "Failed to create FAQ" },
			{ status: 500 },
		);
	}
}
