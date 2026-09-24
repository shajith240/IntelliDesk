import "server-only";
import { geminiGenerate } from "./generate";
import { generateEmbedding } from "./embeddings";
import { queryVectors } from "@/server/db/pinecone";
import { supabaseAdmin } from "@/server/db/supabase";
import { orgNamespace } from "@/server/auth/org-context";
import type { AutoResponseResult, FAQMatch, Severity } from "@/types";

const FAQ_PERFECT_MATCH_THRESHOLD = 0.9;
const FAQ_PARTIAL_MATCH_THRESHOLD = 0.7;

/**
 * Generate auto-response by:
 * 1. Finding matching FAQs via semantic search
 * 2. Using Gemini to draft a personalized response
 * 3. Deciding response tier: auto-send, suggest, or none
 */
export async function generateAutoResponse(
	emailSubject: string,
	emailBody: string,
	category: string,
	severity: Severity,
	customerName: string | undefined,
	accountTier: string | null | undefined,
	orgId: string,
): Promise<AutoResponseResult> {
	// Don't auto-respond to P1/P2 - always needs human
	if (severity === "P1" || severity === "P2") {
		return {
			should_respond: false,
			response_type: "none",
			response_text: "",
			faq_matches: [],
			confidence: 0,
			reasoning: "High severity tickets (P1/P2) require human response",
		};
	}

	// 1. Semantic search for matching FAQs
	const queryText = `${emailSubject} ${emailBody}`.slice(0, 2000);
	const embedding = await generateEmbedding(queryText);

	const faqResults = await queryVectors(orgNamespace(orgId, "faqs"), embedding, 5, {
		category: category,
	});

	const faqMatches: FAQMatch[] = [];

	if (faqResults && faqResults.length > 0) {
		const faqIds = faqResults.map((m: { id: string }) => m.id);
		const { data: faqs } = await supabaseAdmin
			.from("faqs")
			.select("id, question, answer, category")
			.in("id", faqIds);

		if (faqs) {
			for (const match of faqResults) {
				const faq = faqs.find((f: { id: string }) => f.id === match.id);
				if (faq && match.score) {
					faqMatches.push({
						faq_id: faq.id,
						question: faq.question,
						answer: faq.answer,
						score: match.score,
					});
				}
			}
		}
	}

	// Determine response tier
	const topMatch = faqMatches[0];

	// No FAQ matches - no auto response
	if (!topMatch || topMatch.score < FAQ_PARTIAL_MATCH_THRESHOLD) {
		return {
			should_respond: false,
			response_type: "none",
			response_text: "",
			faq_matches: faqMatches,
			confidence: topMatch?.score || 0,
			reasoning: "No sufficiently matching FAQ found",
		};
	}

	// Generate personalized response via Gemini
	const response = await generatePersonalizedResponse(
		emailSubject,
		emailBody,
		customerName,
		faqMatches.slice(0, 3),
		accountTier,
	);

	// Perfect match -> auto-send (for P3/P4 only)
	if (topMatch.score >= FAQ_PERFECT_MATCH_THRESHOLD) {
		return {
			should_respond: true,
			response_type: "auto",
			response_text: response,
			faq_matches: faqMatches,
			confidence: topMatch.score,
			reasoning: `Perfect FAQ match (score: ${topMatch.score.toFixed(2)}) for P${severity.replace("P", "")} ticket`,
		};
	}

	// Partial match -> suggest to agent
	return {
		should_respond: true,
		response_type: "suggest",
		response_text: response,
		faq_matches: faqMatches,
		confidence: topMatch.score,
		reasoning: `Partial FAQ match (score: ${topMatch.score.toFixed(2)}) - suggesting for agent review`,
	};
}

async function generatePersonalizedResponse(
	subject: string,
	body: string,
	customerName: string | undefined,
	faqMatches: FAQMatch[],
	accountTier: string | null | undefined,
): Promise<string> {
	const faqContext = faqMatches
		.map(
			(f, i) =>
				`FAQ ${i + 1} (relevance: ${(f.score * 100).toFixed(0)}%):\nQ: ${f.question}\nA: ${f.answer}`,
		)
		.join("\n\n");

	const systemPrompt = `You are a professional customer support agent for IntelliDesk AI.
Write a helpful, personalized email response based on the matching FAQ answers below.

Requirements:
- Address the customer by name
- Be professional, warm, and helpful
- Directly answer their question using the FAQ information
- Include relevant steps or details from the FAQ
- If the FAQ doesn't fully cover their question, acknowledge that and offer further help
- Keep it concise (150-300 words)
- End with an offer for further assistance
- Do NOT include a subject line
- Do NOT include email headers (From, To, etc.)

Write the response body only:`;

	const userMessage = `Customer Name: ${customerName}
Account Tier: ${accountTier || "Unknown"}
Their Subject: ${subject}
Their Message (excerpt): ${body.slice(0, 1500)}

Matching FAQs:
${faqContext}`;

	try {
		return await geminiGenerate(systemPrompt, userMessage);
	} catch (error) {
		console.error("Response generation failed:", error);
		// Fallback template
		return `Hi ${customerName},

Thank you for reaching out to us. We've received your inquiry regarding "${subject}".

${faqMatches[0]?.answer || "Our team is looking into this and will get back to you shortly."}

If you have any further questions, please don't hesitate to reply to this email.

Best regards,
IntelliDesk AI Support`;
	}
}
