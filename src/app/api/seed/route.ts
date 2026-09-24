import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/db/supabase";
import { generateEmbedding } from "@/server/gemini/embeddings";
import { upsertVectors } from "@/server/db/pinecone";
import { v4 as uuidv4 } from "uuid";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

const accounts = [
	{
		id: uuidv4(),
		domain: "acmecorp.com",
		company_name: "Acme Corporation",
		tier: "Gold",
		csm_name: "Alice Johnson",
		csm_email: "alice.j@yourcompany.com",
		plan: "Enterprise",
		location: "San Francisco, CA",
	},
	{
		id: uuidv4(),
		domain: "globex.io",
		company_name: "Globex Industries",
		tier: "Silver",
		csm_name: "Bob Smith",
		csm_email: "bob.s@yourcompany.com",
		plan: "Business",
		location: "New York, NY",
	},
	{
		id: uuidv4(),
		domain: "initech.co",
		company_name: "Initech Solutions",
		tier: "Bronze",
		csm_name: null,
		csm_email: null,
		plan: "Starter",
		location: "Austin, TX",
	},
	{
		id: uuidv4(),
		domain: "umbrella.net",
		company_name: "Umbrella Tech",
		tier: "Gold",
		csm_name: "Carol Davis",
		csm_email: "carol.d@yourcompany.com",
		plan: "Enterprise",
		location: "London, UK",
	},
	{
		id: uuidv4(),
		domain: "waynetech.com",
		company_name: "Wayne Technologies",
		tier: "Silver",
		csm_name: "Dan Lee",
		csm_email: "dan.l@yourcompany.com",
		plan: "Business",
		location: "Chicago, IL",
	},
	{
		id: uuidv4(),
		domain: "starkindustries.com",
		company_name: "Stark Industries",
		tier: "Gold",
		csm_name: "Emma Wilson",
		csm_email: "emma.w@yourcompany.com",
		plan: "Enterprise",
		location: "Los Angeles, CA",
	},
];

function makeContacts(accts: typeof accounts) {
	return [
		{
			id: uuidv4(),
			account_id: accts[0].id,
			email: "john.doe@acmecorp.com",
			name: "John Doe",
			role: "CTO",
			department: "Engineering",
			phone: "+1-555-0101",
			subscribed_modules: ["analytics", "reporting"],
			is_lead: false,
			lead_status: null,
		},
		{
			id: uuidv4(),
			account_id: accts[0].id,
			email: "jane.smith@acmecorp.com",
			name: "Jane Smith",
			role: "Developer",
			department: "Engineering",
			phone: "+1-555-0102",
			subscribed_modules: ["api", "sdk"],
			is_lead: false,
			lead_status: null,
		},
		{
			id: uuidv4(),
			account_id: accts[0].id,
			email: "mike.chen@acmecorp.com",
			name: "Mike Chen",
			role: "Product Manager",
			department: "Product",
			phone: null,
			subscribed_modules: ["dashboard"],
			is_lead: false,
			lead_status: null,
		},
		{
			id: uuidv4(),
			account_id: accts[1].id,
			email: "sarah.k@globex.io",
			name: "Sarah Kim",
			role: "IT Admin",
			department: "IT",
			phone: "+1-555-0201",
			subscribed_modules: ["admin", "sso"],
			is_lead: false,
			lead_status: null,
		},
		{
			id: uuidv4(),
			account_id: accts[1].id,
			email: "tom.b@globex.io",
			name: "Tom Brown",
			role: "Data Analyst",
			department: "Analytics",
			phone: null,
			subscribed_modules: ["analytics", "export"],
			is_lead: false,
			lead_status: null,
		},
		{
			id: uuidv4(),
			account_id: accts[2].id,
			email: "peter.g@initech.co",
			name: "Peter Gibbons",
			role: "Software Engineer",
			department: "Engineering",
			phone: "+1-555-0301",
			subscribed_modules: ["api"],
			is_lead: false,
			lead_status: null,
		},
		{
			id: uuidv4(),
			account_id: accts[2].id,
			email: "milton@initech.co",
			name: "Milton Waddams",
			role: "User",
			department: "Basement",
			phone: null,
			subscribed_modules: [],
			is_lead: false,
			lead_status: null,
		},
		{
			id: uuidv4(),
			account_id: accts[3].id,
			email: "alex.w@umbrella.net",
			name: "Alex Wesker",
			role: "VP Engineering",
			department: "Engineering",
			phone: "+44-20-7946-0301",
			subscribed_modules: ["admin", "analytics", "api"],
			is_lead: false,
			lead_status: null,
		},
		{
			id: uuidv4(),
			account_id: accts[3].id,
			email: "jill.v@umbrella.net",
			name: "Jill Valentine",
			role: "Security Lead",
			department: "Security",
			phone: null,
			subscribed_modules: ["security", "audit"],
			is_lead: false,
			lead_status: null,
		},
		{
			id: uuidv4(),
			account_id: accts[4].id,
			email: "bruce@waynetech.com",
			name: "Bruce Wayne",
			role: "CEO",
			department: "Executive",
			phone: "+1-555-0501",
			subscribed_modules: ["dashboard", "reporting"],
			is_lead: false,
			lead_status: null,
		},
		{
			id: uuidv4(),
			account_id: accts[4].id,
			email: "lucius@waynetech.com",
			name: "Lucius Fox",
			role: "CTO",
			department: "Engineering",
			phone: "+1-555-0502",
			subscribed_modules: ["admin", "api", "sdk"],
			is_lead: false,
			lead_status: null,
		},
		{
			id: uuidv4(),
			account_id: accts[5].id,
			email: "tony@starkindustries.com",
			name: "Tony Stark",
			role: "Founder",
			department: "Executive",
			phone: "+1-555-0601",
			subscribed_modules: ["analytics", "api", "admin"],
			is_lead: false,
			lead_status: null,
		},
		{
			id: uuidv4(),
			account_id: accts[5].id,
			email: "pepper@starkindustries.com",
			name: "Pepper Potts",
			role: "COO",
			department: "Operations",
			phone: "+1-555-0602",
			subscribed_modules: ["billing", "reporting"],
			is_lead: false,
			lead_status: null,
		},
		// New leads (no account)
		{
			id: uuidv4(),
			account_id: null,
			email: "random.user@gmail.com",
			name: "Random User",
			role: null,
			department: null,
			phone: null,
			subscribed_modules: [],
			is_lead: true,
			lead_status: "new",
		},
		{
			id: uuidv4(),
			account_id: null,
			email: "prospect@newcompany.com",
			name: "New Prospect",
			role: "Manager",
			department: null,
			phone: null,
			subscribed_modules: [],
			is_lead: true,
			lead_status: "contacted",
		},
	];
}

