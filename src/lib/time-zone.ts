// Pure date helpers for workspace timezones (unit-tested in tests/unit/time-zone.test.ts).

/** Offset of `timeZone` from UTC at instant `at`, in minutes (IST → +330). */
function offsetMinutes(timeZone: string, at: Date): number {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).formatToParts(at);
	const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
	const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
	return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/**
 * The UTC instant at which the current calendar day began in `timeZone`.
 * Uses the offset in effect at that midnight, so DST transition days are right.
 */
export function startOfDayInTimeZone(timeZone: string, now: Date = new Date()): Date {
	const local = new Date(now.getTime() + offsetMinutes(timeZone, now) * 60000);
	const midnightAsUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
	// First guess with today's offset, then correct with the offset at that midnight.
	const guess = new Date(midnightAsUtc - offsetMinutes(timeZone, now) * 60000);
	return new Date(midnightAsUtc - offsetMinutes(timeZone, guess) * 60000);
}
