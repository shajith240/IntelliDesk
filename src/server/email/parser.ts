import "server-only";
import type { ExtractedSignature } from "@/types";

/**
 * Strip HTML tags from email body, returning plain text
 */
export function stripHtml(html: string): string {
	return html
		.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
		.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Clean email body for processing: strip quoted replies, disclaimers, etc.
 */
export function cleanEmailBody(text: string): string {
	const lines = text.split("\n");
	const cleaned: string[] = [];

	for (const line of lines) {
		// Stop at quoted reply markers
		if (/^On .+ wrote:$/i.test(line.trim())) break;
		if (/^-{3,}\s*Original Message\s*-{3,}$/i.test(line.trim())) break;
		if (/^>{2,}/.test(line.trim())) break;
		if (/^From:.*Sent:.*To:/i.test(line.trim())) break;

		cleaned.push(line);
	}

	return cleaned.join("\n").trim();
}

/**
 * Extract signature block from email body
 */
export function extractSignature(body: string): ExtractedSignature | null {
	const lines = body.split("\n");
	let sigStart = -1;

	// Look for common signature markers
	for (let i = lines.length - 1; i >= Math.max(0, lines.length - 15); i--) {
		const line = lines[i].trim();
		if (
			line === "--" ||
			line === "---" ||
			line === "- -" ||
			/^_{3,}$/.test(line)
		) {
			sigStart = i;
			break;
		}
		// Look for "Regards", "Best", "Thanks" patterns near end
		if (
			/^(best\s*regards|regards|thanks|thank\s*you|sincerely|cheers)/i.test(
				line,
			)
		) {
			sigStart = i;
			break;
		}
	}

	if (sigStart === -1) {
		// Try last 8 lines as heuristic
		sigStart = Math.max(0, lines.length - 8);
	}

	const sigLines = lines.slice(sigStart).join("\n");

	const result: ExtractedSignature = {
		name: null,
		role: null,
		company: null,
		phone: null,
		email: null,
	};

	// Extract phone number
	const phoneMatch = sigLines.match(
		/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/,
	);
	if (phoneMatch) result.phone = phoneMatch[0].trim();

	// Extract email from signature
	const emailMatch = sigLines.match(/[\w.-]+@[\w.-]+\.\w+/);
	if (emailMatch) result.email = emailMatch[0];

	// Extract role/title patterns
	const rolePatterns = [
		/(?:title|designation|role|position)\s*:\s*(.+)/i,
		/\b(Senior|Jr\.|Sr\.|Lead|Chief|Head|Manager|Director|VP|CTO|CEO|CFO|Engineer|Developer|Analyst|Consultant|Administrator|Admin|Specialist|Coordinator|Associate|Executive|Officer)\b.*$/im,
	];
	for (const pat of rolePatterns) {
		const match = sigLines.match(pat);
		if (match) {
			result.role = (match[1] || match[0]).trim().slice(0, 100);
			break;
		}
	}

	// Extract company
	const companyPatterns = [
		/(?:company|organization|org)\s*:\s*(.+)/i,
		/\b(?:at|@)\s+([A-Z][A-Za-z\s&.]+(?:Ltd|Inc|Corp|LLC|Pvt|Technologies|Solutions|Services|Group|Systems|Enterprises)?\.?)/,
	];
	for (const pat of companyPatterns) {
		const match = sigLines.match(pat);
		if (match) {
			result.company = match[1].trim().slice(0, 100);
			break;
		}
	}

	// Extract name (first non-empty line after signature marker that looks like a name)
	const nameLines = lines
		.slice(sigStart)
		.map((l) => l.trim())
		.filter(Boolean);
	for (const line of nameLines) {
		if (/^(best|regards|thanks|thank|sincerely|cheers|--|___)/i.test(line))
			continue;
		if (line.length > 50) continue;
		if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+){0,3}$/.test(line)) {
			result.name = line;
			break;
		}
	}

	const hasData = Object.values(result).some((v) => v !== null);
	return hasData ? result : null;
}

