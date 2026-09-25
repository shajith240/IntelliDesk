"use client";

// Ticket sidebar: verified fields, SLA, customer, AI insights and similar tickets as collapsible sections.
import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { ChevronDown, Frown, Meh, Smile } from "lucide-react";
import { differenceInMinutes, parseISO } from "date-fns";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Lozenge, StatusLozenge } from "@/components/ui/lozenge";
import { PriorityIcon } from "@/components/ui/priority-icon";
import { SlaBadge } from "@/components/ui/sla-badge";
import { AiLabel } from "@/components/ui/ai-mark";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTeam, useWorkload } from "@/hooks/use-api";
import { useNow } from "@/hooks/use-now";
import { formatDateTime, isSeverity, PRIORITY_META, readSla, SEVERITIES } from "@/lib/ticket-meta";
import { parseClassification } from "@/features/ticket-workspace/lib/ticket-detail";
import { useCanWorkTicket } from "@/features/ticket-workspace/hooks/use-can-work-ticket";
import { useTicketMutation } from "@/features/ticket-workspace/hooks/use-ticket-mutation";
import { AssignMenuItems, useAssignTicket } from "./assign-menu";
import { SidebarField, SidebarSection } from "./sidebar-section";
import type { AutoResponseRow, SimilarTicketRef, SLAStatus, TicketDetail } from "@/types/api";

interface TicketSidebarProps {
	ticket: TicketDetail;
	sla: SLAStatus | null;
	similarTickets: SimilarTicketRef[];
	evidence: AutoResponseRow | null;
	onOpenTicket: (id: string) => void;
}

function matchLabel(matchType: AutoResponseRow["match_type"]): string {
	if (matchType === "perfect") return "Matched a knowledge base article";
	if (matchType === "partial") return "Partially matched a knowledge base article";
	return "No knowledge base article matched";
}

function matchScoreLabel(score: number): string | null {
	if (score > 0 && score <= 1) return `${Math.round(score * 100)}%`;
	if (score > 1) return `${Math.round(score)}%`;
	return null;
}

function sentimentIcon(sentiment: string) {
	const normalized = sentiment.toLowerCase();
	if (normalized === "positive") return Smile;
	if (normalized === "negative" || normalized === "angry" || normalized === "frustrated") return Frown;
	return Meh;
}

