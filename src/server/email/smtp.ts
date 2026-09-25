import "server-only";
import nodemailer from "nodemailer";

export interface SmtpConfig {
	host: string;
	port: number;
	user: string;
	pass: string;
}

// TLS is mandatory: implicit TLS on 465, STARTTLS required on anything else,
// so credentials are never sent over an unencrypted connection.
export function createSmtpTransport(config: SmtpConfig) {
	const implicitTls = config.port === 465;
	return nodemailer.createTransport({
		host: config.host,
		port: config.port,
		secure: implicitTls,
		requireTLS: !implicitTls,
		auth: { user: config.user, pass: config.pass },
		tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
		connectionTimeout: 15_000,
		greetingTimeout: 15_000,
		socketTimeout: 30_000,
	});
}

interface SendEmailOptions {
	to: string;
	subject: string;
	text: string;
	html?: string;
	/** Our own Message-ID, e.g. "<uuid@example.com>", so a customer's reply can be matched back to this ticket. */
	messageId?: string;
	inReplyTo?: string;
	references?: string[];
	smtpConfig?: SmtpConfig;
	/** Display name on the From header, e.g. the customer-facing company name. */
	fromName?: string;
	/**
	 * Marks the message as machine-generated (RFC 3834 "Auto-Submitted: auto-replied"),
	 * so well-behaved autoresponders on the other side don't answer it and start a loop.
	 */
	automatic?: boolean;
}

export type SendEmailResult = { ok: true; messageId: string } | { ok: false; error: string };

/** Header values that came from inbound mail must not carry line breaks. */
function headerSafe(value: string): string {
	return value.replace(/[\r\n]+/g, " ").trim();
}

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
	const config = options.smtpConfig;
	if (!config?.user || !config?.pass) {
		return { ok: false, error: "No mailbox credentials configured" };
	}

	const fromName = headerSafe(options.fromName ?? "Support").replace(/"/g, "'");
	try {
		const info = await createSmtpTransport(config).sendMail({
			from: `"${fromName}" <${config.user}>`,
			to: options.to,
			subject: headerSafe(options.subject),
			text: options.text,
			html: options.html,
			messageId: options.messageId,
			inReplyTo: options.inReplyTo,
			references: options.references?.join(" "),
			headers: options.automatic
				? { "Auto-Submitted": "auto-replied", "X-Auto-Response-Suppress": "All" }
				: undefined,
		});
		return { ok: true, messageId: info.messageId };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error("SMTP send error:", message);
		return { ok: false, error: message };
	}
}

/** A globally unique Message-ID on the mailbox's own domain (RFC 5322 §3.6.4). */
export function newMessageId(mailboxAddress: string, id: string): string {
	const domain = mailboxAddress.split("@")[1]?.toLowerCase() || "intellidesk.local";
	return `<${id}@${domain}>`;
}

export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

export function buildAutoResponseEmail(
	customerName: string,
	ticketNumber: string,
	slaTime: string,
	responseBody: string,
	originalSubject: string,
	companyName = "Support",
) {
	const subject = headerSafe(`Re: ${originalSubject} [${ticketNumber}]`);

	const text = `Hi ${customerName},

${responseBody}

---
Ticket: ${ticketNumber}
Expected Response Time: ${slaTime}

Best regards,
${companyName} Support Team

This is an automated response. A human agent has been notified and will follow up if needed.`;

	// Every interpolated value is escaped: the customer name comes from the
	// sender's own From header and the body from a language model.
	const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px;">
  <p>Hi ${escapeHtml(customerName)},</p>
  <div style="margin: 16px 0; white-space: pre-wrap;">${escapeHtml(responseBody)}</div>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
  <div style="color: #6b7280; font-size: 14px;">
    <p><strong>Ticket:</strong> ${escapeHtml(ticketNumber)}</p>
    <p><strong>Expected Response Time:</strong> ${escapeHtml(slaTime)}</p>
  </div>
  <p style="color: #6b7280; font-size: 14px;">
    Best regards,<br/>
    <strong>${escapeHtml(companyName)} Support Team</strong>
  </p>
  <p style="color: #9ca3af; font-size: 12px; margin-top: 16px;">
    This is an automated response. A human agent has been notified and will follow up if needed.
  </p>
</div>`;

	return { subject, text, html };
}
