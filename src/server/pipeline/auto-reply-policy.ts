import "server-only";
import { supabaseAdmin } from "@/server/db/supabase";
import type { ClassificationResult, EmailCategory } from "@/types";

// Whether an AI answer may be emailed without a person approving it. Every
// rule here can only say "no"; the default is a draft for an agent. Modelled
// on how production AI agents roll out (Intercom Fin, Zendesk AI agents):
// explicit opt-in, topic allowlist, sentiment and risk hand-off, rate limits.

/** Topics where a knowledge-base answer is low-risk. Billing, access, data and complaints always go to a person. */
const AUTO_SEND_CATEGORIES: ReadonlySet<EmailCategory> = new Set([
	"How-To/Documentation",
	"General Inquiry",
	"Feature Request",
	"Technical Support",
]);

/** At most this many automatic replies to one address per day, whatever else happens. */
const MAX_AI_REPLIES_PER_RECIPIENT_PER_DAY = 2;

export interface AutoSendDecision {
	allowed: boolean;
	reason: string;
}

export async function decideAutoSend(input: {
	orgId: string;
	recipient: string;
	classification: ClassificationResult;
	/** Set when the email looks machine-generated or bulk (see automated.ts). */
	automatedReason: string | null;
}): Promise<AutoSendDecision> {
	const { orgId, recipient, classification } = input;

	const { data: org, error } = await supabaseAdmin
		.from("organizations")
		.select("ai_auto_send")
		.eq("id", orgId)
		.maybeSingle();
	if (error) throw error;
	if (!org?.ai_auto_send) return { allowed: false, reason: "Automatic sending is off for this workspace" };

	if (input.automatedReason) return { allowed: false, reason: `Automated sender (${input.automatedReason})` };
	if (classification.requires_human_review) return { allowed: false, reason: "Flagged for human review" };
	if (classification.sentiment === "negative" || classification.sentiment === "angry") {
		return { allowed: false, reason: `Customer sentiment is ${classification.sentiment}` };
	}
	if (!AUTO_SEND_CATEGORIES.has(classification.category)) {
		return { allowed: false, reason: `${classification.category} always goes to a person` };
	}

	const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
	const { count, error: countError } = await supabaseAdmin
		.from("ticket_messages")
		.select("id, emails!inner(to_address)", { count: "exact", head: true })
		.eq("organization_id", orgId)
		.eq("author_type", "ai")
		.eq("emails.to_address", recipient)
		.gte("created_at", since);
	if (countError) throw countError;
	if ((count ?? 0) >= MAX_AI_REPLIES_PER_RECIPIENT_PER_DAY) {
		return { allowed: false, reason: "Daily automatic-reply limit reached for this sender" };
	}

	return { allowed: true, reason: "Eligible for automatic reply" };
}
