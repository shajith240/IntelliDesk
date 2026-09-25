// Unit tests for src/lib/email-domains.ts. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { isPersonalEmailDomain } from "../../src/lib/email-domains.ts";

test("personal providers are recognised, case-insensitively", () => {
	for (const d of ["gmail.com", "GMAIL.COM", "outlook.com", "yahoo.co.in", "icloud.com", "proton.me"]) {
		assert.equal(isPersonalEmailDomain(d), true, d);
	}
});

test("company domains are not personal", () => {
	for (const d of ["acme.com", "starkindustries.com", "mail.acme.com", "iitjammu.ac.in"]) {
		assert.equal(isPersonalEmailDomain(d), false, d);
	}
});
