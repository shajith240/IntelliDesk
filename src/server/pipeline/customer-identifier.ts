import "server-only";
import { supabaseAdmin } from "@/server/db/supabase";
import { extractSignature } from "@/server/email/parser";
import type { CustomerIdentificationResult } from "@/types";

/**
 * Identify the customer from an incoming email.
 * Strategy: exact contact match > domain match > signature enrichment > new lead
 */
export async function identifyCustomer(
	fromAddress: string,
	fromName: string | null,
	bodyText: string,
	orgId: string,
): Promise<CustomerIdentificationResult> {
	const emailDomain = fromAddress.split("@")[1]?.toLowerCase();

	// 1. Exact contact match by email (contacts carry their own organization_id)
	const { data: existingContact } = await supabaseAdmin
		.from("contacts")
		.select(
			"id, name, email, role, account_id, accounts(id, company_name, domain, tier)",
		)
		.eq("email", fromAddress.toLowerCase())
		.eq("organization_id", orgId)
		.single();

	if (existingContact) {
		const account = (
			existingContact as unknown as {
				accounts: {
					id: string;
					company_name: string;
					domain: string;
					tier: string;
				};
			}
		).accounts;
		return {
			account: null,
			contact: null,
			is_existing: true,
			contact_id: existingContact.id,
			account_id: existingContact.account_id,
			account_name: account?.company_name || null,
			account_tier: account?.tier || null,
			contact_name: existingContact.name,
			method: "email_match",
		};
	}

	// 2. Domain match - find account by email domain
	if (emailDomain) {
		const { data: account } = await supabaseAdmin
			.from("accounts")
			.select("id, company_name, domain, tier")
			.eq("domain", emailDomain)
			.eq("organization_id", orgId)
			.single();

		if (account) {
			// Create new contact under existing account
			const signature = extractSignature(bodyText);
			const contactName =
				fromName || signature?.name || fromAddress.split("@")[0];

			const { data: newContact } = await supabaseAdmin
				.from("contacts")
				.insert({
					organization_id: orgId,
					email: fromAddress.toLowerCase(),
					name: contactName,
					role: signature?.role || null,
					phone: signature?.phone || null,
					account_id: account.id,
				})
				.select("id")
				.single();

			return {
				account: null,
				contact: null,
				is_existing: true,
				contact_id: newContact?.id || null,
				account_id: account.id,
				account_name: account.company_name,
				account_tier: account.tier || null,
				contact_name: contactName,
				method: "domain_match",
			};
		}
	}

	// 3. New lead - create account and contact
	const signature = extractSignature(bodyText);
	const contactName = fromName || signature?.name || fromAddress.split("@")[0];
	const companyName = signature?.company || emailDomain || "Unknown";

	// Create new account
	const { data: newAccount } = await supabaseAdmin
		.from("accounts")
		.insert({
			organization_id: orgId,
			company_name: companyName,
			domain: emailDomain || "unknown",
			tier: "Bronze",
		})
		.select("id")
		.single();

	// Create new contact
	const { data: newContact } = await supabaseAdmin
		.from("contacts")
		.insert({
			organization_id: orgId,
			email: fromAddress.toLowerCase(),
			name: contactName,
			role: signature?.role || null,
			phone: signature?.phone || null,
			account_id: newAccount?.id || null,
		})
		.select("id")
		.single();

	return {
		account: null,
		contact: null,
		is_existing: false,
		contact_id: newContact?.id || null,
		account_id: newAccount?.id || null,
		account_name: companyName,
		account_tier: "Bronze",
		contact_name: contactName,
		method: "new_lead",
	};
}
