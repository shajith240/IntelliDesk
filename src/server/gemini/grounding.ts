import type { FAQMatch } from "@/types";

// Pure (no I/O) so it can be unit-tested: tests/unit/grounding.test.ts.

/**
 * Links, email addresses, phone numbers and money amounts in the reply must
 * appear in the cited articles. Anything else was made up by the model (or
 * planted by the customer's email) and the reply must not go out unreviewed.
 */
export function findUngroundedFacts(reply: string, sources: FAQMatch[]): string[] {
	const corpus = sources.map((s) => `${s.question ?? ""} ${s.answer ?? ""}`).join(" ").toLowerCase();
	const patterns = [
		/\bhttps?:\/\/[^\s)>\]]+/gi,
		/\bwww\.[^\s)>\]]+/gi,
		/[\w.+-]+@[\w-]+\.[\w.-]+/g,
		/(?:[$€£₹]\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?(?:usd|eur|inr|rs\.?|rupees|dollars))/gi,
		/\+?\d[\d\s().-]{7,}\d/g,
	];
	const found = new Set<string>();
	for (const pattern of patterns) {
		for (const match of reply.match(pattern) ?? []) {
			const token = match.replace(/[.,;:!?]+$/, "");
			if (!corpus.includes(token.toLowerCase())) found.add(token);
		}
	}
	return [...found];
}
