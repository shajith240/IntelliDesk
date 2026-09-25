// Pure logic (no I/O, no secrets), unit-tested in tests/unit/automated-mail.test.ts.
import type { RawEmail } from "@/types";

// Recognising machine-generated mail, so a helpdesk never answers a robot.
// Two autoresponders replying to each other is the classic mail loop; the
// standard defences are RFC 3834 (Auto-Submitted), the de-facto Precedence and
// X-Autoreply headers, mailing-list headers (RFC 2369/2919), the null
// Return-Path of bounces (RFC 5321), and well-known system senders.

export type AutomatedKind =
	/** Sent by this workspace's own mailbox (our reply copied back, forwarding loops). */
	| "own"
	/** Delivery failure report. */
	| "bounce"
	/** Out-of-office and other automatic replies: no new information, never ticketed. */
	| "auto_reply"
	/** Newsletters, mailing lists, no-reply senders: may be ticketed, never auto-answered. */
	| "bulk";

export interface AutomatedMail {
	kind: AutomatedKind;
	reason: string;
}

/** mailparser gives some headers as parsed objects; reduce any value to text. */
function headerText(headers: Record<string, unknown>, name: string): string | null {
	const value = headers[name];
	if (value === undefined || value === null) return null;
	if (typeof value === "string") return value;
	if (typeof value === "object") {
		const obj = value as { text?: unknown; value?: unknown };
		if (typeof obj.text === "string") return obj.text;
		if (typeof obj.value === "string") return obj.value;
		try {
			return JSON.stringify(value);
		} catch {
			return "";
		}
	}
	return String(value);
}

function lowerKeys(headers: Record<string, unknown> | undefined): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(headers ?? {})) out[key.toLowerCase()] = value;
	return out;
}

const SYSTEM_SENDER = /^(mailer-daemon|postmaster|mail-daemon|bounce[s]?|bounce[-+][^@]*)@/i;
const NO_REPLY_SENDER = /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|notifications?|alerts?)[^@]*@/i;
const OOO_SUBJECT = /^(auto(matic)?\s*(reply|response)|out of (the )?office|abwesend|absence|vacation)\b/i;

export function detectAutomatedMail(email: RawEmail, ownAddress: string | null): AutomatedMail | null {
	const from = email.from_address.trim().toLowerCase();
	const headers = lowerKeys(email.raw_headers as Record<string, unknown> | undefined);

	if (ownAddress && from === ownAddress.trim().toLowerCase()) {
		return { kind: "own", reason: "Sent from this workspace's own mailbox" };
	}

	const returnPath = headerText(headers, "return-path");
	if (SYSTEM_SENDER.test(from) || (returnPath !== null && /^\s*<?\s*>?\s*$/.test(returnPath))) {
		return { kind: "bounce", reason: "Delivery status notification" };
	}
	// Parsed as { value, params }: the report-type lives in params, so look at all of it.
	const rawContentType = headers["content-type"];
	const contentType = typeof rawContentType === "string" ? rawContentType : JSON.stringify(rawContentType ?? "");
	if (/multipart\/report/i.test(contentType) && /delivery-status/i.test(contentType)) {
		return { kind: "bounce", reason: "Delivery status notification" };
	}

	const autoSubmitted = headerText(headers, "auto-submitted")?.trim().toLowerCase();
	if (autoSubmitted && autoSubmitted !== "no") {
		return { kind: "auto_reply", reason: `Auto-Submitted: ${autoSubmitted}` };
	}
	if (headers["x-autoreply"] !== undefined || headers["x-autorespond"] !== undefined || headers["x-autoreply-from"] !== undefined) {
		return { kind: "auto_reply", reason: "X-Autoreply header" };
	}
	const precedence = headerText(headers, "precedence")?.trim().toLowerCase();
	if (precedence === "auto_reply") return { kind: "auto_reply", reason: "Precedence: auto_reply" };
	if (OOO_SUBJECT.test(email.subject.trim())) {
		return { kind: "auto_reply", reason: "Out-of-office subject" };
	}

	if (precedence === "bulk" || precedence === "junk" || precedence === "list") {
		return { kind: "bulk", reason: `Precedence: ${precedence}` };
	}
	if (headers["list"] !== undefined || headers["list-id"] !== undefined || headers["list-unsubscribe"] !== undefined) {
		return { kind: "bulk", reason: "Mailing-list headers" };
	}
	if (NO_REPLY_SENDER.test(from)) {
		return { kind: "bulk", reason: "No-reply sender" };
	}
	return null;
}
