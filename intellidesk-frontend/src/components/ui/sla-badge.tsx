// Fixed-width SLA state badge; breaches shown as negative time, clocks show time remaining.
import { AlertTriangle, Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCompactDuration, readSla } from "@/lib/ticket-meta";

interface SlaBadgeProps {
	/** Due time of the target being shown. */
	due: string | null | undefined;
	/** When the target was completed (first response sent / resolved), if it was. */
	completedAt?: string | null;
	now: Date;
	/** "Response" or "Resolution" — used in the accessible label and tooltip. */
	target: "Response" | "Resolution";
	className?: string;
}

/**
 * One-line, fixed-width SLA state. Breaches use negative notation ("-3h"),
 * running clocks show time left ("45m"). Never wraps.
 */
export function SlaBadge({ due, completedAt, now, target, className }: SlaBadgeProps) {
	const reading = readSla(due, completedAt, now);
	const base =
		"inline-flex h-5 w-[68px] shrink-0 items-center gap-1 rounded-sm px-1.5 font-mono text-[11px] font-medium leading-none tabular whitespace-nowrap";

	if (reading.tone === "none") {
		return (
			<span className={cn(base, "text-subtlest", className)} title="No SLA policy">
				—<span className="sr-only">No SLA</span>
			</span>
		);
	}

	const full = `${target} ${reading.label.toLowerCase()}`;
	let text: string;
	let tone: string;
	let Icon = Clock;
	if (reading.tone === "met") {
		text = "Met";
		tone = "text-success-text";
		Icon = Check;
	} else if (reading.tone === "breached") {
		text = reading.minutesRemaining === null ? "Missed" : `-${formatCompactDuration(reading.minutesRemaining)}`;
		tone = "bg-danger-subtle text-danger-text";
		Icon = AlertTriangle;
	} else {
		text = formatCompactDuration(reading.minutesRemaining ?? 0);
		tone =
			reading.tone === "critical" || reading.tone === "warning"
				? "bg-warning-subtle text-warning-text"
				: "text-subtle";
	}

	return (
		<span className={cn(base, tone, className)} title={full}>
			<Icon className="h-3 w-3 shrink-0" strokeWidth={2.25} aria-hidden="true" />
			<span aria-hidden="true">{text}</span>
			<span className="sr-only">{full}</span>
		</span>
	);
}
