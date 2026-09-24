import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/db/supabase";
import type { EmailIngestPayload } from "@/types";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

const testEmails: EmailIngestPayload[] = [
	// P1 - Critical: System outage (Complaint/Escalation)
	{
		from_address: "john.doe@acmecorp.com",
		from_name: "John Doe",
		subject: "URGENT: Production API completely down - all services affected",
		body_text: `Hi Support,

Our entire production environment is DOWN. The API has been returning 503 errors for the past 30 minutes. This is affecting all our customers and we are losing revenue every minute.

We need immediate resolution. This is a P1 critical issue.

Dashboard URL: https://app.example.com
Error: 503 Service Unavailable on all endpoints

John Doe
CTO, Acme Corporation
john.doe@acmecorp.com
+1-555-0101`,
		message_id: "<test-001@acmecorp.com>",
	},

	// P2 - High: Technical issue (Technical Support)
	{
		from_address: "sarah.k@globex.io",
		from_name: "Sarah Kim",
		subject: "API rate limiting issues - getting 429 errors frequently",
		body_text: `Hello,

We're experiencing frequent 429 Too Many Requests errors on the /api/v2/analytics endpoint. Our usage is within the documented limits for our Business plan (100 req/min), but we start getting throttled after about 50 requests.

Can you check if there's something wrong with our rate limit configuration?

Account ID: GLOBEX-001
Plan: Business

Thanks,
Sarah Kim
IT Admin, Globex Industries`,
		message_id: "<test-002@globex.io>",
	},

	// P3 - Medium: Access Request
	{
		from_address: "peter.g@initech.co",
		from_name: "Peter Gibbons",
		subject: "Need admin access for new project",
		body_text: `Hi there,

I need admin access to the platform for our new data migration project. Currently I only have developer access. My manager (Bill Lumbergh) has approved this. Can you please upgrade my permissions?

Thanks,
Peter Gibbons
Software Engineer, Initech Solutions`,
		message_id: "<test-003@initech.co>",
	},

	// P3 - Medium: Billing inquiry
	{
		from_address: "pepper@starkindustries.com",
		from_name: "Pepper Potts",
		subject: "Invoice discrepancy for October billing cycle",
		body_text: `Hello Billing Team,

I noticed our October invoice (INV-2024-1089) shows a charge of $2,499 but our Enterprise plan should be $1,999/month. There's an extra $500 charge labeled "API Overage" but we haven't exceeded our limits.

Could you please review this and provide a breakdown of the charges?

Best regards,
Pepper Potts
COO, Stark Industries
pepper@starkindustries.com
+1-555-0602`,
		message_id: "<test-004@starkindustries.com>",
	},

	// P4 - Low: Feature request
	{
		from_address: "bruce@waynetech.com",
		from_name: "Bruce Wayne",
		subject: "Feature suggestion: Dark mode for dashboard",
		body_text: `Hi team,

It would be great if the dashboard supported dark mode. Many of our team members work late hours and the bright interface can be tiring. Is this something on your roadmap?

Thanks,
Bruce Wayne
Wayne Technologies`,
		message_id: "<test-005@waynetech.com>",
	},

	// P2 - Technical Support: SSO issue
	{
		from_address: "jill.v@umbrella.net",
		from_name: "Jill Valentine",
		subject: "SSO SAML authentication broken after IdP certificate renewal",
		body_text: `Hello Support,

After our IT team renewed the IdP certificate yesterday, SSO login has stopped working for all our users. We're getting "Invalid SAML Response" errors. We've updated the certificate in your admin panel but it's still not working.

This is blocking our entire team of 50+ users from accessing the platform. We need urgent help.

Error details:
- SAML Response validation failed
- StatusCode: urn:oasis:names:tc:SAML:2.0:status:Responder
- Timestamp: 2024-01-15T10:30:00Z

Jill Valentine
Security Lead, Umbrella Tech
jill.v@umbrella.net`,
		message_id: "<test-006@umbrella.net>",
	},

	// P3 - How-To/Documentation
	{
		from_address: "tom.b@globex.io",
		from_name: "Tom Brown",
		subject: "How to set up webhook notifications for report completion?",
		body_text: `Hi,

I'm trying to set up webhooks to get notified when our scheduled reports are complete. I found the webhook docs but couldn't find the specific event type for report completion. Could you point me to the right documentation or walk me through the setup?

Thanks,
Tom Brown
Data Analyst, Globex Industries`,
		message_id: "<test-007@globex.io>",
	},

	// P4 - General Inquiry
	{
		from_address: "prospect@newcompany.com",
		from_name: "New Prospect",
		subject: "Interested in your Enterprise plan - need pricing details",
		body_text: `Hello,

I'm evaluating help desk solutions for our company (200+ employees). I'm interested in your Enterprise plan. Could you provide:
1. Detailed pricing
2. Custom integration options
3. On-premise deployment availability
4. SLA guarantees

We're comparing with Zendesk and Freshdesk.

Regards,
New Prospect
Manager, New Company`,
		message_id: "<test-008@newcompany.com>",
	},

	// P2 - Data Request (GDPR)
	{
		from_address: "alex.w@umbrella.net",
		from_name: "Alex Wesker",
		subject: "GDPR Data Export Request for Umbrella Tech account",
		body_text: `Dear Data Protection Team,

Under GDPR Article 15, I am requesting a complete export of all data associated with our company account (Umbrella Tech, domain: umbrella.net). This includes:
- All user activity logs
- Stored personal data for all team members
- API usage history
- Communication records

Please process this within the statutory 30-day timeframe.

Alex Wesker
VP Engineering, Umbrella Tech
alex.w@umbrella.net
+44-20-7946-0301`,
		message_id: "<test-009@umbrella.net>",
	},

	// P1 - Complaint/Escalation: Angry customer
	{
		from_address: "tony@starkindustries.com",
		from_name: "Tony Stark",
		subject: "ESCALATION: Third time reporting this critical bug - NO RESPONSE",
		body_text: `This is unacceptable.

I've reported the data loss bug THREE times now (tickets #1234, #1256, #1278) and nobody has even acknowledged it. We are a Gold tier Enterprise customer paying $50,000/year and this is the level of support we get?

The bug: When exporting reports with more than 10,000 rows, the last 20% of data is silently dropped. This has caused us to make incorrect business decisions based on incomplete data.

I demand:
1. Immediate acknowledgment
2. A senior engineer assigned to this
3. Resolution within 24 hours
4. An explanation of why previous tickets were ignored

If this isn't resolved by end of day, I'm escalating to your CEO and exploring legal options.

Tony Stark
Founder, Stark Industries`,
		message_id: "<test-010@starkindustries.com>",
	},

	// Thread/Reply test: Reply to the first email
	{
		from_address: "john.doe@acmecorp.com",
		from_name: "John Doe",
		subject:
			"Re: URGENT: Production API completely down - all services affected",
		body_text: `Update: The API is still down. It's been 2 hours now. Each minute of downtime is costing us approximately $5,000.

Please provide an ETA for resolution IMMEDIATELY.

> Our entire production environment is DOWN...

John Doe
CTO, Acme Corporation`,
		message_id: "<test-011@acmecorp.com>",
		in_reply_to: "<test-001@acmecorp.com>",
		references: ["<test-001@acmecorp.com>"],
	},

	// Spam test
	{
		from_address: "winner@lottery-prize.xyz",
		from_name: "Prize Department",
		subject: "Congratulations! You've won $1,000,000!!!",
		body_text: `CONGRATULATIONS!!!

You have been selected as the winner of our INTERNATIONAL LOTTERY PRIZE of $1,000,000 USD!!! 

To claim your prize, please send your bank account details, full name, and social security number to claims@lottery-prize.xyz.

ACT NOW - this offer expires in 24 hours!!! Don't miss this AMAZING opportunity!!!

Click here: http://totallylegit.xyz/claim-prize`,
		message_id: "<spam-001@lottery-prize.xyz>",
	},

	// Duplicate test: Similar to test-002
	{
		from_address: "sarah.k@globex.io",
		from_name: "Sarah Kim",
		subject: "Re: API rate limiting issues - still getting 429 errors",
		body_text: `Hi, just following up on my previous email about the 429 rate limiting errors. The issue is still happening. Our rate limit appears to be capped at 50 requests/minute despite our Business plan allowing 100.

Can someone please look into this?

Sarah Kim
IT Admin, Globex Industries`,
		message_id: "<test-012@globex.io>",
		in_reply_to: "<test-002@globex.io>",
		references: ["<test-002@globex.io>"],
	},

	// P3 - Hardware/Infrastructure question
	{
		from_address: "lucius@waynetech.com",
		from_name: "Lucius Fox",
		subject: "On-premise deployment requirements and EU hosting options",
		body_text: `Hello,

We're evaluating on-premise deployment for data sovereignty requirements. Could you clarify:

1. What are the minimum hardware specifications?
2. Is Kubernetes required or can we use Docker Compose?
3. Do you support EU-only data hosting (specifically Frankfurt)?
4. What's the update/patching process for on-prem?

Lucius Fox
CTO, Wayne Technologies
lucius@waynetech.com
+1-555-0502`,
		message_id: "<test-013@waynetech.com>",
	},

	// Multilingual: Spanish
	{
		from_address: "carlos@initech.co",
		from_name: "Carlos Rivera",
		subject: "No puedo acceder a mi cuenta - Error de autenticación",
		body_text: `Hola equipo de soporte,

No puedo iniciar sesión en mi cuenta desde esta mañana. El sistema muestra un error de autenticación. He intentado restablecer mi contraseña pero no recibo el correo electrónico de verificación.

¿Pueden ayudarme a recuperar el acceso a mi cuenta?

Gracias,
Carlos Rivera
Initech Solutions`,
		message_id: "<test-014@initech.co>",
	},

	// P4 - Low: Simple how-to
	{
		from_address: "milton@initech.co",
		from_name: "Milton Waddams",
		subject: "Where can I find the API documentation?",
		body_text: `Hi,

I'm new to the platform and I'm looking for the API documentation. I checked the main website but couldn't find a direct link. Could you point me in the right direction?

Thanks,
Milton`,
		message_id: "<test-015@initech.co>",
	},

	// P2 - Billing: Double charge
	{
		from_address: "mike.chen@acmecorp.com",
		from_name: "Mike Chen",
		subject: "Double charged for November - need refund",
		body_text: `Hello,

Our credit card was charged twice for the November billing cycle:
- Nov 1: $1,999 (correct charge)
- Nov 3: $1,999 (duplicate charge)

Transaction IDs: TXN-9981123 and TXN-9981456

Please process a refund for the duplicate charge as soon as possible.

Mike Chen
Product Manager, Acme Corporation
mike.chen@acmecorp.com`,
		message_id: "<test-016@acmecorp.com>",
	},

	// New lead - unknown sender
	{
		from_address: "random.user@gmail.com",
		from_name: "Random User",
		subject: "Do you offer a free trial?",
		body_text: `Hi,

I came across your product and I'm interested. Do you have a free trial available? If so, how long is it and what features are included?

Thanks`,
		message_id: "<test-017@gmail.com>",
	},

	// P3 - Feature request with thoughtful details
	{
		from_address: "jane.smith@acmecorp.com",
		from_name: "Jane Smith",
		subject: "Feature request: CSV export for custom report builder",
		body_text: `Hi Product Team,

I'd like to request the ability to export custom reports in CSV format. Currently, we can only export as PDF. Our data team needs CSV for further analysis in Excel and Python.

Use case:
- Weekly metrics export for our BI pipeline
- Ad-hoc data analysis by our analytics team
- Integration with our internal reporting system

This would save us several hours per week of manual data entry.

Thanks,
Jane Smith
Developer, Acme Corporation`,
		message_id: "<test-018@acmecorp.com>",
	},

	// P2 - Technical Support: Data integrity issue
	{
		from_address: "tony@starkindustries.com",
		from_name: "Tony Stark",
		subject: "Data inconsistency in analytics dashboard vs API response",
		body_text: `Team,

We've found a significant discrepancy between the analytics dashboard and the API responses:
- Dashboard shows 15,234 active users for this week
- API /analytics/users endpoint returns 12,891 for the same period

The difference of ~2,300 users is too large to be a timing issue. We suspect there's a bug in either the dashboard aggregation or the API query.

This impacts our board reporting. Please investigate.

Tony Stark
Stark Industries`,
		message_id: "<test-019@starkindustries.com>",
	},
];

