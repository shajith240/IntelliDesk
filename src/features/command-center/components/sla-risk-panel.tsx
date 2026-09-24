"use client";

// SLA risk panel showing breached and at-risk tickets with next urgent target.
import Link from "next/link";
import { ShieldCheck, Timer } from "lucide-react";
import { Panel, PanelHeader, PanelBody } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PriorityIcon } from "@/components/ui/priority-icon";
import { SlaBadge } from "@/components/ui/sla-badge";
import { useNow } from "@/hooks/use-now";
import { useTicketParam } from "@/hooks/use-ticket-param";
import type { SLAAlert } from "@/types/api";

const MAX_REMAINING = 5;

interface Target {
	target: "Response" | "Resolution";
	due: string | null;
	completed: string | null;
}

function targetOf(alert: SLAAlert): Target {
	if (!alert.first_response_at) {
		return { target: "Response", due: alert.first_response_due, completed: null };
	}
	return { target: "Resolution", due: alert.resolution_due, completed: alert.resolved_at };
}

interface SlaRiskPanelProps {
	alerts: SLAAlert[];
	breached: number;
	atRisk: number;
}

export function SlaRiskPanel({ alerts, breached, atRisk }: SlaRiskPanelProps) {
	const now = useNow(30000);
	const { openTicket } = useTicketParam();

	if (alerts.length === 0) {
		return (
			<Panel as="section" aria-labelledby="sla-risk-heading" className="@container">
				<PanelHeader
					id="sla-risk-heading"
					title="SLA risk"
					description="Open tickets past or within 25% of an SLA target"
					icon={<Timer aria-hidden="true" />}
				/>
				<PanelBody>
					<EmptyState
						size="sm"
						icon={ShieldCheck}
						title="No SLA risk"
						description="Every open ticket is inside its SLA window."
					/>
				</PanelBody>
			</Panel>
		);
	}

	const [next, ...rest] = alerts;
	const nextTarget = targetOf(next);
	const nextBreached = next.first_response_breached || next.resolution_breached;
	const nextHighPriority = next.severity === "P1" || next.severity === "P2";
	const nextReason =
		(nextBreached ? `Past its ${nextTarget.target.toLowerCase()} target` : `Closest to its ${nextTarget.target.toLowerCase()} target`) +
		(nextHighPriority ? " · high priority" : "") +
		(next.customer ? ` · ${next.customer}` : "");

	const remaining = rest.slice(0, MAX_REMAINING);
	const total = breached + atRisk;

	return (
		<Panel as="section" aria-labelledby="sla-risk-heading" className="@container">
			<PanelHeader
				id="sla-risk-heading"
				title="SLA risk"
				description={<span className="tabular">{`${breached} breached · ${atRisk} at risk`}</span>}
				icon={<Timer aria-hidden="true" />}
			/>
			<PanelBody>
				<div className="flex flex-col gap-2 rounded-md border border-border bg-sunken p-3">
					<div className="flex items-center gap-2">
						<p className="text-[11px] font-bold uppercase tracking-[0.02em] text-subtlest">Next up</p>
						<SlaBadge
							className="ml-auto"
							due={nextTarget.due}
							completedAt={nextTarget.completed}
							now={now}
							target={nextTarget.target}
						/>
					</div>
					<div className="flex min-w-0 items-center gap-2">
						<PriorityIcon severity={next.severity} />
						<span className="shrink-0 font-mono text-xs text-subtle">{next.ticket_number}</span>
					</div>
					<p className="line-clamp-2 text-sm font-medium text-foreground">{next.subject ?? "Untitled ticket"}</p>
					<div className="flex items-center gap-3">
						<p className="min-w-0 flex-1 truncate text-xs text-subtle">{nextReason}</p>
						<Button
							variant="primary"
							size="sm"
							className="shrink-0"
							aria-label={`Open ${next.ticket_number}`}
							onClick={() => openTicket(next.ticket_id)}
						>
							Open
						</Button>
					</div>
				</div>

				{remaining.length > 0 && (
					<ul className="mt-2 divide-y divide-border">
						{remaining.map((alert) => {
							const target = targetOf(alert);
							const isBreached = alert.first_response_breached || alert.resolution_breached;
							return (
								<li key={alert.ticket_id}>
									<button
										type="button"
										onClick={() => openTicket(alert.ticket_id)}
										aria-label={`${alert.ticket_number}: ${alert.subject ?? "Untitled ticket"}. ${target.target} ${isBreached ? "breached" : "at risk"}`}
										className="grid w-full grid-cols-[16px_minmax(0,1fr)_68px] items-center gap-2 rounded-md px-1 py-2 text-left hover:bg-fill @min-[360px]:grid-cols-[16px_76px_minmax(0,1fr)_68px]"
									>
										<PriorityIcon severity={alert.severity} />
										<span className="hidden truncate whitespace-nowrap font-mono text-xs text-subtle @min-[360px]:block">{alert.ticket_number}</span>
										<span className="min-w-0 truncate text-sm">{alert.subject ?? "Untitled ticket"}</span>
										<SlaBadge due={target.due} completedAt={target.completed} now={now} target={target.target} />
									</button>
								</li>
							);
						})}
					</ul>
				)}

				{total > 6 && (
					<Link href="/dashboard/queue" className="mt-3 inline-block text-sm text-primary hover:underline">
						{`View all ${total} in the queue`}
					</Link>
				)}
			</PanelBody>
		</Panel>
	);
}
