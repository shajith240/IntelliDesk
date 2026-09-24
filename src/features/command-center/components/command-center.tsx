"use client";

// Command center dashboard: metrics, SLA alerts, recent activity, and work queue overview.
import Link from "next/link";
import { Inbox } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { SectionMessage } from "@/components/ui/section-message";
import { ErrorState } from "@/components/ui/error-state";
import { Panel, PanelHeader, PanelBody } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkQueue } from "@/features/queue/components/work-queue";
import { useDashboard } from "@/hooks/use-api";
import { formatClock } from "@/lib/ticket-meta";
import { MetricStrip, MetricStripSkeleton } from "./metric-strip";
import { SlaRiskPanel } from "./sla-risk-panel";
import { ActivityFeed } from "./activity-feed";

function RailSkeleton() {
	return (
		<div className="contents">
			<Panel as="section">
				<PanelHeader title="SLA risk" />
				<PanelBody className="space-y-2">
					{Array.from({ length: 4 }).map((_, index) => (
						<Skeleton key={index} className="h-4 w-full" />
					))}
				</PanelBody>
			</Panel>
			<Panel as="section">
				<PanelHeader title="Recent activity" />
				<PanelBody className="space-y-2">
					{Array.from({ length: 4 }).map((_, index) => (
						<Skeleton key={index} className="h-4 w-full" />
					))}
				</PanelBody>
			</Panel>
		</div>
	);
}

export function CommandCenter() {
	const { data, error, isValidating, mutate } = useDashboard();

	const metricsErrored = !data && Boolean(error);

	return (
		<div className="pb-10">
			<PageHeader
				breadcrumbs={[{ label: "Support" }, { label: "Command Center" }]}
				title="Command Center"
				description="What needs attention across your support queue right now."
				meta={
					data ? (
						<>
							Snapshot {formatClock(new Date(data.generated_at))}
							{isValidating ? " · refreshing…" : ""}
						</>
					) : null
				}
				actions={
					<Button asChild variant="default">
						<Link href="/dashboard/queue">
							<Inbox aria-hidden="true" />
							Incoming queue
						</Link>
					</Button>
				}
			/>
			<div className="space-y-6 px-4 sm:px-6">
				{error && data && (
					<SectionMessage
						appearance="warning"
						title="Couldn't refresh the dashboard"
						actions={
							<Button variant="link" onClick={() => mutate()}>
								Retry
							</Button>
						}
					>
						Showing the last loaded snapshot. {error.message}
					</SectionMessage>
				)}

				{data ? (
					<MetricStrip data={data} />
				) : metricsErrored ? (
					<ErrorState
						size="md"
						title="Couldn't load the Command Center"
						message={error instanceof Error ? error.message : "Something went wrong."}
						onRetry={() => mutate()}
						retrying={isValidating}
					/>
				) : (
					<MetricStripSkeleton />
				)}

				<aside
					aria-label="Risk and activity"
					className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2"
				>
					{data ? (
						<>
							<SlaRiskPanel alerts={data.sla_alerts} breached={data.sla.breached} atRisk={data.sla.at_risk} />
							<ActivityFeed items={data.recent_activity.slice(0, 6)} />
						</>
					) : metricsErrored ? null : (
						<RailSkeleton />
					)}
				</aside>

				<WorkQueue scope="open" title="Work queue" />
			</div>
		</div>
	);
}
