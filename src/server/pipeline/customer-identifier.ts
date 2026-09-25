import "server-only";
import { supabaseAdmin } from "@/server/db/supabase";
import { extractSignature } from "@/server/email/parser";
import { isPersonalEmailDomain } from "@/lib/email-domains";
import type { CustomerIdentificationResult } from "@/types";

interface AccountRow {
	id: string;
	company_name: string;
	domain: string;
	tier: string;
}

/**
 * Identify the customer from an incoming email.
 * Strategy: existing contact > company account by domain > new contact
 * (and a new account only for a company domain).
 *
 * People writing from personal addresses (gmail.com, outlook.com, …) are
 * contacts without an account: grouping every Gmail user into one "gmail.com"
 * company is the classic mistake here.
 *
 * Emails are stored lowercase; contacts and accounts are unique per workspace
 * (lower(email) / lower(domain)), so a concurrent insert of the same person or
 * company fails with 23505 and we read the row the other request created.
 */
export async function identifyCustomer(
	fromAddress: string,
	fromName: string | null,
	bodyText: string,
	orgId: string,
): Promise<CustomerIdentificationResult> {
	const email = fromAddress.trim().toLowerCase();
	const domain = email.split("@")[1] ?? "";

	// 1. Existing contact
	const existing = await findContact(orgId, email);
	if (existing) {
		return {
			account: null,
			contact: null,
			is_existing: true,
			contact_id: existing.id,
			account_id: existing.account_id,
			account_name: existing.accounts?.company_name ?? null,
			account_tier: existing.accounts?.tier ?? null,
			contact_name: existing.name ?? undefined,
			method: "email_match",
		};
	}

	const signature = extractSignature(bodyText);
	const contactName = fromName || signature?.name || email.split("@")[0];

	// 2. Company account: only for company domains
	let account: AccountRow | null = null;
	let accountIsNew = false;
	if (domain && !isPersonalEmailDomain(domain)) {
		account = await findAccount(orgId, domain);
		if (!account) {
			account = await createAccount(orgId, domain, signature?.company || domain);
			accountIsNew = true;
		}
	}

	// 3. New contact
	const contactId = await createContact(orgId, {
		email,
		name: contactName,
		role: signature?.role || null,
		phone: signature?.phone || null,
		account_id: account?.id ?? null,
	});

	return {
		account: null,
		contact: null,
		is_existing: Boolean(account && !accountIsNew),
		contact_id: contactId,
		account_id: account?.id ?? null,
		account_name: account?.company_name ?? null,
		account_tier: account?.tier ?? null,
		contact_name: contactName,
		method: account && !accountIsNew ? "domain_match" : "new_lead",
	};
}

async function findContact(orgId: string, email: string) {
	const { data, error } = await supabaseAdmin
		.from("contacts")
		.select("id, name, account_id, accounts(company_name, tier)")
		.eq("organization_id", orgId)
		.eq("email", email)
		.maybeSingle();
	if (error) throw error;
	return data as unknown as {
		id: string;
		name: string | null;
		account_id: string | null;
		accounts: { company_name: string; tier: string } | null;
	} | null;
}

async function findAccount(orgId: string, domain: string): Promise<AccountRow | null> {
	const { data, error } = await supabaseAdmin
		.from("accounts")
		.select("id, company_name, domain, tier")
		.eq("organization_id", orgId)
		.eq("domain", domain)
		.maybeSingle();
	if (error) throw error;
	return data;
}

async function createAccount(orgId: string, domain: string, companyName: string): Promise<AccountRow> {
	const { data, error } = await supabaseAdmin
		.from("accounts")
		.insert({ organization_id: orgId, company_name: companyName, domain, tier: "Bronze" })
		.select("id, company_name, domain, tier")
		.single();
	if (!error) return data;
	if (error.code === "23505") {
		const raced = await findAccount(orgId, domain);
		if (raced) return raced;
	}
	throw error;
}

async function createContact(
	orgId: string,
	contact: { email: string; name: string; role: string | null; phone: string | null; account_id: string | null },
): Promise<string> {
	const { data, error } = await supabaseAdmin
		.from("contacts")
		.insert({ organization_id: orgId, ...contact })
		.select("id")
		.single();
	if (!error) return data.id;
	if (error.code === "23505") {
		const raced = await findContact(orgId, contact.email);
		if (raced) return raced.id;
	}
	throw error;
}
