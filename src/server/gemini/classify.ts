import "server-only";
import { geminiGenerate } from "./generate";
import { generateEmbedding } from "./embeddings";
import type { ClassificationResult, EmailCategory, Severity } from "@/types";

const VALID_CATEGORIES: EmailCategory[] = [
	"Technical Support",
	"Access Request",
	"Billing/Invoice",
	"Feature Request",
	"Hardware/Infrastructure",
	"How-To/Documentation",
	"Data Request",
	"Complaint/Escalation",
	"General Inquiry",
];

const VALID_SEVERITIES: Severity[] = ["P1", "P2", "P3", "P4"];

const CLASSIFICATION_PROMPT = `You are an AI email classifier for a B2B SaaS helpdesk.
Analyze the following email and return a JSON object with these fields:

{
  "is_spam": boolean,
  "category": one of [${VALID_CATEGORIES.map((c) => `"${c}"`).join(", ")}],
  "severity": one of ["P1", "P2", "P3", "P4"],
  "language": "english" | "hindi" | "mixed" | "other",
  "sentiment": "positive" | "neutral" | "negative" | "angry",
  "confidence": number between 0 and 1,
  "summary": "1-2 sentence summary of the email",
  "key_entities": ["entity1", "entity2"],
  "suggested_tags": ["tag1", "tag2"],
  "requires_human_review": boolean,
  "reasoning": "brief explanation of classification decision"
}

Classification rules:
- P1 (Critical): System down, security breach, data loss, ALL customers affected
- P2 (High): Major feature broken, significant impact, revenue affecting  
- P3 (Medium): Minor issue, workaround available, single user affected
- P4 (Low): General inquiry, feature request, feedback, cosmetic issue

Category definitions:
- Technical Support: Bugs, errors, integration issues, API problems, connection/timeout issues
- Access Request: Password reset, user access, account settings, SSO, team management
- Billing/Invoice: Invoices, payments, pricing, subscription changes, refunds, charges
- Feature Request: New features, enhancements, improvements, product suggestions
- Hardware/Infrastructure: Server issues, deployment, hosting, on-premise, system requirements
- How-To/Documentation: Product questions, how-to, documentation requests, setup guides
- Data Request: Data exports, GDPR requests, data deletion, analytics data
- Complaint/Escalation: Dissatisfaction, escalation requests, SLA violations, angry customers
- General Inquiry: Trial info, pricing info, general product questions, partnership inquiries

Spam indicators: Marketing blasts, lottery/prize offers, unsubscribe links, promotional language, no clear customer intent.

RESPOND WITH ONLY THE JSON OBJECT. NO MARKDOWN FORMATTING.`;

export async function classifyEmail(
	subject: string,
	body: string,
	fromAddress: string,
	fromName: string | null,
): Promise<ClassificationResult> {
	const emailContent = `From: ${fromName || "Unknown"} <${fromAddress}>
Subject: ${subject}

${body.slice(0, 3000)}`;

	try {
		const text = await geminiGenerate(CLASSIFICATION_PROMPT, emailContent);

		// Strip markdown code fences if present
		const jsonStr = text
			.replace(/^```(?:json)?\s*/i, "")
			.replace(/\s*```$/i, "");
		const parsed = JSON.parse(jsonStr);

		// Validate and sanitize
		const classification: ClassificationResult = {
			is_spam: Boolean(parsed.is_spam),
			category: VALID_CATEGORIES.includes(parsed.category)
				? parsed.category
				: "General Inquiry",
			severity: VALID_SEVERITIES.includes(parsed.severity)
				? parsed.severity
				: "P3",
			language: ["english", "hindi", "mixed", "other"].includes(parsed.language)
				? parsed.language
				: "english",
			sentiment: ["positive", "neutral", "negative", "angry"].includes(
				parsed.sentiment,
			)
				? parsed.sentiment
				: "neutral",
			confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
			summary: String(parsed.summary || "").slice(0, 500),
			key_entities: Array.isArray(parsed.key_entities)
				? parsed.key_entities.map(String).slice(0, 10)
				: [],
			suggested_tags: Array.isArray(parsed.suggested_tags)
				? parsed.suggested_tags.map(String).slice(0, 10)
				: [],
			requires_human_review:
				parsed.confidence < 0.8 || Boolean(parsed.requires_human_review),
			reasoning: String(parsed.reasoning || "").slice(0, 1000),
		};

		return classification;
	} catch (error) {
		console.error("Classification failed:", error);
		// Return safe defaults
		return {
			is_spam: false,
			category: "General Inquiry",
			severity: "P3",
			language: "english",
			sentiment: "neutral",
			confidence: 0,
			summary: "Classification failed - requires manual review",
			key_entities: [],
			suggested_tags: [],
			requires_human_review: true,
			reasoning: `Classification error: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}

/**
 * Generate embedding for an email (used for dedup + search)
 */
export async function generateEmailEmbedding(
	subject: string,
	body: string,
): Promise<number[]> {
	const text = `${subject}\n\n${body}`.slice(0, 5000);
	return generateEmbedding(text);
}