export async function POST() {
	if (IS_PRODUCTION) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	try {
		const supabase = supabaseAdmin;

		// Look up the default org (sharpflow) to tag all emails
		const { data: org, error: orgError } = await supabase
			.from("organizations")
			.select("id")
			.eq("slug", "sharpflow")
			.single();

		if (orgError || !org) {
			return NextResponse.json(
				{
					error:
						"Organization 'sharpflow' not found. Please run migration 005 first.",
				},
				{ status: 400 },
			);
		}
		const orgId = org.id;

		// Insert test emails directly (not through the pipeline)
		const results = [];
		for (const email of testEmails) {
			const { data, error } = await supabase
				.from("emails")
				.insert({
					message_id: email.message_id || null,
					in_reply_to: email.in_reply_to || null,
					references_header: email.references || [],
					from_address: email.from_address,
					from_name: email.from_name || null,
					to_address: email.to_address || "support@intellidesk.ai",
					cc: email.cc || null,
					subject: email.subject,
					body_text: email.body_text,
					body_html: email.body_html || null,
					raw_headers: null,
					received_at: new Date().toISOString(),
					processed: false,
					is_spam: false,
					language: null,
					embedding_id: null,
					organization_id: orgId,
				})
				.select("id, subject")
				.single();

			if (error) {
				results.push({ subject: email.subject, error: error.message });
			} else {
				results.push({
					id: data.id,
					subject: data.subject,
					status: "inserted",
				});
			}
		}

		const inserted = results.filter((r) => "id" in r).length;
		const failed = results.filter((r) => "error" in r).length;

		return NextResponse.json({
			success: true,
			total: testEmails.length,
			inserted,
			failed,
			results,
			message: `${inserted} test emails inserted. Process them via the Email Queue page to trigger the AI pipeline.`,
		});
	} catch (error) {
		console.error("Test emails error:", error);
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to insert test emails",
			},
			{ status: 500 },
		);
	}
}