const faqs = [
	// Technical Support
	{
		question: "How do I reset my password?",
		answer:
			"Go to Settings > Security > Change Password. Click 'Reset Password' and follow the email verification steps. If you can't access your email, contact your IT admin for a manual reset.",
		category: "Technical Support",
		solution_steps: [
			"Navigate to Settings > Security",
			"Click Change Password",
			"Enter current password",
			"Set new password (min 12 chars, 1 uppercase, 1 number)",
			"Confirm via email link",
		],
		success_rate: 95,
		avg_resolution_minutes: 5,
		times_used: 847,
	},
	{
		question: "API returns 429 Too Many Requests error",
		answer:
			"You've hit the rate limit. Our API allows 100 requests/minute for Business plans and 500/minute for Enterprise. Implement exponential backoff in your client. Check your current usage in Dashboard > API Usage.",
		category: "Technical Support",
		solution_steps: [
			"Check current plan rate limits in docs",
			"Implement exponential backoff",
			"Use bulk endpoints where possible",
			"Monitor usage in Dashboard > API Usage",
			"Consider upgrading plan if consistently hitting limits",
		],
		success_rate: 88,
		avg_resolution_minutes: 15,
		times_used: 324,
	},
	{
		question: "Dashboard shows 'Connection timeout' error",
		answer:
			"This usually indicates a network issue or our servers are under heavy load. Try: 1) Clear browser cache, 2) Try incognito mode, 3) Check status.example.com for outages, 4) If on VPN, try without it.",
		category: "Technical Support",
		solution_steps: [
			"Clear browser cache and cookies",
			"Try incognito/private browsing",
			"Check service status page",
			"Disable VPN if active",
			"Try a different browser",
		],
		success_rate: 72,
		avg_resolution_minutes: 20,
		times_used: 156,
	},
	{
		question: "How to fix 'SSL Certificate Error' when connecting to API?",
		answer:
			"Ensure your system clock is accurate. Update your CA certificates bundle. If using a custom certificate, add it to your trust store. For development, you can use the sandbox endpoint which doesn't require SSL pinning.",
		category: "Technical Support",
		solution_steps: [
			"Verify system clock is correct",
			"Update CA certificate bundle",
			"Check certificate expiration",
			"Use sandbox endpoint for dev",
			"Contact support if issue persists",
		],
		success_rate: 82,
		avg_resolution_minutes: 30,
		times_used: 89,
	},

	// Access Request
	{
		question: "How do I add a new team member?",
		answer:
			"Go to Admin > Team Management > Invite User. Enter their email, select role (Admin/Editor/Viewer), and choose which modules they can access. They'll receive an invitation email valid for 48 hours.",
		category: "Access Request",
		solution_steps: [
			"Go to Admin > Team Management",
			"Click Invite User",
			"Enter email address",
			"Select role and permissions",
			"Click Send Invitation",
		],
		success_rate: 98,
		avg_resolution_minutes: 3,
		times_used: 612,
	},
	{
		question: "How to request admin access?",
		answer:
			"Admin access must be granted by an existing admin or your company's designated account owner. Contact your IT department or the account owner listed in Settings > Account Info.",
		category: "Access Request",
		solution_steps: [
			"Identify current account admin",
			"Contact admin via internal channels",
			"Admin goes to Team Management",
			"Admin upgrades your role to Admin",
			"You'll receive confirmation email",
		],
		success_rate: 90,
		avg_resolution_minutes: 60,
		times_used: 203,
	},
	{
		question: "SSO login not working after setup",
		answer:
			"Verify your SAML/OIDC configuration matches our requirements. Check that the Assertion Consumer Service URL matches exactly. Ensure the IdP certificate hasn't expired. Test with our SAML debugger tool at Admin > SSO > Debug.",
		category: "Access Request",
		solution_steps: [
			"Check SAML metadata configuration",
			"Verify ACS URL matches exactly",
			"Check IdP certificate validity",
			"Use SSO Debug tool",
			"Contact support with SAML trace logs",
		],
		success_rate: 65,
		avg_resolution_minutes: 45,
		times_used: 78,
	},

	// Billing/Invoice
	{
		question: "How do I update my billing information?",
		answer:
			"Navigate to Settings > Billing > Payment Methods. Click Edit to update your card details or add a new payment method. Changes take effect on the next billing cycle.",
		category: "Billing/Invoice",
		solution_steps: [
			"Go to Settings > Billing",
			"Click Payment Methods",
			"Click Edit or Add New",
			"Enter new payment details",
			"Save and confirm",
		],
		success_rate: 96,
		avg_resolution_minutes: 5,
		times_used: 445,
	},
	{
		question: "How to get a copy of my invoice?",
		answer:
			"All invoices are available at Settings > Billing > Invoice History. You can download PDF copies or set up automatic invoice emails. For custom invoice formats, contact billing@support.com.",
		category: "Billing/Invoice",
		solution_steps: [
			"Go to Settings > Billing",
			"Click Invoice History",
			"Select the invoice period",
			"Click Download PDF",
			"For auto-delivery, enable Email Invoices toggle",
		],
		success_rate: 97,
		avg_resolution_minutes: 3,
		times_used: 567,
	},
	{
		question: "I was double-charged this month",
		answer:
			"We apologize for the inconvenience. Double charges usually occur when a payment retry is triggered after a temporary card decline. We'll investigate and process a refund within 5-7 business days. Please provide your invoice number.",
		category: "Billing/Invoice",
		solution_steps: [
			"Verify the charges in billing history",
			"Note both transaction IDs",
			"Submit refund request at Settings > Billing > Disputes",
			"Our billing team will review within 24h",
			"Refund processed in 5-7 business days",
		],
		success_rate: 85,
		avg_resolution_minutes: 120,
		times_used: 34,
	},

	// Feature Request
	{
		question: "Can you add dark mode to the dashboard?",
		answer:
			"Great news! Dark mode is on our Q3 roadmap. You can vote for it and track progress at feedback.example.com/dark-mode. In the meantime, you can use your browser's dark mode extension for a similar effect.",
		category: "Feature Request",
		solution_steps: [
			"Visit our feature request board",
			"Vote on the dark mode request",
			"Subscribe for updates",
			"Use browser dark mode extension as workaround",
		],
		success_rate: 80,
		avg_resolution_minutes: 5,
		times_used: 234,
	},
	{
		question: "Request for CSV export of all reports",
		answer:
			"CSV export is available for most reports. Go to any report, click the Export button (top right), and select CSV. For bulk exports or custom data dumps, use our Data Export API endpoint.",
		category: "Feature Request",
		solution_steps: [
			"Navigate to desired report",
			"Click Export button (top right)",
			"Select CSV format",
			"For bulk: use /api/v2/export endpoint",
			"Check documentation for custom queries",
		],
		success_rate: 92,
		avg_resolution_minutes: 10,
		times_used: 189,
	},

	// Hardware/Infrastructure
	{
		question: "Which regions are supported for data hosting?",
		answer:
			"We support US-East, US-West, EU-West (Ireland), EU-Central (Frankfurt), and APAC (Singapore, Sydney). Enterprise plans can request dedicated hosting in additional regions.",
		category: "Hardware/Infrastructure",
		solution_steps: [
			"Check current region in Settings > Infrastructure",
			"Review compliance requirements",
			"Contact sales for region migration",
			"Enterprise: request custom region",
		],
		success_rate: 95,
		avg_resolution_minutes: 5,
		times_used: 112,
	},
	{
		question: "What are the system requirements for on-premise deployment?",
		answer:
			"Minimum: 8 CPU cores, 32GB RAM, 500GB SSD. Recommended: 16 cores, 64GB RAM, 1TB NVMe SSD. Requires Docker 24+ and Kubernetes 1.28+. Full requirements at docs.example.com/on-premise.",
		category: "Hardware/Infrastructure",
		solution_steps: [
			"Review minimum hardware specs",
			"Check Docker and K8s versions",
			"Download deployment package",
			"Follow installation guide",
			"Run health check script",
		],
		success_rate: 88,
		avg_resolution_minutes: 15,
		times_used: 67,
	},

	// How-To/Documentation
	{
		question: "How do I set up webhooks?",
		answer:
			"Go to Settings > Integrations > Webhooks. Click 'Add Webhook', enter your endpoint URL, select events to subscribe to, and optionally add a secret for signature verification. Test with the 'Send Test' button.",
		category: "How-To/Documentation",
		solution_steps: [
			"Go to Settings > Integrations > Webhooks",
			"Click Add Webhook",
			"Enter endpoint URL (HTTPS required)",
			"Select events to subscribe to",
			"Add signing secret for verification",
			"Click Test to verify",
		],
		success_rate: 90,
		avg_resolution_minutes: 15,
		times_used: 298,
	},
	{
		question: "How to create custom reports?",
		answer:
			"Navigate to Reports > Custom Reports > New. Use the drag-and-drop report builder to select metrics, dimensions, and filters. Save and schedule automatic delivery. See our report builder guide for advanced features.",
		category: "How-To/Documentation",
		solution_steps: [
			"Go to Reports > Custom Reports",
			"Click New Report",
			"Select data source and metrics",
			"Add filters and grouping",
			"Preview and save",
			"Set up scheduled delivery if needed",
		],
		success_rate: 85,
		avg_resolution_minutes: 20,
		times_used: 178,
	},
	{
		question: "Where can I find the API documentation?",
		answer:
			"Our full API documentation is available at docs.example.com/api. It includes interactive examples, SDKs for Python/Node/Java, and a Postman collection. For changelog, see docs.example.com/api/changelog.",
		category: "How-To/Documentation",
		solution_steps: [
			"Visit docs.example.com/api",
			"Download SDK for your language",
			"Import Postman collection",
			"Use sandbox key for testing",
			"Check changelog for recent updates",
		],
		success_rate: 98,
		avg_resolution_minutes: 2,
		times_used: 1023,
	},

	// Data Request
	{
		question: "How do I export my data?",
		answer:
			"For GDPR/data portability requests, go to Settings > Privacy > Export My Data. This generates a ZIP file with all your data in JSON format, delivered via secure download link within 24 hours.",
		category: "Data Request",
		solution_steps: [
			"Go to Settings > Privacy",
			"Click Export My Data",
			"Select data categories",
			"Submit request",
			"Download link sent via email within 24h",
		],
		success_rate: 93,
		avg_resolution_minutes: 30,
		times_used: 145,
	},
	{
		question: "How to request data deletion?",
		answer:
			"Submit a data deletion request at Settings > Privacy > Delete My Data or email privacy@example.com. We process deletion requests within 30 days per GDPR requirements. This action is irreversible.",
		category: "Data Request",
		solution_steps: [
			"Go to Settings > Privacy",
			"Click Delete My Data",
			"Confirm account and data to delete",
			"Receive confirmation email",
			"Deletion completed within 30 days",
		],
		success_rate: 90,
		avg_resolution_minutes: 60,
		times_used: 56,
	},

	// Complaint/Escalation
	{
		question: "I want to escalate my unresolved ticket",
		answer:
			"We're sorry for the delay. To escalate, reply to your existing ticket with 'ESCALATE' in the subject or contact our escalation team directly at escalations@example.com. Gold tier customers have a dedicated escalation hotline.",
		category: "Complaint/Escalation",
		solution_steps: [
			"Reply to existing ticket with ESCALATE in subject",
			"Or email escalations@example.com",
			"Include ticket number and details",
			"Gold tier: call dedicated hotline",
			"Expected response within 2 hours",
		],
		success_rate: 75,
		avg_resolution_minutes: 120,
		times_used: 89,
	},
	{
		question: "Service has been down for hours, need immediate help",
		answer:
			"We understand the urgency. Check our status page at status.example.com for real-time incident updates. For Gold/Enterprise customers, contact our 24/7 support line. We aim for 99.9% uptime SLA.",
		category: "Complaint/Escalation",
		solution_steps: [
			"Check status.example.com for incidents",
			"Verify if issue is on your end",
			"Gold tier: call 24/7 support line",
			"Submit priority ticket via portal",
			"Monitor status page for updates",
		],
		success_rate: 70,
		avg_resolution_minutes: 180,
		times_used: 45,
	},

	// General Inquiry
	{
		question: "What are your pricing plans?",
		answer:
			"We offer Starter ($29/mo), Business ($99/mo), and Enterprise (custom). Annual billing saves 20%. All plans include core features. Visit pricing.example.com for a detailed comparison.",
		category: "General Inquiry",
		solution_steps: [
			"Visit pricing.example.com",
			"Compare plan features",
			"Use ROI calculator",
			"Contact sales for Enterprise pricing",
			"Start free trial for any plan",
		],
		success_rate: 95,
		avg_resolution_minutes: 5,
		times_used: 890,
	},
	{
		question: "Do you offer a free trial?",
		answer:
			"Yes! We offer a 14-day free trial of our Business plan with full features, no credit card required. Sign up at app.example.com/trial. Trial data can be migrated to a paid plan.",
		category: "General Inquiry",
		solution_steps: [
			"Go to app.example.com/trial",
			"Create account with email",
			"No credit card needed",
			"Full Business plan features for 14 days",
			"Upgrade anytime to keep data",
		],
		success_rate: 98,
		avg_resolution_minutes: 2,
		times_used: 1250,
	},
	{
		question: "What integrations do you support?",
		answer:
			"We integrate with 50+ tools including Slack, Jira, Salesforce, HubSpot, Zendesk, GitHub, and more. See our integrations directory at integrations.example.com. We also offer a REST API and webhooks for custom integrations.",
		category: "General Inquiry",
		solution_steps: [
			"Browse integrations.example.com",
			"Search for your tool",
			"Click Connect to set up",
			"Use OAuth for secure connection",
			"Test integration with sample data",
		],
		success_rate: 93,
		avg_resolution_minutes: 10,
		times_used: 445,
	},
];

