import "server-only";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { EMBEDDING_DIMENSIONS } from "@/server/db/pinecone";
import { withRetry, type AiContext } from "./client";

/**
 * gemini-embedding-001 natively returns 3072 dimensions. The installed
 * @google/generative-ai SDK does not expose `outputDimensionality`, so we
 * downscale via Matryoshka truncation (the model is trained for this) and
 * re-normalize to unit length. Truncating to EMBEDDING_DIMENSIONS makes the
 * output match whatever dimension the Pinecone index was created with.
 */
function toTargetDimension(values: number[]): number[] {
	const sliced =
		values.length > EMBEDDING_DIMENSIONS
			? values.slice(0, EMBEDDING_DIMENSIONS)
			: values;
	const norm = Math.sqrt(sliced.reduce((sum, v) => sum + v * v, 0)) || 1;
	return sliced.map((v) => v / norm);
}

export async function generateEmbedding(ctx: AiContext, text: string): Promise<number[]> {
	const model = new GoogleGenerativeAI(ctx.apiKey).getGenerativeModel(
		{ model: "gemini-embedding-001" },
		{ apiVersion: "v1beta" },
	);
	const result = await withRetry(() => model.embedContent(text));
	return toTargetDimension(result.embedding.values);
}
