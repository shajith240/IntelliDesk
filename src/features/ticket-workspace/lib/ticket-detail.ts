import type { AIClassification, TicketDetail } from "@/types/api";

/** `ticket.ai_classification` is untyped JSON — type-check every field before use. */
export function parseClassification(raw: unknown): AIClassification | null {
	if (!raw || typeof raw !== "object") return null;
	const value = raw as Record<string, unknown>;
	const result: AIClassification = {};

	if (typeof value.category === "string") result.category = value.category;
	if (typeof value.severity === "string") result.severity = value.severity;
	if (typeof value.confidence === "number" && !Number.isNaN(value.confidence)) {
		result.confidence = value.confidence;
	}
	if (typeof value.sentiment === "string") result.sentiment = value.sentiment;
	if (typeof value.language === "string") result.language = value.language;
	if (typeof value.is_spam === "boolean") result.is_spam = value.is_spam;
	if (typeof value.summary === "string") result.summary = value.summary;
	if (typeof value.reasoning === "string") result.reasoning = value.reasoning;
	if (Array.isArray(value.key_entities)) {
		result.key_entities = value.key_entities.filter((v): v is string => typeof v === "string");
	}
	if (Array.isArray(value.suggested_tags)) {
		result.suggested_tags = value.suggested_tags.filter((v): v is string => typeof v === "string");
	}
	if (typeof value.requires_human_review === "boolean") {
		result.requires_human_review = value.requires_human_review;
	}

	return Object.keys(result).length > 0 ? result : null;
}

/** The most recent customer message's sender, else the linked contact's email. */
export function findRecipient(ticket: TicketDetail): string | null {
	const customerMessages = ticket.ticket_messages
		.filter((row) => row.kind === "customer" && row.emails)
		.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
	if (customerMessages[0]?.emails) return customerMessages[0].emails.from_address;
	return ticket.contacts?.email ?? null;
}