export function TicketSidebar({ ticket, sla, similarTickets, evidence, onOpenTicket }: TicketSidebarProps) {
	const { data: session } = useSession();
	const isAdmin = session?.user.role === "admin";
	const canWork = useCanWorkTicket(ticket);
	const { data: team } = useTeam();
	const { data: workload } = useWorkload(isAdmin);
	const { assign, pendingTicketId } = useAssignTicket();
	const { pendingField, update } = useTicketMutation(ticket.id);
	const now = useNow();
	const classification = useMemo(() => parseClassification(ticket.ai_classification), [ticket.ai_classification]);

	const member = team?.members.find((m) => m.id === ticket.assigned_agent) ?? null;
	const isSelf = ticket.assigned_agent === session?.user.id;
	const assigneeName = isSelf ? "You" : (member?.name ?? null);
	const assignPending = pendingTicketId === ticket.id;

	const handlePriorityChange = (value: string) => {
		if (!isSeverity(value) || value === ticket.severity) return;
		void update({ severity: value }, `Priority set to ${PRIORITY_META[value].label}`);
	};

	// AI fields that repeat a verified field are only worth showing when the model disagrees.
	const aiCategoryDiffers = !!classification?.category && classification.category !== ticket.category;
	const aiSeverityDiffers =
		!!classification?.severity && isSeverity(classification.severity) && classification.severity !== ticket.severity;

	return (
		<div>
			<SidebarSection title="Details">
				<dl>
					<SidebarField label="Assignee">
						<div className="flex flex-wrap items-center gap-2">
							<Avatar name={assigneeName} size="xs" />
							<span>{assigneeName ?? "Unassigned"}</span>
						</div>
						{isAdmin && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="link" size="sm" className="mt-0.5" loading={assignPending}>
										Assign
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="start">
									<AssignMenuItems
										candidates={workload?.candidates ?? []}
										currentAssigneeId={ticket.assigned_agent}
										onSelect={(assigneeId, name) => void assign(ticket.id, assigneeId, name)}
									/>
								</DropdownMenuContent>
							</DropdownMenu>
						)}
					</SidebarField>

					<SidebarField label="Priority">
						{canWork ? (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="subtle"
										size="sm"
										className="-ml-2"
										loading={pendingField === "severity"}
										aria-label={`Priority: ${PRIORITY_META[ticket.severity].label}. Change priority`}
									>
										{pendingField !== "severity" && <PriorityIcon severity={ticket.severity} showLabel />}
										<ChevronDown aria-hidden="true" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="start">
									<DropdownMenuRadioGroup value={ticket.severity} onValueChange={handlePriorityChange}>
										{SEVERITIES.map((severity) => (
											<DropdownMenuRadioItem key={severity} value={severity}>
												<PriorityIcon severity={severity} showLabel />
											</DropdownMenuRadioItem>
										))}
									</DropdownMenuRadioGroup>
								</DropdownMenuContent>
							</DropdownMenu>
						) : (
							<PriorityIcon severity={ticket.severity} showLabel />
						)}
					</SidebarField>

					<SidebarField label="Category">{ticket.category ?? "—"}</SidebarField>
					<SidebarField label="Team">{ticket.teams?.name ?? "—"}</SidebarField>
					<SidebarField label="Created">{formatDateTime(ticket.created_at)}</SidebarField>
					<SidebarField label="Updated">{formatDateTime(ticket.updated_at)}</SidebarField>
				</dl>
			</SidebarSection>

			<SidebarSection title="SLA">
				{sla ? (
					<dl>
						<SlaField
							label="First response"
							target="Response"
							due={sla.first_response_due}
							completedAt={sla.first_response_at}
							now={now}
							createdAt={ticket.created_at}
						/>
						<SlaField
							label="Resolution"
							target="Resolution"
							due={sla.resolution_due}
							completedAt={sla.resolved_at}
							now={now}
							createdAt={ticket.created_at}
						/>
					</dl>
				) : (
					<p className="text-sm text-subtle">No SLA policy applies to this priority.</p>
				)}
			</SidebarSection>

			<SidebarSection title="Customer">
				{ticket.contacts ? (
					<div className="flex items-start gap-3">
						<Avatar name={ticket.contacts.name ?? ticket.contacts.email} size="md" />
						<div className="min-w-0 text-sm">
							<p className="truncate font-medium text-foreground">
								{ticket.contacts.name ?? ticket.contacts.email}
							</p>
							{ticket.contacts.name && <p className="truncate text-subtle">{ticket.contacts.email}</p>}
							{(ticket.contacts.role || ticket.contacts.phone) && (
								<p className="text-subtle">
									{[ticket.contacts.role, ticket.contacts.phone].filter(Boolean).join(" · ")}
								</p>
							)}
							{ticket.accounts && (
								<p className="mt-2 flex flex-wrap items-center gap-1.5 text-foreground">
									{ticket.accounts.company_name}
									<Lozenge>{ticket.accounts.tier}</Lozenge>
								</p>
							)}
						</div>
					</div>
				) : (
					<p className="text-sm text-subtle">No contact is linked to this ticket.</p>
				)}
			</SidebarSection>

			<SidebarSection title="AI insights" adornment={<AiLabel>AI</AiLabel>}>
				{classification ? (
					<div className="space-y-3">
						<dl>
							{classification.sentiment && (
								<SidebarField label="Sentiment">
									<span className="inline-flex items-center gap-1.5 capitalize">
										{(() => {
											const Icon = sentimentIcon(classification.sentiment);
											return <Icon className="h-4 w-4 text-subtle" aria-hidden="true" />;
										})()}
										{classification.sentiment}
									</span>
								</SidebarField>
							)}
							{classification.language && (
								<SidebarField label="Language">
									<span className="capitalize">{classification.language}</span>
								</SidebarField>
							)}
							{aiCategoryDiffers && (
								<SidebarField label="Suggested category">
									{classification.category}
									<span className="block text-xs text-warning-text">Differs from the current category</span>
								</SidebarField>
							)}
							{aiSeverityDiffers && classification.severity && isSeverity(classification.severity) && (
								<SidebarField label="Suggested priority">
									<PriorityIcon severity={classification.severity} showLabel />
									<span className="block text-xs text-warning-text">Differs from the current priority</span>
								</SidebarField>
							)}
							{classification.is_spam && (
								<SidebarField label="Spam">
									<Lozenge appearance="removed">Flagged as spam</Lozenge>
								</SidebarField>
							)}
							<SidebarField label="Knowledge base">
								{evidence ? (
									<>
										{matchLabel(evidence.match_type)}
										{matchScoreLabel(evidence.match_score) && (
											<span className="text-subtle"> · {matchScoreLabel(evidence.match_score)}</span>
										)}
									</>
								) : (
									<span className="text-subtle">No match recorded</span>
								)}
							</SidebarField>
						</dl>

						{classification.key_entities && classification.key_entities.length > 0 && (
							<TagGroup label="Key entities" items={classification.key_entities} />
						)}
						{classification.suggested_tags && classification.suggested_tags.length > 0 && (
							<TagGroup label="Suggested tags" items={classification.suggested_tags} />
						)}
					</div>
				) : (
					<p className="text-sm text-subtle">
						No AI analysis was recorded for this ticket, either because it predates analysis or because
						classification failed.
					</p>
				)}
			</SidebarSection>

			<SidebarSection
				title="Similar tickets"
				defaultOpen={false}
				adornment={<span className="text-xs tabular text-subtlest">{similarTickets.length}</span>}
			>
				{similarTickets.length === 0 ? (
					<p className="text-sm text-subtle">No other tickets in this category.</p>
				) : (
					<>
						<ul className="-mx-1.5 space-y-0.5">
							{similarTickets.map((similar) => (
								<li key={similar.id}>
									<button
										type="button"
										onClick={() => onOpenTicket(similar.id)}
										className="grid w-full grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors duration-100 hover:bg-fill"
									>
										<PriorityIcon severity={similar.severity} />
										<span className="min-w-0">
											<span className="block font-mono text-[11px] text-subtlest">{similar.ticket_number}</span>
											<span className="block truncate text-sm text-foreground">{similar.subject}</span>
										</span>
										<StatusLozenge status={similar.status} />
									</button>
								</li>
							))}
						</ul>
						<p className="mt-2 text-xs text-subtlest">Same category, most recent first.</p>
					</>
				)}
			</SidebarSection>
		</div>
	);
}

function SlaField({
	label,
	target,
	due,
	completedAt,
	now,
	createdAt,
}: {
	label: string;
	target: "Response" | "Resolution";
	due: string | null;
	completedAt: string | null;
	now: Date;
	createdAt?: string;
}) {
	const windowMinutes = due && createdAt ? differenceInMinutes(parseISO(due), parseISO(createdAt)) : undefined;
	const reading = readSla(due, completedAt, now, windowMinutes);
	return (
		<SidebarField label={label}>
			<div className="flex flex-wrap items-center gap-2">
				<SlaBadge due={due} completedAt={completedAt} now={now} target={target} />
				<span className="text-xs text-subtle">{reading.label}</span>
			</div>
			{due && <span className="mt-0.5 block text-xs text-subtlest">Due {formatDateTime(due)}</span>}
		</SidebarField>
	);
}

function TagGroup({ label, items }: { label: string; items: string[] }) {
	return (
		<div>
			<p className="text-xs font-medium text-subtle">{label}</p>
			<div className="mt-1.5 flex flex-wrap gap-1.5">
				{items.map((item) => (
					<Lozenge key={item}>{item}</Lozenge>
				))}
			</div>
		</div>
	);
}
