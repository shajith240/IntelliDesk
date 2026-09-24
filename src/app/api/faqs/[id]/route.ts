import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/db/supabase";
import { generateEmbedding } from "@/server/gemini/embeddings";
import { upsertVectors } from "@/server/db/pinecone";
import { requireAuth } from "@/server/auth/helpers";
import { getOrgId, orgNamespace } from "@/server/auth/org-context";

export async function PUT(
	req: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const session = await requireAuth();
	if (session instanceof NextResponse) return session;

	const orgId = getOrgId(session);

	try {
		const { id } = await params;
		const body = await req.json();

		const updates: Record<string, unknown> = {};
		if (body.question !== undefined) updates.question = body.question;
		if (body.answer !== undefined) updates.answer = body.answer;
		if (body.category !== undefined) updates.category = body.category;

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

	const orgId = getOrgId(session);

	try {
		const { id } = await params;

		const { error } = await supabaseAdmin
			.from("faqs")
			.delete()
			.eq("id", id)
			.eq("organization_id", orgId);

		if (error) throw error;

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Delete FAQ error:", error);
		return NextResponse.json(
			{ error: "Failed to delete FAQ" },
			{ status: 500 },
		);
	}
}
