import "server-only";
import { type Session } from "next-auth";

/**
 * Extract the organization_id from an authenticated session.
 * Throws if org is missing (should never happen for authenticated users).
 */
export function getOrgId(session: Session): string {
	const orgId = session.user?.organization_id;
	if (!orgId) {
		throw new Error("Session missing organization_id");
	}
	return orgId;
}

/**
 * Build an org-scoped Pinecone namespace.
 * e.g. orgNamespace("abc123", "emails") → "abc123_emails"
 */
export function orgNamespace(orgId: string, base: string): string {
	return `${orgId}_${base}`;
}