const teams = [
	{
		name: "Technical Support",
		description: "Handles technical issues, bugs, and API problems",
		category_routing: ["Technical Support", "Hardware/Infrastructure"],
	},
	{
		name: "Access & Security",
		description: "Manages access requests, SSO, and security issues",
		category_routing: ["Access Request"],
	},
	{
		name: "Billing Team",
		description: "Handles billing inquiries, invoices, and payment issues",
		category_routing: ["Billing/Invoice"],
	},
	{
		name: "Product Team",
		description: "Manages feature requests and product feedback",
		category_routing: ["Feature Request"],
	},
	{
		name: "Customer Success",
		description: "Handles general inquiries, documentation, and escalations",
		category_routing: [
			"How-To/Documentation",
			"Data Request",
			"Complaint/Escalation",
			"General Inquiry",
		],
	},
];

export async function POST() {
	if (IS_PRODUCTION) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	try {
		const supabase = supabaseAdmin;

		// Look up the default org (sharpflow) to tag all seed data
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

		// Check if data already exists for this org
		const { count } = await supabase
			.from("accounts")
			.select("*", { count: "exact", head: true })
			.eq("organization_id", orgId);

		if (count && count > 0) {
			return NextResponse.json(
				{
					error:
						"Database already has data for this org. Clear existing data first or skip seeding.",
				},
				{ status: 409 },
			);
		}

		// 1. Insert accounts with organization_id
		const accountsWithOrg = accounts.map((a) => ({
			...a,
			organization_id: orgId,
		}));
		const { error: accountsError } = await supabase
			.from("accounts")
			.insert(accountsWithOrg);
		if (accountsError) throw new Error(`Accounts: ${accountsError.message}`);

		// 2. Insert contacts (scoped via account -> org, no org_id column)
		const contacts = makeContacts(accounts);
		const { error: contactsError } = await supabase
			.from("contacts")
			.insert(contacts);
		if (contactsError) throw new Error(`Contacts: ${contactsError.message}`);

		// 3. Insert teams with organization_id
		const teamsWithOrg = teams.map((t) => ({ ...t, organization_id: orgId }));
		const { error: teamsError } = await supabase
			.from("teams")
			.insert(teamsWithOrg);
		if (teamsError) throw new Error(`Teams: ${teamsError.message}`);

		// 4. Insert FAQs with organization_id (no embeddings — those are generated separately)
		const faqRecords = faqs.map((f) => ({
			id: uuidv4(),
			...f,
			organization_id: orgId,
		}));
		const { error: faqsError } = await supabase.from("faqs").insert(faqRecords);
		if (faqsError) throw new Error(`FAQs: ${faqsError.message}`);

		return NextResponse.json({
			success: true,
			counts: {
				accounts: accounts.length,
				contacts: contacts.length,
				teams: teams.length,
				faqs: faqRecords.length,
			},
			message:
				"Seed data inserted successfully. FAQ embeddings can be generated by updating each FAQ via the Knowledge Base UI.",
		});
	} catch (error) {
		console.error("Seed error:", error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Seed failed" },
			{ status: 500 },
		);
	}
}

