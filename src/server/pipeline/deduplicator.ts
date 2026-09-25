import "server-only";
import { queryVectors } from "@/server/db/pinecone";
import { supabaseAdmin } from "@/server/db/supabase";
import { orgNamespace } from "@/server/auth/org-context";
import type { DeduplicationResult } from "@/types";

const DEDUP_SIMILARITY_THRESHOLD = 0.85;
const DEDUP_TIME_WINDOW_HOURS = 72;

/**
 * Check if incoming email is a duplicate by:
 * 1. Exact Message-ID match
 * 2. Semantic similarity via Pinecone (>85% within 72h)
 */
export async function checkDuplicate(
	messageId: string | null,
	fromAddress: string,
	embedding: number[],
	receivedAt: Date,
	orgId: string,
	/** When reprocessing a stored email, its own row must not count as a duplicate. */
	excludeEmailId?: string,
): Promise<DeduplicationResult> {
	// 1. Exact message-id match (skip if prior entry was spam — allow reprocessing)
	if (messageId) {
		let existingQuery = supabaseAdmin
			.from("emails")
			.select("id, is_spam")
			.eq("message_id", messageId)
			.eq("organization_id", orgId)
			.eq("processed", true)
			.order("received_at", { ascending: true })
			.limit(1);
		if (excludeEmailId) existingQuery = existingQuery.neq("id", excludeEmailId);
		const { data: existing } = await existingQuery.maybeSingle();

		if (existing && !existing.is_spam) {
			return {
				is_duplicate: true,
				duplicate_of: existing.id,
				similarity_score: 1.0,
				method: "message_id",
			};
		}
	}

	// 2. Semantic similarity search via Pinecone
	const cutoffTimestamp = Math.floor(
		(receivedAt.getTime() - DEDUP_TIME_WINDOW_HOURS * 60 * 60 * 1000) / 1000,
	);

	const results = await queryVectors(
		orgNamespace(orgId, "emails"),
		embedding,
		5,
		{
			from_address: fromAddress,
			timestamp: { $gte: cutoffTimestamp },
		},
	);

	if (results && results.length > 0) {
		const topMatch = results[0];
		if (topMatch.score && topMatch.score >= DEDUP_SIMILARITY_THRESHOLD) {
			return {
				is_duplicate: true,
				duplicate_of: topMatch.id,
				similarity_score: topMatch.score,
				method: "semantic",
			};
		}
	}

	return {
		is_duplicate: false,
		duplicate_of: null,
		similarity_score: 0,
		method: "none",
	};
}

/**
 * Find similar tickets to help agents (not dedup, but related ticket suggestions)
 */
export async function findSimilarTickets(
	embedding: number[],
	topK: number = 5,
	orgId?: string,
): Promise<Array<{ ticket_id: string; score: number }>> {
	const ns = orgId ? orgNamespace(orgId, "tickets") : "tickets";
	const results = await queryVectors(ns, embedding, topK);

	if (!results || results.length === 0) return [];

	return results
		.filter((m: { score?: number }) => m.score && m.score > 0.5)
		.map((m: { id: string; score?: number }) => ({
			ticket_id: m.id,
			score: m.score || 0,
		}));
}
