"use client";

// Analytics dashboard: ticket breakdown by priority/category/status, SLA performance, email intake with bar charts.
import { useDashboard } from "@/hooks/useApi";
import { formatDuration, SEVERITIES, PRIORITY_META } from "@/lib/ticket-meta";
import { PageHeader } from "@/components/shell/PageHeader";
import { Panel, PanelHeader, PanelBody } from "@/components/ui/panel";
import { SectionMessage } from "@/components/ui/section-message";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { PriorityIcon } from "@/components/ui/priority-icon";
import { Button } from "@/components/ui/button";
import { StatusLozenge } from "@/components/ui/lozenge";

export function Analytics() {
	const { data: dashboard, error, isLoading, mutate } = useDashboard();

	if (isLoading) {
		return (
			<div className="pb-10">
				<div className="px-4 sm:px-6 space-y-3 pb-4">
					<Skeleton className="h-8 w-48" />
					<Skeleton className="h-4 w-96" />
				</div>
				<div className="px-4 sm:px-6 pb-4">
					<Skeleton className="h-20 w-full rounded-md" />
				</div>
				<div className="grid grid-cols-[minmax(0,1fr)] gap-6 px-4 sm:px-6 lg:grid-cols-2">
					{[1, 2, 3, 4, 5].map((i) => (
						<div key={i} className="rounded-lg border border-border bg-raised p-4">
							<Skeleton className="h-6 w-40 mb-4" />
							<Skeleton className="h-32 w-full" />
						</div>
					))}
				</div>
			</div>
		);
	}

	if (error && !dashboard) {
		return (
			<div className="pb-10">
				<PageHeader
					breadcrumbs={[
						{ label: "Support", href: "/dashboard" },
						{ label: "Analytics" },
					]}
					title="Analytics"
					description="A live snapshot of the current queue."
				/>
				<div className="px-4 sm:px-6">
					<ErrorState
						message="Failed to load analytics data"
						onRetry={() => mutate()}
					/>
				</div>
			</div>
		);
	}

	const data = dashboard!;
	// Bar widths scale relative to max count in each category; if max is 0, all bars are hidden.
	const maxSeverity = Math.max(...SEVERITIES.map((s) => data.tickets.by_severity[s] ?? 0));
	const categoriesData = Object.entries(data.tickets.by_category)
		.map(([name, count]) => ({ name: name || "Uncategorized", count }))
		.sort((a, b) => b.count - a.count);
	const maxCategory = Math.max(...categoriesData.map((c) => c.count));

	return (
		<div className="pb-10">
			<PageHeader
				breadcrumbs={[
					{ label: "Support", href: "/dashboard" },
					{ label: "Analytics" },
				]}
				title="Analytics"
				description="A live snapshot of the current queue."
			/>

			{error && dashboard && (
				<div className="px-4 sm:px-6 pb-4">
					<SectionMessage appearance="warning">
						Some data may be outdated. Try refreshing the page.
						<Button variant="link" size="sm" onClick={() => mutate()} className="mt-1">
							Refresh
						</Button>
					</SectionMessage>
				</div>
			)}

			<SectionMessage appearance="information" className="mx-4 mb-6 sm:mx-6">
				Trends over time aren&apos;t available yet — IntelliDesk doesn&apos;t store historical snapshots. Figures below reflect the queue right now.
			</SectionMessage>

			<div className="grid grid-cols-[minmax(0,1fr)] gap-6 px-4 sm:px-6 lg:grid-cols-2">
				{/* 1. Open tickets by priority */}
				<Panel>
					<PanelHeader title="Open tickets by priority" />
					<PanelBody>
						<div role="list" className="space-y-1.5">
							{SEVERITIES.map((severity) => {
								const count = data.tickets.by_severity[severity] ?? 0;
								const share = maxSeverity > 0 ? (count / maxSeverity) * 100 : 0;
								const colorMap = {
									P1: "bg-priority-highest",
									P2: "bg-priority-high",
									P3: "bg-priority-medium",
									P4: "bg-priority-low",
								};
								return (
									<div
										key={severity}
										role="listitem"
										aria-label={`${PRIORITY_META[severity].label}: ${count} open ${count === 1 ? "ticket" : "tickets"}`}
										className="grid grid-cols-[120px_minmax(0,1fr)_48px] items-center gap-3 py-1.5"
									>
										<PriorityIcon severity={severity} showLabel />
										<div className="h-2 rounded-full bg-fill">
											<div
												className={`h-full rounded-full transition-all duration-300 ${colorMap[severity]}`}
												style={{ width: `${share}%` }}
											/>
										</div>
										<div className="text-right text-sm font-mono text-foreground tabular">{count}</div>
									</div>
								);
							})}
						</div>
					</PanelBody>
				</Panel>

				{/* 2. Open tickets by category */}
				<Panel>
					<PanelHeader title="Open tickets by category" />
					<PanelBody>
						<div role="list" className="space-y-1.5">
							{categoriesData.map((item) => {
								const share = maxCategory > 0 ? (item.count / maxCategory) * 100 : 0;
								return (
									<div
										key={item.name}
										role="listitem"
										aria-label={`${item.name}: ${item.count} open ${item.count === 1 ? "ticket" : "tickets"}`}
										className="grid grid-cols-[120px_minmax(0,1fr)_48px] items-center gap-3 py-1.5"
									>
										<span className="truncate text-sm text-foreground">{item.name}</span>
										<div className="h-2 rounded-full bg-fill">
											<div
												className="h-full rounded-full bg-primary transition-all duration-300"
												style={{ width: `${share}%` }}
											/>
										</div>
										<div className="text-right text-sm font-mono text-foreground tabular">{item.count}</div>
									</div>
								);
							})}
						</div>
					</PanelBody>
				</Panel>

				{/* 3. Ticket status */}
				<Panel>
					<PanelHeader title="Ticket status" />
					<PanelBody>
						<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
							{["New", "In Progress", "Resolved", "Closed"].map((status) => {
								const count = data.tickets.by_status[status as "New" | "In Progress" | "Resolved" | "Closed"] ?? 0;
								return (
									<div key={status} className="text-center">
										<StatusLozenge status={status as "New" | "In Progress" | "Resolved" | "Closed"} />
										<div className="mt-2 text-xl font-semibold text-foreground">
											{count}
										</div>
									</div>
								);
							})}
						</div>
					</PanelBody>
				</Panel>

				{/* 4. SLA Performance */}
				<Panel>
					<PanelHeader title="SLA performance" />
					<PanelBody className="space-y-2">
						<div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
							<div>
								<p className="text-xs font-semibold text-subtle">Within SLA</p>
								<p className="text-lg font-semibold text-success">{data.sla.within_sla}</p>
							</div>
							<div>
								<p className="text-xs font-semibold text-subtle">At risk</p>
								<p className="text-lg font-semibold text-warning-text">{data.sla.at_risk}</p>
							</div>
							<div>
								<p className="text-xs font-semibold text-subtle">Breached</p>
								<p className={`text-lg font-semibold ${data.sla.breached > 0 ? "text-danger" : "text-foreground"}`}>
									{data.sla.breached}
								</p>
							</div>
							<div>
								<p className="text-xs font-semibold text-subtle">Total</p>
								<p className="text-lg font-semibold text-foreground">{data.sla.total_open}</p>
							</div>
						</div>
						<div className="border-t border-border pt-2 space-y-1">
							<div className="flex justify-between text-xs">
								<span className="text-subtle">Avg first response</span>
								<span className="font-mono text-foreground">
									{data.sla.avg_first_response_minutes !== null ? formatDuration(data.sla.avg_first_response_minutes) : "—"}
								</span>
							</div>
							<div className="flex justify-between text-xs">
								<span className="text-subtle">Avg resolution</span>
								<span className="font-mono text-foreground">
									{data.sla.avg_resolution_minutes !== null ? formatDuration(data.sla.avg_resolution_minutes) : "—"}
								</span>
							</div>
						</div>
						<p className="text-[10px] text-subtlest pt-1">Averages over the last 100 resolved tickets.</p>
					</PanelBody>
				</Panel>

				{/* 5. Email intake */}
				<Panel>
					<PanelHeader title="Email intake" />
					<PanelBody className="space-y-2">
						<div className="grid grid-cols-2 gap-2">
							<div>
								<p className="text-xs font-semibold text-subtle">Total emails</p>
								<p className="text-2xl font-semibold text-foreground">{data.emails.total}</p>
							</div>
							<div>
								<p className="text-xs font-semibold text-subtle">Spam filtered</p>
								<p className="text-2xl font-semibold text-foreground">{data.emails.spam}</p>
								{data.emails.total > 0 && (
									<p className="text-xs text-subtlest mt-1">
										{Math.round((data.emails.spam / data.emails.total) * 100)}% of total
									</p>
								)}
							</div>
						</div>
					</PanelBody>
				</Panel>
			</div>
		</div>
	);
}