/**
 * Detect if text contains Hindi (Devanagari) characters
 */
export function detectLanguage(text: string): string {
	const devanagariRegex = /[\u0900-\u097F]/;
	const hasDevanagari = devanagariRegex.test(text);
	const hasLatin = /[a-zA-Z]/.test(text);

	if (hasDevanagari && hasLatin) return "mixed";
	if (hasDevanagari) return "hindi";
	return "english";
}

/**
 * Extract ticket references from email text
 * Patterns: #12345, Ticket-12345, TKT-00001, INC000123
 */
export function extractTicketReferences(text: string): string[] {
	const patterns = [
		/TKT-\d{5}/gi,
		/Ticket[- #]?\d{4,}/gi,
		/#(\d{4,})/g,
		/INC\d{5,}/gi,
		/CASE[- ]?\d{4,}/gi,
	];

	const refs = new Set<string>();
	for (const pattern of patterns) {
		const matches = text.matchAll(pattern);
		for (const match of matches) {
			refs.add(match[0].toUpperCase());
		}
	}

	return Array.from(refs);
}

/**
 * Check if email appears to be spam, promotional, or irrelevant (not a support request)
 */
export function isLikelySpam(
	subject: string,
	body: string,
	from: string,
): boolean {
	const spamKeywords = [
		"click here to unsubscribe",
		"limited time offer",
		"act now before it",
		"free gift",
		"you have been selected",
		"congratulations you won",
		"claim your prize",
		"no obligation",
		"special promotion",
		"buy one get one",
		"order now and save",
		"discount offer expires",
		"marketing email",
		"this is an advertisement",
	];

	// Automated / non-support email indicators
	const automatedKeywords = [
		"research report",
		"lead analysis",
		"business intelligence",
		"person profile",
		"company profile",
		"linkedin",
		"profile picture",
		"company logo",
		"newsletter",
		"weekly digest",
		"daily summary",
		"notification from",
		"do not reply to this email",
		"this is an automated",
		"auto-generated",
		"noreply",
		"social media update",
		"new follower",
		"new connection",
		"invitation to connect",
		"job alert",
		"suggested for you",
		"trending on",
		"your daily briefing",
		"security alert",
		"sign-in attempt",
		"verify your email",
		"confirm your account",
		"password reset",
		"two-factor authentication",
		"one-time password",
		"verification code",
	];

	const lowerBody = body.toLowerCase();
	const lowerSubject = subject.toLowerCase();
	const lowerFrom = from.toLowerCase();

	let spamScore = 0;

	for (const kw of spamKeywords) {
		if (lowerBody.includes(kw)) spamScore++;
		if (lowerSubject.includes(kw)) spamScore++;
	}

	// Check for automated/irrelevant email content
	for (const kw of automatedKeywords) {
		if (lowerBody.includes(kw)) spamScore++;
		if (lowerSubject.includes(kw)) spamScore++;
	}

	// Check for noreply, newsletter, or automated sender addresses
	if (
		/noreply|no-reply|donotreply|newsletter|marketing|notifications?@|mailer|digest|alerts?@|updates?@/i.test(
			from,
		)
	) {
		spamScore += 2;
	}

	// Skip emails from the same address as the IMAP user (self-sent emails)
	const imapUser = process.env.IMAP_USER?.toLowerCase() || "";
	if (imapUser && lowerFrom === imapUser) {
		spamScore += 3;
	}

	// Check for excessive links
	const linkCount = (body.match(/https?:\/\//g) || []).length;
	if (linkCount > 15) spamScore += 2;

	// LinkedIn/social media automated emails
	if (/linkedin|facebook|twitter|instagram|glassdoor|indeed/i.test(lowerFrom)) {
		spamScore += 3;
	}

	return spamScore >= 3;
}

/**
 * Strip Re:, Fwd:, FW:, etc. from subject
 */
export function normalizeSubject(subject: string): string {
	return subject
		.replace(/^(Re|Fwd|FW|Fw)\s*:\s*/gi, "")
		.replace(/\[.*?\]\s*/g, "")
		.trim();
}
