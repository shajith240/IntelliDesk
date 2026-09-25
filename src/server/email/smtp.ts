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
	inReplyTo?: string;
	references?: string[];
	smtpConfig?: SmtpConfig;
	/** Display name on the From header, e.g. the customer-facing company name. */
	fromName?: string;
}

/** Header values that came from inbound mail must not carry line breaks. */
function headerSafe(value: string): string {
	return value.replace(/[\r\n]+/g, " ").trim();
}

export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
	const config = options.smtpConfig;
	if (!config?.user || !config?.pass) {
		console.warn("SMTP credentials not configured, skipping send");
		return false;
	}

	const fromName = headerSafe(options.fromName ?? "Support").replace(/"/g, "'");
	try {
		await createSmtpTransport(config).sendMail({
			from: `"${fromName}" <${config.user}>`,
			to: options.to,
			subject: headerSafe(options.subject),
			text: options.text,
			html: options.html,
			inReplyTo: options.inReplyTo,
			references: options.references?.join(" "),
		});
		return true;
	} catch (err) {
		console.error("SMTP send error:", err instanceof Error ? err.message : err);
		return false;
	}
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
