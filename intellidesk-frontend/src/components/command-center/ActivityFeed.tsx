"use client";

// Audit log activity feed showing ticket events, responses, and status changes with timestamps.
import { Activity, History, Inbox, Mail, Pencil, Send, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Panel, PanelHeader, PanelBody } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime, formatRelative } from "@/lib/ticket-meta";
import { useTicketParam } from "@/hooks/useTicketParam";
import type { AuditLogRow } from "@/types/api";

type Tone = "neutral" | "info" | "success";

interface ActionMeta {
	label: string;
	icon: LucideIcon;
	tone: Tone;
}

const TONE_CLASSES: Record<Tone, string> = {
	neutral: "bg-fill text-subtle",
	info: "bg-info-subtle text-info-text",
	success: "bg-success-subtle text-success-text",
};

function capitalizeFirst(value: string): string {
	if (!value) return value;
	return value.charAt(0).toUpperCase() + value.slice(1);
}

function actionMeta(action: string): ActionMeta {
	switch (action) {
		case "ticket_created":
			return { label: "Ticket created from email", icon: Inbox, tone: "neutral" };
		case "email_added":
			return { label: "Customer replied", icon: Mail, tone: "info" };
		case "response_sent":
			return { label: "Response sent", icon: Send, tone: "success" };
		case "ticket_updated":
			return { label: "Ticket updated", icon: Pencil, tone: "neutral" };
		default:
			return { label: capitalizeFirst(action.replaceAll("_", " ")), icon: Activity, tone: "neutral" };
	}
}

const UPDATE_LABELS: Record<string, (value: unknown) => string | null> = {
	status: (value) => (typeof value === "string" ? `Status → ${value}` : null),
	severity: (value) => (typeof value === "string" ? `Priority → ${value}` : null),
	assigned_agent: (value) => (value ? "Assignee changed" : "Unassigned"),
	category: (value) => (typeof value === "string" ? `Category → ${value}` : null),
};

function detailLine(action: string, details: Record<string, unknown> | null): string | null {
	if (!details) return null;
	if (action === "response_sent" && typeof details.to === "string") {
		return `to ${details.to}`;
	}
	if (action === "ticket_updated" && typeof details.updates === "object" && details.updates !== null) {
		const updates = details.updates as Record<string, unknown>;
		const parts: string[] = [];
		for (const [key, value] of Object.entries(updates)) {
			// SLA timestamps are set automatically alongside status changes, so listing them only adds noise.
			if (key.startsWith("sla_")) continue;
			const formatter = UPDATE_LABELS[key];
			if (!formatter) continue;
			const text = formatter(value);
			if (text) parts.push(text);
		}
		return parts.length > 0 ? parts.join(" · ") : null;
	}
	return null;
}

export function ActivityFeed({ items }: { items: AuditLogRow[] }) {
	const { openTicket } = useTicketParam();

	return (
		<Panel as="section" aria-labelledby="activity-feed-heading">
			<PanelHeader
				id="activity-feed-heading"
				title="Recent activity"
				description="Latest pipeline and agent events"
				icon={<History aria-hidden="true" />}
			/>
			<PanelBody>
				{items.length === 0 ? (
					<EmptyState
						size="sm"
						icon={History}
						title="No activity yet"
						description="Events appear here as emails are processed and agents respond."
					/>
				) : (
					<ol className="relative space-y-0">
						{items.map((item) => {
							const meta = actionMeta(item.action);
							const Icon = meta.icon;
							const change = detailLine(item.action, item.details);
							const detail = [item.ticket_number, item.ticket_subject, change].filter(Boolean).join(" · ") || null;
							const ticketId = item.ticket_id ?? (item.entity_type === "ticket" ? item.entity_id : null);
							const relative = formatRelative(item.created_at);
							const ariaLabel = [meta.label, detail, relative, "Open ticket"].filter(Boolean).join(". ");

							const iconBadge = (
								<span
									className={cn(
										"flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
										TONE_CLASSES[meta.tone],
									)}
									aria-hidden="true"
								>
									<Icon className="h-3.5 w-3.5" />
								</span>
							);
							const time = (
								<time
									dateTime={item.created_at}
									title={formatDateTime(item.created_at)}
									className="ml-auto shrink-0 whitespace-nowrap text-xs text-subtlest"
								>
									{relative}
								</time>
							);

							if (ticketId) {
								return (
									<li key={item.id}>
										<button
											type="button"
											onClick={() => openTicket(ticketId)}
											aria-label={ariaLabel}
											className="flex w-full items-start gap-3 rounded-md px-1 py-2 text-left hover:bg-fill"
										>
											{iconBadge}
											<div className="min-w-0 flex-1">
												<p className="truncate text-sm text-foreground">{meta.label}</p>
												{detail && <p className="truncate text-xs text-subtle">{detail}</p>}
											</div>
											{time}
										</button>
									</li>
								);
							}

							return (
								<li key={item.id}>
									<div className="flex w-full items-start gap-3 rounded-md px-1 py-2">
										{iconBadge}
										<div className="min-w-0 flex-1">
											<p className="truncate text-sm text-foreground">{meta.label}</p>
											{detail && <p className="truncate text-xs text-subtle">{detail}</p>}
										</div>
										{time}
									</div>
								</li>
							);
						})}
					</ol>
				)}
			</PanelBody>
		</Panel>
	);
}