// PATCH: Seed tickets + audit logs directly (no AI pipeline needed)
export async function PATCH() {
	if (IS_PRODUCTION) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	try {
		const supabase = supabaseAdmin;

		const { data: org } = await supabase
			.from("organizations")
			.select("id")
			.eq("slug", "sharpflow")
			.single();

		if (!org) {
			return NextResponse.json(
				{ error: "Organization 'sharpflow' not found." },
				{ status: 400 },
			);
		}
		const orgId = org.id;

		// Look up accounts to reference in tickets
		const { data: accts } = await supabase
			.from("accounts")
			.select("id, company_name, domain")
			.eq("organization_id", orgId);

		const { data: contacts } = await supabase
			.from("contacts")
			.select("id, email, account_id")
			.order("created_at");

		const findAccount = (domain: string) =>
			accts?.find((a) => a.domain === domain)?.id || null;
		const findContact = (email: string) =>
			contacts?.find((c) => c.email === email)?.id || null;

		const now = new Date();
		const hoursAgo = (h: number) =>
			new Date(now.getTime() - h * 3600000).toISOString();
		const daysAgo = (d: number) => hoursAgo(d * 24);

		const ticketRows = [
			{
				organization_id: orgId,
				subject: "URGENT: Production API completely down - all services affected",
				summary: "Customer reports complete production outage with 503 errors on all endpoints.",
				status: "In Progress",
				severity: "P1",
				category: "Technical Support",
				subcategory: "Outage",
				account_id: findAccount("acmecorp.com"),
				contact_id: findContact("john.doe@acmecorp.com"),
				ai_confidence: 0.97,
				assigned_team: "Technical Support",
				sla_first_response_due: hoursAgo(-1),
				sla_resolution_due: hoursAgo(-2),
				sla_breach: true,
				escalation_count: 1,
				auto_response_sent: true,
				auto_response_type: "partial",
				created_at: hoursAgo(5),
				updated_at: hoursAgo(1),
			},
			{
				organization_id: orgId,
				subject: "ESCALATION: Third time reporting critical data loss bug",
				summary: "Gold-tier customer reports data loss in report exports above 10k rows, third escalation.",
				status: "In Progress",
				severity: "P1",
				category: "Complaint/Escalation",
				subcategory: "Data Loss",
				account_id: findAccount("starkindustries.com"),
				contact_id: findContact("tony@starkindustries.com"),
				ai_confidence: 0.95,
				assigned_team: "Customer Success",
				sla_first_response_due: hoursAgo(-3),
				sla_resolution_due: hoursAgo(-5),
				sla_breach: true,
				escalation_count: 3,
				auto_response_sent: false,
				auto_response_type: "none",
				is_flagged_for_review: true,
				created_at: hoursAgo(8),
				updated_at: hoursAgo(2),
			},
			{
				organization_id: orgId,
				subject: "SSO SAML authentication broken after IdP certificate renewal",
				summary: "50+ users locked out after IdP cert renewal. SAML response validation failing.",
				status: "In Progress",
				severity: "P2",
				category: "Access Request",
				subcategory: "SSO",
				account_id: findAccount("umbrella.net"),
				contact_id: findContact("jill.v@umbrella.net"),
				ai_confidence: 0.92,
				assigned_team: "Access & Security",
				sla_first_response_due: hoursAgo(1),
				sla_resolution_due: hoursAgo(-4),
				sla_breach: false,
				escalation_count: 0,
				auto_response_sent: true,
				auto_response_type: "partial",
				created_at: hoursAgo(6),
				updated_at: hoursAgo(3),
			},
			{
				organization_id: orgId,
				subject: "API rate limiting issues - getting 429 errors frequently",
				summary: "Business plan customer hitting rate limits at 50 req/min instead of documented 100 req/min.",
				status: "New",
				severity: "P2",
				category: "Technical Support",
				subcategory: "API",
				account_id: findAccount("globex.io"),
				contact_id: findContact("sarah.k@globex.io"),
				ai_confidence: 0.88,
				assigned_team: "Technical Support",
				sla_first_response_due: hoursAgo(-1),
				sla_resolution_due: hoursAgo(4),
				sla_breach: false,
				escalation_count: 0,
				auto_response_sent: true,
				auto_response_type: "perfect",
				created_at: hoursAgo(4),
				updated_at: hoursAgo(4),
			},
			{
				organization_id: orgId,
				subject: "GDPR Data Export Request for Umbrella Tech account",
				summary: "GDPR Article 15 data export request for all company account data.",
				status: "New",
				severity: "P2",
				category: "Data Request",
				subcategory: "GDPR Export",
				account_id: findAccount("umbrella.net"),
				contact_id: findContact("alex.w@umbrella.net"),
				ai_confidence: 0.91,
				assigned_team: "Customer Success",
				sla_first_response_due: hoursAgo(2),
				sla_resolution_due: hoursAgo(20),
				sla_breach: false,
				escalation_count: 0,
				auto_response_sent: true,
				auto_response_type: "partial",
				created_at: hoursAgo(3),
				updated_at: hoursAgo(3),
			},
			{
				organization_id: orgId,
				subject: "Invoice discrepancy for October billing cycle",
				summary: "Enterprise customer billed $500 extra for API overage not matching their usage data.",
				status: "New",
				severity: "P3",
				category: "Billing/Invoice",
				subcategory: "Overcharge",
				account_id: findAccount("starkindustries.com"),
				contact_id: findContact("pepper@starkindustries.com"),
				ai_confidence: 0.89,
				assigned_team: "Billing Team",
				sla_first_response_due: hoursAgo(20),
				sla_resolution_due: hoursAgo(68),
				sla_breach: false,
				escalation_count: 0,
				auto_response_sent: true,
				auto_response_type: "perfect",
				created_at: hoursAgo(2),
				updated_at: hoursAgo(2),
			},
			{
				organization_id: orgId,
				subject: "Double charged for November - need refund",
				summary: "Customer charged twice on Nov 1 and Nov 3 for same billing cycle.",
				status: "New",
				severity: "P3",
				category: "Billing/Invoice",
				subcategory: "Duplicate Charge",
				account_id: findAccount("acmecorp.com"),
				contact_id: findContact("mike.chen@acmecorp.com"),
				ai_confidence: 0.93,
				assigned_team: "Billing Team",
				sla_first_response_due: hoursAgo(18),
				sla_resolution_due: hoursAgo(66),
				sla_breach: false,
				escalation_count: 0,
				auto_response_sent: true,
				auto_response_type: "perfect",
				created_at: hoursAgo(1),
				updated_at: hoursAgo(1),
			},
			{
				organization_id: orgId,
				subject: "Need admin access for new project",
				summary: "Developer requesting admin role upgrade for data migration project, manager approved.",
				status: "New",
				severity: "P3",
				category: "Access Request",
				subcategory: "Role Upgrade",
				account_id: findAccount("initech.co"),
				contact_id: findContact("peter.g@initech.co"),
				ai_confidence: 0.86,
				assigned_team: "Access & Security",
				sla_first_response_due: hoursAgo(16),
				sla_resolution_due: hoursAgo(64),
				sla_breach: false,
				escalation_count: 0,
				auto_response_sent: true,
				auto_response_type: "perfect",
				created_at: hoursAgo(2),
				updated_at: hoursAgo(2),
			},
			{
				organization_id: orgId,
				subject: "On-premise deployment requirements and EU hosting options",
				summary: "Customer evaluating on-prem deployment, asking about hardware specs and EU hosting.",
				status: "New",
				severity: "P3",
				category: "Hardware/Infrastructure",
				subcategory: "On-Premise",
				account_id: findAccount("waynetech.com"),
				contact_id: findContact("lucius@waynetech.com"),
				ai_confidence: 0.84,
				assigned_team: "Technical Support",
				sla_first_response_due: hoursAgo(12),
				sla_resolution_due: hoursAgo(60),
				sla_breach: false,
				escalation_count: 0,
				auto_response_sent: true,
				auto_response_type: "perfect",
				created_at: hoursAgo(3),
				updated_at: hoursAgo(3),
			},
			{
				organization_id: orgId,
				subject: "How to set up webhook notifications for report completion?",
				summary: "Customer unable to find correct event type for webhook report completion notifications.",
				status: "Resolved",
				severity: "P3",
				category: "How-To/Documentation",
				subcategory: "Webhooks",
				account_id: findAccount("globex.io"),
				contact_id: findContact("tom.b@globex.io"),
				ai_confidence: 0.87,
				assigned_team: "Customer Success",
				sla_first_response_due: daysAgo(1),
				sla_resolution_due: daysAgo(1),
				sla_first_response_at: daysAgo(1),
				sla_resolved_at: new Date(now.setHours(0, 30, 0, 0)).toISOString(),
				sla_breach: false,
				escalation_count: 0,
				auto_response_sent: true,
				auto_response_type: "perfect",
				created_at: daysAgo(1),
				updated_at: hoursAgo(10),
			},
			{
				organization_id: orgId,
				subject: "Feature suggestion: Dark mode for dashboard",
				summary: "Customer requesting dark mode support for late-night usage.",
				status: "Resolved",
				severity: "P4",
				category: "Feature Request",
				subcategory: "UI/UX",
				account_id: findAccount("waynetech.com"),
				contact_id: findContact("bruce@waynetech.com"),
				ai_confidence: 0.92,
				assigned_team: "Product Team",
				sla_first_response_due: daysAgo(2),
				sla_resolution_due: daysAgo(1),
				sla_first_response_at: daysAgo(2),
				sla_resolved_at: daysAgo(1),
				sla_breach: false,
				escalation_count: 0,
				auto_response_sent: true,
				auto_response_type: "perfect",
				created_at: daysAgo(2),
				updated_at: daysAgo(1),
			},
			{
				organization_id: orgId,
				subject: "Feature request: CSV export for custom report builder",
				summary: "Developer requests CSV export from report builder for BI pipeline integration.",
				status: "Resolved",
				severity: "P4",
				category: "Feature Request",
				subcategory: "Export",
				account_id: findAccount("acmecorp.com"),
				contact_id: findContact("jane.smith@acmecorp.com"),
				ai_confidence: 0.91,
				assigned_team: "Product Team",
				sla_first_response_due: daysAgo(3),
				sla_resolution_due: daysAgo(2),
				sla_first_response_at: daysAgo(3),
				sla_resolved_at: daysAgo(2),
				sla_breach: false,
				escalation_count: 0,
				auto_response_sent: true,
				auto_response_type: "perfect",
				created_at: daysAgo(3),
				updated_at: daysAgo(2),
			},
			{
				organization_id: orgId,
				subject: "Where can I find the API documentation?",
				summary: "New user unable to locate API documentation link.",
				status: "Closed",
				severity: "P4",
				category: "How-To/Documentation",
				subcategory: "API Docs",
				account_id: findAccount("initech.co"),
				contact_id: findContact("milton@initech.co"),
				ai_confidence: 0.96,
				assigned_team: "Customer Success",
				sla_first_response_due: daysAgo(2),
				sla_resolution_due: daysAgo(1),
				sla_first_response_at: daysAgo(2),
				sla_resolved_at: daysAgo(1),
				sla_breach: false,
				escalation_count: 0,
				auto_response_sent: true,
				auto_response_type: "perfect",
				created_at: daysAgo(2),
				updated_at: daysAgo(1),
			},
			{
				organization_id: orgId,
				subject: "Interested in your Enterprise plan - need pricing details",
				summary: "Prospective enterprise customer evaluating plans, comparing with Zendesk/Freshdesk.",
				status: "New",
				severity: "P4",
				category: "General Inquiry",
				subcategory: "Pricing",
				account_id: null,
				contact_id: findContact("prospect@newcompany.com"),
				ai_confidence: 0.88,
				assigned_team: "Customer Success",
				sla_first_response_due: hoursAgo(60),
				sla_resolution_due: hoursAgo(10),
				sla_breach: false,
				escalation_count: 0,
				auto_response_sent: true,
				auto_response_type: "perfect",
				created_at: hoursAgo(4),
				updated_at: hoursAgo(4),
			},
		];

		const { data: insertedTickets, error: ticketsError } = await supabase
			.from("tickets")
			.insert(ticketRows)
			.select("id, ticket_number, subject, status, severity, created_at");

		if (ticketsError) throw new Error(`Tickets: ${ticketsError.message}`);

		// Insert audit logs for each ticket
		const auditLogs: Record<string, unknown>[] = (insertedTickets || []).map((t) => ({
			organization_id: orgId,
			ticket_id: t.id,
			action: "ticket_created",
			details: {
				ticket_number: t.ticket_number,
				severity: t.severity,
				status: t.status,
			},
			performed_by: "system",
			created_at: t.created_at,
		}));

		// Add a few status-change audit entries for realism
		if (insertedTickets && insertedTickets.length >= 3) {
			auditLogs.push(
				{
					organization_id: orgId,
					ticket_id: insertedTickets[0].id,
					action: "status_changed",
					details: {
						ticket_number: insertedTickets[0].ticket_number,
						from: "New",
						to: "In Progress",
					},
					performed_by: "agent@sharpflow.com",
					created_at: hoursAgo(3),
				},
				{
					organization_id: orgId,
					ticket_id: insertedTickets[1].id,
					action: "escalated",
					details: {
						ticket_number: insertedTickets[1].ticket_number,
						escalation_count: 3,
						reason: "No response to prior tickets",
					},
					performed_by: "system",
					created_at: hoursAgo(6),
				},
			);
		}

		const { error: auditError } = await supabase
			.from("audit_logs")
			.insert(auditLogs);
		if (auditError) throw new Error(`Audit logs: ${auditError.message}`);

		return NextResponse.json({
			success: true,
			counts: {
				tickets: insertedTickets?.length || 0,
				audit_logs: auditLogs.length,
			},
			tickets: insertedTickets?.map((t) => ({
				number: t.ticket_number,
				subject: t.subject.substring(0, 60),
				status: t.status,
				severity: t.severity,
			})),
			message: "Tickets and audit logs seeded directly (no AI pipeline needed).",
		});
	} catch (error) {
		console.error("Ticket seed error:", error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Ticket seed failed" },
			{ status: 500 },
		);
	}
}

// PUT: Re-generate FAQ embeddings for new Pinecone index
export async function PUT() {
	try {
		const { data: allFaqs, error } = await supabaseAdmin
			.from("faqs")
			.select("id, question, answer, category");

		if (error) throw error;
		if (!allFaqs || allFaqs.length === 0) {
			return NextResponse.json({ error: "No FAQs found" }, { status: 404 });
		}

		let embedded = 0;
		for (const faq of allFaqs) {
			const embedding = await generateEmbedding(
				`${faq.question} ${faq.answer}`,
			);
			await upsertVectors("faqs", [
				{
					id: faq.id,
					values: embedding,
					metadata: {
						category: faq.category,
						question: faq.question.slice(0, 200),
					},
				},
			]);
			embedded++;
		}

		return NextResponse.json({
			success: true,
			embedded,
			message: `Generated embeddings for ${embedded} FAQs`,
		});
	} catch (error) {
		console.error("Embed FAQs error:", error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Embedding failed" },
			{ status: 500 },
		);
	}
}
