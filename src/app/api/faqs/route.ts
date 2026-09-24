import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/db/supabase";
import { generateEmbedding } from "@/server/gemini/embeddings";
import { upsertVectors } from "@/server/db/pinecone";
import { v4 as uuidv4 } from "uuid";
import { requireAuth } from "@/server/auth/helpers";
import { getOrgId, orgNamespace } from "@/server/auth/org-context";

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

	const orgId = getOrgId(session);

	try {
		const body = await req.json();

		if (!body.question || !body.answer || !body.category) {
			return NextResponse.json(
				{ error: "Missing required fields: question, answer, category" },
				{ status: 400 },
			);
		}

		const id = uuidv4();

		const { data, error } = await supabaseAdmin
			.from("faqs")
			.insert({
				id,
				organization_id: orgId,
				question: body.question,
				answer: body.answer,
				category: body.category,
			})
			.select()
			.single();

		if (error) throw error;

		// Generate embedding and store in Pinecone
		const embedding = await generateEmbedding(
			`${body.question} ${body.answer}`,
		);

		await upsertVectors(orgNamespace(orgId, "faqs"), [
			{
				id,
				values: embedding,
				metadata: {
					category: body.category,
					question: body.question.slice(0, 200),
				},
			},
		]);

		return NextResponse.json({ faq: data }, { status: 201 });
	} catch (error) {
		console.error("Create FAQ error:", error);
		return NextResponse.json(
			{ error: "Failed to create FAQ" },
			{ status: 500 },
		);
	}
}
