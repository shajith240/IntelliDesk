// Unit tests for the AI reply grounding check (src/server/gemini/grounding.ts).
// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { findUngroundedFacts } from "../../src/server/gemini/grounding.ts";

const faq = [
	{
		score: 0.93,
		question: "How do I reset my password?",
		answer: "Go to https://app.acme.test/reset and follow the steps. Plans start at $49/month. Email help@acme.test if stuck.",
	},
];

test("a reply that only uses facts from the articles is grounded", () => {
	const reply = "Hi Sam, go to https://app.acme.test/reset. If you're stuck, email help@acme.test.";
	assert.deepEqual(findUngroundedFacts(reply, faq), []);
});

test("links, emails, prices and phone numbers not in the articles are flagged", () => {
	const reply =
		"Visit https://evil.example/login, write to refunds@acme.test, we'll refund $500, or call +1 (555) 010-9999.";
	const found = findUngroundedFacts(reply, faq);
	assert.ok(found.includes("https://evil.example/login"));
	assert.ok(found.includes("refunds@acme.test"));
	assert.ok(found.some((f) => f.includes("500")));
	assert.ok(found.some((f) => f.includes("555")));
});

test("trailing punctuation doesn't make a grounded link look new", () => {
	assert.deepEqual(findUngroundedFacts("See https://app.acme.test/reset.", faq), []);
});

test("a price that does appear in the articles is fine", () => {
	assert.deepEqual(findUngroundedFacts("Plans start at $49/month.", faq), []);
});
