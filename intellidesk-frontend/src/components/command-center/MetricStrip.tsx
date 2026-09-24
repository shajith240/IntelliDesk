"use client";

// Key metrics display: open queue, severity breakdown, SLA status, review backlog, AI confidence, responses.
import { AlertTriangle, ChevronsUp, Eye, Inbox, Send, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { AiMark } from "@/components/ui/ai-mark";
import { ConfidenceMeter, confidenceBand } from "@/components/ui/confidence-meter";
import { confidencePercent } from "@/lib/ticket-meta";
import type { DashboardResponse } from "@/types/api";

interface MetricCellProps {
	/** A lucide icon component, rendered with the shared sizing/color treatment. */
	icon?: LucideIcon;
	/** A pre-built icon element (e.g. `<AiMark />`) for non-lucide marks. Takes precedence over `icon`. */
	iconNode?: React.ReactElement;
	iconClassName?: string;
	label: string;
	value: React.ReactNode;
	valueClassName?: string;
	context: React.ReactNode;
}

// Responsive grid borders: hides right borders on every other cell (mobile), every third (sm), switches to no-border-bottom at xl.
const CELL_BORDER_CLASSES =
	"[&:nth-child(2n)]:border-r-0 sm:[&:nth-child(2n)]:border-r sm:[&:nth-child(3n)]:border-r-0 xl:[&:nth-child(3n)]:border-r xl:border-b-0 xl:last:border-r-0";

function MetricCell({ icon: Icon, iconNode, iconClassName, label, value, valueClassName, context }: MetricCellProps) {
	return (
		<div className={cn("relative flex flex-col gap-1 border-b border-r border-border p-4", CELL_BORDER_CLASSES)}>
			<dt className="flex items-center gap-1.5 truncate text-xs font-semibold text-subtle">
				{iconNode ?? (Icon && <Icon className={cn("h-3.5 w-3.5 shrink-0", iconClassName)} aria-hidden="true" />)}
				<span className="truncate">{label}</span>
			</dt>
			<dd className={cn("text-2xl font-semibold tabular text-foreground", valueClassName)}>{value}</dd>
			<dd className="line-clamp-2 text-xs text-subtlest">{context}</dd>
		</div>
	);
}

export function MetricStrip({ data }: { data: DashboardResponse }) {
	const newCount = data.tickets.by_status.New ?? 0;
	const inProgressCount = data.tickets.by_status["In Progress"] ?? 0;
	const p1 = data.tickets.by_severity.P1 ?? 0;
	const p2 = data.tickets.by_severity.P2 ?? 0;
	const confidence = confidencePercent(data.tickets.avg_ai_confidence);

	return (
		<dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-raised sm:grid-cols-3 xl:grid-cols-6">
			<MetricCell
				icon={Inbox}
				label="Open queue"
				value={data.tickets.open}
				context={`${newCount} new · ${inProgressCount} in progress`}
			/>
			<MetricCell
				icon={ChevronsUp}
				iconClassName="text-priority-highest"
				label="Highest & high"
				value={p1 + p2}
				context={`${p1} highest · ${p2} high`}
			/>
			<MetricCell
				icon={AlertTriangle}
				label="SLA breached"
				value={data.sla.breached}
				valueClassName={data.sla.breached > 0 ? "text-danger-text" : undefined}
				context={`${data.sla.at_risk} at risk`}
			/>
			<MetricCell
				icon={Eye}
				label="Needs review"
				value={data.tickets.awaiting_review}
				context="Flagged by AI for a human check"
			/>
			<MetricCell
				iconNode={<AiMark className="h-3.5 w-3.5 shrink-0 text-discovery" />}
				label="Avg AI confidence"
				value={confidence === null ? "—" : `${confidence}%`}
				valueClassName={confidence !== null ? confidenceBand(confidence).text : undefined}
				context={
					<span className="flex items-center gap-2">
						<ConfidenceMeter value={confidence} showValue={false} />
						<span>Across open tickets</span>
					</span>
				}
			/>
			<MetricCell
				icon={Send}
				label="Sent today"
				value={data.responses.sent_today}
				context={`${data.tickets.resolved_today} resolved today`}
			/>
		</dl>
	);
}

export function MetricStripSkeleton() {
	return (
		<dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-raised sm:grid-cols-3 xl:grid-cols-6">
			{Array.from({ length: 6 }).map((_, index) => (
				<div
					key={index}
					className={cn("relative flex flex-col gap-1 border-b border-r border-border p-4", CELL_BORDER_CLASSES)}
				>
					<Skeleton className="h-3 w-20" />
					<Skeleton className="h-7 w-12" />
					<Skeleton className="h-3 w-28" />
				</div>
			))}
		</dl>
	);
}
