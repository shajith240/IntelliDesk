import "server-only";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { EMBEDDING_DIMENSIONS } from "@/server/db/pinecone";

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

export async function generateEmbedding(text: string): Promise<number[]> {
	const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
	const model = genAI.getGenerativeModel(
		{ model: "gemini-embedding-001" },
		{ apiVersion: "v1beta" },
	);
	const result = await model.embedContent(text);
	return toTargetDimension(result.embedding.values);
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
	const results: number[][] = [];
	for (const text of texts) {
		const embedding = await generateEmbedding(text);
		results.push(embedding);
	}
	return results;
}
