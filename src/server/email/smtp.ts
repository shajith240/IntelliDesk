import "server-only";
import nodemailer from "nodemailer";

export interface SmtpConfig {
	host: string;
	port: number;
	user: string;
	pass: string;
}

function getTransporter(override?: SmtpConfig) {
	if (!override?.user || !override?.pass) {
		return null;
	}
	return nodemailer.createTransport({
		host: override.host || "smtp.gmail.com",
		port: override.port || 587,
		secure: false,
		auth: { user: override.user, pass: override.pass },
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
}

export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
	const transporter = getTransporter(options.smtpConfig);
	if (!transporter) {
		console.warn("SMTP credentials not configured, skipping send");
		return false;
	}

	const user = options.smtpConfig!.user;

	try {
		await transporter.sendMail({
			from: `"IntelliDesk AI Support" <${user}>`,
			to: options.to,
			subject: options.subject,
			text: options.text,
			html: options.html,
			inReplyTo: options.inReplyTo,
			references: options.references?.join(" "),
		});
		return true;
	} catch (err) {
		console.error("SMTP send error:", err);
		return false;
	}
}

export function buildAutoResponseEmail(
	customerName: string,
	ticketNumber: string,
	slaTime: string,
	responseBody: string,
	originalSubject: string,
) {
	const subject = `Re: ${originalSubject} [${ticketNumber}]`;

	const text = `Hi ${customerName},

${responseBody}

---
Ticket: ${ticketNumber}
Expected Response Time: ${slaTime}

Best regards,
IntelliDesk AI Support Team

This is an automated response. A human agent has been notified and will follow up if needed.`;

	const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px;">
  <p>Hi ${customerName},</p>
  <div style="margin: 16px 0; white-space: pre-wrap;">${responseBody}</div>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
  <div style="color: #6b7280; font-size: 14px;">
    <p><strong>Ticket:</strong> ${ticketNumber}</p>
    <p><strong>Expected Response Time:</strong> ${slaTime}</p>
  </div>
  <p style="color: #6b7280; font-size: 14px;">
    Best regards,<br/>
    <strong>IntelliDesk AI Support Team</strong>
  </p>
  <p style="color: #9ca3af; font-size: 12px; margin-top: 16px;">
    This is an automated response. A human agent has been notified and will follow up if needed.
  </p>
</div>`;

	return { subject, text, html };
}
