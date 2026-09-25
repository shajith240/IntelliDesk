// Unit tests for machine-generated mail detection (src/server/email/automated.ts).
// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectAutomatedMail } from "../../src/server/email/automated.ts";
import type { RawEmail } from "../../src/types/index.ts";

function email(overrides: Partial<RawEmail> & { headers?: Record<string, unknown> } = {}): RawEmail {
	const { headers, ...rest } = overrides;
	return {
		message_id: "<m1@example.com>",
		in_reply_to: null,
		references: [],
		from_address: "customer@example.com",
		from_name: "Customer",
		to_address: "support@acme.test",
		cc: null,
		subject: "My invoice is wrong",
		body_text: "Hello",
		body_html: null,
		raw_headers: (headers ?? {}) as Record<string, string>,
		received_at: new Date(),
		...rest,
	};
}

const OWN = "support@acme.test";

test("an ordinary customer email is not automated", () => {
	assert.equal(detectAutomatedMail(email(), OWN), null);
});

test("mail from the workspace's own mailbox is ignored (case-insensitive)", () => {
	assert.equal(detectAutomatedMail(email({ from_address: "Support@ACME.test" }), OWN)?.kind, "own");
});

test("bounces: system senders, null Return-Path, delivery-status reports", () => {
	assert.equal(detectAutomatedMail(email({ from_address: "MAILER-DAEMON@mx.example.com" }), OWN)?.kind, "bounce");
	assert.equal(detectAutomatedMail(email({ headers: { "return-path": { text: "<>" } } }), OWN)?.kind, "bounce");
	assert.equal(
		detectAutomatedMail(email({ headers: { "content-type": { value: "multipart/report", params: { "report-type": "delivery-status" } } } }), OWN)?.kind,
		"bounce",
	);
});

test("RFC 3834 Auto-Submitted marks auto replies, except 'no'", () => {
	assert.equal(detectAutomatedMail(email({ headers: { "auto-submitted": "auto-replied" } }), OWN)?.kind, "auto_reply");
	assert.equal(detectAutomatedMail(email({ headers: { "Auto-Submitted": "auto-generated" } }), OWN)?.kind, "auto_reply");
	assert.equal(detectAutomatedMail(email({ headers: { "auto-submitted": "no" } }), OWN), null);
});

test("X-Autoreply, Precedence: auto_reply and out-of-office subjects are auto replies", () => {
	assert.equal(detectAutomatedMail(email({ headers: { "x-autoreply": "yes" } }), OWN)?.kind, "auto_reply");
	assert.equal(detectAutomatedMail(email({ headers: { precedence: "auto_reply" } }), OWN)?.kind, "auto_reply");
	assert.equal(detectAutomatedMail(email({ subject: "Out of Office: back Monday" }), OWN)?.kind, "auto_reply");
	assert.equal(detectAutomatedMail(email({ subject: "Automatic reply: Re: order" }), OWN)?.kind, "auto_reply");
});

test("lists, bulk mail and no-reply senders are bulk (ticketed, never auto-answered)", () => {
	assert.equal(detectAutomatedMail(email({ headers: { precedence: "bulk" } }), OWN)?.kind, "bulk");
	assert.equal(detectAutomatedMail(email({ headers: { list: { id: { name: "news" } } } }), OWN)?.kind, "bulk");
	assert.equal(detectAutomatedMail(email({ headers: { "list-unsubscribe": "<mailto:x@y>" } }), OWN)?.kind, "bulk");
	assert.equal(detectAutomatedMail(email({ from_address: "no-reply@shop.example" }), OWN)?.kind, "bulk");
});

test("a subject merely mentioning 'reply' is not an auto reply", () => {
	assert.equal(detectAutomatedMail(email({ subject: "Please reply about my automatic renewal" }), OWN), null);
});
