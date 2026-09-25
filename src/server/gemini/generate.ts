import "server-only";
import type { ResponseSchema } from "@google/generative-ai";
import { getModel, withRetry, type AiContext } from "./client";

const MODEL = "gemini-2.5-flash";

interface GenerateOptions {
	/** Instructions, sent as the model's system instruction, never mixed with untrusted text. */
	system: string;
	/** The untrusted content (customer email, etc.) plus any data the task needs. */
	user: string;
	/** When set, the model must return JSON matching this schema. */
	schema?: ResponseSchema;
	temperature?: number;
}

export async function geminiGenerate(ctx: AiContext, options: GenerateOptions): Promise<string> {
	const model = getModel(ctx.apiKey, MODEL, options.system);
	const result = await withRetry(() =>
		model.generateContent({
			contents: [{ role: "user", parts: [{ text: options.user }] }],
			generationConfig: {
				temperature: options.temperature ?? 0.3,
				...(options.schema ? { responseMimeType: "application/json", responseSchema: options.schema } : {}),
			},
		}),
	);
	return result.response.text().trim();
}

/**
 * Wrap untrusted text so the model can tell data from instructions. Any
 * closing tag inside the text is neutralised so it can't break out early.
 */
export function untrusted(tag: string, text: string): string {
	const safe = text.replace(new RegExp(`</?${tag}\\b[^>]*>`, "gi"), "");
	return `<${tag}>\n${safe}\n</${tag}>`;
}
