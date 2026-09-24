import "server-only";
import { getModel } from "./client";

/**
 * Drop-in replacement for groqGenerate using Google Gemini.
 * Provides the same (systemPrompt, userMessage) -> string interface
 * that classify.ts and respond.ts depend on.
 */
export async function geminiGenerate(
	systemPrompt: string,
	userMessage: string,
): Promise<string> {
	const model = getModel("gemini-2.5-flash");
	const result = await model.generateContent({
		contents: [
			{ role: "user", parts: [{ text: systemPrompt + "\n\n" + userMessage }] },
		],
		generationConfig: {
			temperature: 0.3,
		},
	});
	return result.response.text().trim();
}
