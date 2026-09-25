// Unit tests for src/lib/time-zone.ts. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { startOfDayInTimeZone } from "../../src/lib/time-zone.ts";

test("UTC midnight", () => {
	assert.equal(startOfDayInTimeZone("UTC", new Date("2026-09-25T15:30:00Z")).toISOString(), "2026-09-25T00:00:00.000Z");
});

test("India (UTC+5:30): the local day starts at 18:30 UTC the previous day", () => {
	assert.equal(
		startOfDayInTimeZone("Asia/Kolkata", new Date("2026-09-25T20:00:00Z")).toISOString(),
		"2026-09-25T18:30:00.000Z", // already the 26th in India
	);
	assert.equal(
		startOfDayInTimeZone("Asia/Kolkata", new Date("2026-09-25T10:00:00Z")).toISOString(),
		"2026-09-24T18:30:00.000Z",
	);
});

test("New York across the DST change uses the offset at midnight", () => {
	// 2026-11-01: clocks go back at 02:00; midnight that day is still EDT (UTC-4).
	assert.equal(
		startOfDayInTimeZone("America/New_York", new Date("2026-11-01T18:00:00Z")).toISOString(),
		"2026-11-01T04:00:00.000Z",
	);
	// 2026-03-08: clocks go forward at 02:00; midnight is still EST (UTC-5).
	assert.equal(
		startOfDayInTimeZone("America/New_York", new Date("2026-03-08T18:00:00Z")).toISOString(),
		"2026-03-08T05:00:00.000Z",
	);
});
