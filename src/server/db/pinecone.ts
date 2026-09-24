import "server-only";
import { Pinecone, type RecordMetadata } from "@pinecone-database/pinecone";

/**
 * Enforced vector dimensionality. Must match BOTH:
 *  - the dimension the Pinecone index was created with, and
 *  - the `outputDimensionality` requested from gemini-embedding-001
 *    (see src/server/gemini/embeddings.ts).
 * Override via PINECONE_EMBEDDING_DIMENSIONS if your index differs.
 */
export const EMBEDDING_DIMENSIONS = Number(
	process.env.PINECONE_EMBEDDING_DIMENSIONS || 768,
);

let pineconeClient: Pinecone | null = null;

export function getPinecone(): Pinecone {
	if (!pineconeClient) {
		pineconeClient = new Pinecone({
			apiKey: process.env.PINECONE_API_KEY!,
		});
	}
	return pineconeClient;
}

export function getIndex() {
	const pc = getPinecone();
	const host = process.env.PINECONE_HOST?.trim();
	return host
		? pc.index({ host })
		: pc.index(process.env.PINECONE_INDEX || "intellidesk");
}

export async function upsertVectors(
	namespace: string,
	vectors: {
		id: string;
		values: number[];
		metadata: RecordMetadata;
	}[],
) {
	// Validate vector dimensions before upserting
	for (const v of vectors) {
		if (v.values.length !== EMBEDDING_DIMENSIONS) {
			throw new Error(
				`Vector dimension mismatch: expected ${EMBEDDING_DIMENSIONS}, got ${v.values.length}. ` +
				`Ensure you are using gemini-embedding-001 which produces ${EMBEDDING_DIMENSIONS}-dimensional vectors.`
			);
		}
	}

	const index = getIndex();
	const ns = index.namespace(namespace);
	await ns.upsert({ records: vectors });
}

export async function queryVectors(
	namespace: string,
	vector: number[],
	topK: number = 5,
	filter?: Record<string, unknown>,
) {
	// Validate query vector dimensions
	if (vector.length !== EMBEDDING_DIMENSIONS) {
		throw new Error(
			`Query vector dimension mismatch: expected ${EMBEDDING_DIMENSIONS}, got ${vector.length}.`
		);
	}

	const index = getIndex();
	const ns = index.namespace(namespace);
	const result = await ns.query({
		vector,
		topK,
		includeMetadata: true,
		filter,
	});
	return result.matches || [];
}
