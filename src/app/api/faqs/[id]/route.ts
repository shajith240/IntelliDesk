import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/db/supabase";
import { generateEmbedding } from "@/server/gemini/embeddings";
import { aiErrorResponse, getAiContext } from "@/server/gemini/client";
import { deleteVectors, upsertVectors } from "@/server/db/pinecone";
import { requireAuth } from "@/server/auth/helpers";
import { getOrgId, orgNamespace } from "@/server/auth/org-context";
import { can, forbidden } from "@/server/auth/policy";

export async function PUT(
	req: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;
	if (!can.manageKnowledgeBase(session)) {
		return forbidden("Only admins can edit the knowledge base");
	}

	const orgId = getOrgId(session);

	try {
		const { id } = await params;
		let body: Record<string, unknown>;
		try {
			body = await req.json();
		} catch {
			return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
		}

		const updates: Record<string, unknown> = {};
		if (typeof body.question === "string") updates.question = body.question;
		if (typeof body.answer === "string") updates.answer = body.answer;
		if (typeof body.category === "string") updates.category = body.category;

		if (Object.keys(updates).length === 0) {
			return NextResponse.json(
				{ error: "No fields to update" },
				{ status: 400 },
			);
		}

		const { data, error } = await supabaseAdmin
			.from("faqs")
			.update(updates)
			.eq("id", id)
			.eq("organization_id", orgId)
			.select()
			.single();

		if (error) throw error;

		// Re-embed if question or answer changed
		if (updates.question || updates.answer) {
			const embedding = await generateEmbedding(
				await getAiContext(orgId),
				`${data.question} ${data.answer}`,
			);
			await upsertVectors(orgNamespace(orgId, "faqs"), [
				{
					id,
					values: embedding,
					metadata: {
						category: data.category,
						question: data.question.slice(0, 200),
					},
				},
			]);
		}

		return NextResponse.json({ faq: data });
	} catch (error) {
		const aiError = aiErrorResponse(error);
		if (aiError) return NextResponse.json({ error: aiError.error }, { status: aiError.status });
		console.error("Update FAQ error:", error);
		return NextResponse.json(
			{ error: "Failed to update FAQ" },
			{ status: 500 },
		);
	}
}

export async function DELETE(
	req: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;
	if (!can.manageKnowledgeBase(session)) {
		return forbidden("Only admins can edit the knowledge base");
	}

	const orgId = getOrgId(session);

	try {
		const { id } = await params;

		const { error } = await supabaseAdmin
			.from("faqs")
			.delete()
			.eq("id", id)
			.eq("organization_id", orgId);

		if (error) throw error;

		// Drop the article's vector too, or the AI keeps quoting a deleted answer.
		await deleteVectors(orgNamespace(orgId, "faqs"), [id]);

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Delete FAQ error:", error);
		return NextResponse.json(
			{ error: "Failed to delete FAQ" },
			{ status: 500 },
		);
	}
}
