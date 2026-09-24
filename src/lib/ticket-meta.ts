// Ticket metadata: severity/status/category definitions, formatting helpers for dates/durations/SLA states.
import { differenceInMinutes, format, formatDistanceToNowStrict, parseISO } from "date-fns";
import type { EmailCategory, Severity, TicketStatus } from "@/types";

export const SEVERITIES: Severity[] = ["P1", "P2", "P3", "P4"];

export const PRIORITY_META: Record<Severity, { label: string; rank: number }> = {
	P1: { label: "Highest", rank: 1 },
	P2: { label: "High", rank: 2 },
	P3: { label: "Medium", rank: 3 },
	P4: { label: "Low", rank: 4 },
};

export const STATUSES: TicketStatus[] = ["New", "In Progress", "Resolved", "Closed"];
export const OPEN_STATUSES: TicketStatus[] = ["New", "In Progress"];

/** Jira status categories: to-do (grey), in-progress (blue), done (green). */
export type StatusAppearance = "default" | "inprogress" | "success";

export const STATUS_META: Record<TicketStatus, { appearance: StatusAppearance }> = {
	New: { appearance: "default" },
	"In Progress": { appearance: "inprogress" },
	Resolved: { appearance: "success" },
	Closed: { appearance: "success" },
};

export const CATEGORIES: EmailCategory[] = [
	"Technical Support",
	"Access Request",
	"Billing/Invoice",
	"Feature Request",
	"Hardware/Infrastructure",
	"How-To/Documentation",
	"Data Request",
	"Complaint/Escalation",
	"General Inquiry",
];

export function isSeverity(value: string | null | undefined): value is Severity {
	return value === "P1" || value === "P2" || value === "P3" || value === "P4";
}

export function isStatus(value: string | null | undefined): value is TicketStatus {
	return value === "New" || value === "In Progress" || value === "Resolved" || value === "Closed";
}

export function isCategory(value: string | null | undefined): value is EmailCategory {
	return CATEGORIES.includes(value as EmailCategory);
}

// ---------- formatting ----------

export function formatRelative(iso: string | null | undefined): string {
	if (!iso) return "—";
	return formatDistanceToNowStrict(parseISO(iso), { addSuffix: true });
}

export function formatDateTime(iso: string | null | undefined): string {
	if (!iso) return "—";
	return format(parseISO(iso), "d MMM yyyy, HH:mm");
}

export function formatClock(date: Date): string {
	return format(date, "HH:mm:ss");
}

/** 95 → "1h 35m", 3000 → "2d 2h". */
export function formatDuration(totalMinutes: number): string {
	const minutes = Math.max(0, Math.round(Math.abs(totalMinutes)));
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ${minutes % 60}m`;
	const days = Math.floor(hours / 24);
	return `${days}d ${hours % 24}h`;
}

/** AI confidence is stored as 0–1. Returns null when absent. */
export function confidencePercent(value: number | null | undefined): number | null {
	if (value === null || value === undefined || Number.isNaN(value)) return null;
	const pct = value <= 1 ? value * 100 : value;
	return Math.round(Math.min(100, Math.max(0, pct)));
}

export type SlaTone = "breached" | "critical" | "warning" | "ok" | "met" | "none";

export interface SlaReading {
	tone: SlaTone;
	/** Short text, e.g. "Breached 2h 5m ago", "45m left", "Met". */
	label: string;
	minutesRemaining: number | null;
}

/**
 * Reads one SLA target. `completedAt` set means the target was met or missed already.
 * critical: < 60m left, warning: < 25% of `windowMinutes` left (or < 4h when unknown).
 */
export function readSla(
	dueIso: string | null | undefined,
	completedAt: string | null | undefined,
	now: Date,
	windowMinutes?: number,
): SlaReading {
	if (!dueIso) return { tone: "none", label: "No SLA", minutesRemaining: null };
	const due = parseISO(dueIso);
	if (completedAt) {
		const done = parseISO(completedAt);
		return done <= due
			? { tone: "met", label: "Met", minutesRemaining: null }
			: { tone: "breached", label: `Missed by ${formatDuration(differenceInMinutes(done, due))}`, minutesRemaining: null };
	}
	const remaining = differenceInMinutes(due, now);
	if (remaining < 0) {
		return { tone: "breached", label: `Breached ${formatDuration(-remaining)} ago`, minutesRemaining: remaining };
	}
	const warnAt = windowMinutes ? windowMinutes * 0.25 : 240;
	const tone: SlaTone = remaining < 60 ? "critical" : remaining < warnAt ? "warning" : "ok";
	return { tone, label: `${formatDuration(remaining)} left`, minutesRemaining: remaining };
}

/** Single largest unit, for fixed-width cells: 45 → "45m", 200 → "3h", 4000 → "2d". */
export function formatCompactDuration(totalMinutes: number): string {
	const minutes = Math.max(0, Math.round(Math.abs(totalMinutes)));
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	return `${Math.floor(hours / 24)}d`;
}
