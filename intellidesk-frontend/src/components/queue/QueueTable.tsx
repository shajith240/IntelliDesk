"use client";

// Queue table/list: responsive rows with sortable headers, SLA badges, AI confidence, and assignee menu.
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROW_GRID, HIDE_860, HIDE_1100, HIDE_1240 } from "./grid";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ConfidenceMeter } from "@/components/ui/confidence-meter";
import { Lozenge, StatusLozenge } from "@/components/ui/lozenge";
import { PriorityIcon } from "@/components/ui/priority-icon";
import { SlaBadge } from "@/components/ui/sla-badge";
import { Tooltip } from "@/components/ui/tooltip";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { confidencePercent, formatCompactDuration, formatDateTime } from "@/lib/ticket-meta";
import { useNow } from "@/hooks/useNow";
import type { TeamMember, TicketListItem, TicketSortField } from "@/types/api";
import type { TicketStatus } from "@/types";

export interface QueueTableProps {
	tickets: TicketListItem[];
	sort: { field: TicketSortField; order: "asc" | "desc" };
	onSort: (field: TicketSortField) => void;
	activeIndex: number;
	setActiveIndex: (index: number) => void;
	onOpen: (id: string) => void;
	members: TeamMember[];
	currentUserId: string | undefined;
	onAssignToMe: (id: string) => void;
	onSetStatus: (id: string, status: TicketStatus) => void;
	pendingId: string | null;
}


const CUSTOMER_CELL = cn(HIDE_860, "truncate text-sm");
const CATEGORY_CELL = cn(HIDE_1240, "truncate text-sm text-subtle");

function sortDirFor(field: TicketSortField, sort: QueueTableProps["sort"]): "asc" | "desc" | null {
	return sort.field === field ? sort.order : null;
}

function memberName(id: string | null, members: TeamMember[], currentUserId: string | undefined): string | null {
	if (!id) return null;
	if (id === currentUserId) return "You";
	const member = members.find((m) => m.id === id);
	return member ? member.name : "Unknown user";
}

/** First-response target until it's answered, then resolution target. Null once the ticket is done. */
function slaTarget(
	ticket: TicketListItem,
): { due: string | null; completedAt: string | null; target: "Response" | "Resolution" } | null {
	if (ticket.status === "Resolved" || ticket.status === "Closed") return null;
	// If first response is null, we're still waiting on first response; once answered, track resolution instead.
	const usesFirstResponse = !ticket.sla_first_response_at;
	return usesFirstResponse
		? { due: ticket.sla_first_response_due, completedAt: ticket.sla_first_response_at, target: "Response" }
		: { due: ticket.sla_resolution_due, completedAt: ticket.sla_resolved_at, target: "Resolution" };
}

interface SortButtonProps {
	field: TicketSortField;
	label: string;
	srLabel?: string;
	sort: QueueTableProps["sort"];
	onSort: (field: TicketSortField) => void;
}

function SortButton({ field, label, srLabel, sort, onSort }: SortButtonProps) {
	const dir = sortDirFor(field, sort);
	const Icon = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ArrowUpDown;
	const name = srLabel ?? label;
	return (
		<button
			type="button"
			className="inline-flex items-center gap-1 hover:text-foreground"
			onClick={() => onSort(field)}
			aria-label={`Sort by ${name}${dir ? `, ${dir === "asc" ? "ascending" : "descending"}` : ""}`}
		>
			{srLabel ? (
				<>
					<span aria-hidden="true">{label}</span>
					<span className="sr-only">{srLabel}</span>
				</>
			) : (
				label
			)}
			<Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
		</button>
	);
}

export function QueueList({
	tickets,
	sort,
	onSort,
	activeIndex,
	setActiveIndex,
	onOpen,
	members,
	currentUserId,
	onAssignToMe,
	onSetStatus,
	pendingId,
}: QueueTableProps) {
	const now = useNow(30000);

	return (
		<div className="min-w-0">
			<div
				role="presentation"
				className={cn(
					"hidden h-9 items-center gap-3 border-b-2 border-border px-4 text-xs font-semibold text-subtle @min-[560px]:grid sticky top-0 z-10 bg-raised",
					ROW_GRID,
				)}
			>
				<SortButton field="severity" label="P" srLabel="Priority" sort={sort} onSort={onSort} />
				<SortButton field="ticket_number" label="Key" sort={sort} onSort={onSort} />
				<span>Summary</span>
				<span className={HIDE_860}>Customer</span>
				<span className={HIDE_1240}>Category</span>
				<SortButton field="status" label="Status" sort={sort} onSort={onSort} />
				<span className={HIDE_860}>AI confidence</span>
				<span>SLA</span>
				<span className="sr-only">Assignee</span>
				<span className={cn(HIDE_1100, "text-right")}>
					<SortButton field="updated_at" label="Updated" sort={sort} onSort={onSort} />
				</span>
				<span className="sr-only">Actions</span>
			</div>

			<ul className="divide-y divide-border">
				{tickets.map((ticket, index) => {
					const sla = slaTarget(ticket);
					const pct = confidencePercent(ticket.ai_confidence);
					const assigneeName = memberName(ticket.assigned_agent, members, currentUserId);
					const isMine = ticket.assigned_agent === currentUserId;
					const isPending = pendingId === ticket.id;
					const isSelected = index === activeIndex;
					const minutesAgo = (now.getTime() - new Date(ticket.updated_at).getTime()) / 60000;

					const openThis = () => {
						setActiveIndex(index);
						onOpen(ticket.id);
					};

					const actionsMenu = (
						<DropdownMenu>
							<Tooltip content="More actions">
								<DropdownMenuTrigger asChild>
									<Button
										variant="subtle"
										size="icon-sm"
										aria-label={`Actions for ${ticket.ticket_number}`}
										onClick={(e) => e.stopPropagation()}
									>
										<MoreHorizontal aria-hidden="true" />
									</Button>
								</DropdownMenuTrigger>
							</Tooltip>
							<DropdownMenuContent align="end">
								<DropdownMenuItem disabled={isPending} onClick={() => onOpen(ticket.id)}>
									Open ticket
								</DropdownMenuItem>
								{!isMine && (
									<DropdownMenuItem disabled={isPending} onClick={() => onAssignToMe(ticket.id)}>
										Assign to me
									</DropdownMenuItem>
								)}
								{ticket.status === "New" && (
									<DropdownMenuItem disabled={isPending} onClick={() => onSetStatus(ticket.id, "In Progress")}>
										Mark In Progress
									</DropdownMenuItem>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					);

					const assigneeTooltip = ticket.assigned_agent ? (assigneeName ?? "Unknown user") : "Unassigned";

					return (
						<li
							key={ticket.id}
							data-selected={isSelected}
							className="group relative cursor-pointer transition-colors duration-100 hover:bg-fill data-[selected=true]:bg-selected data-[selected=true]:shadow-[inset_2px_0_0_hsl(var(--primary))] group-focus-visible/list:data-[selected=true]:shadow-[inset_3px_0_0_hsl(var(--primary)),inset_0_0_0_1px_hsl(var(--primary))]"
							onClick={openThis}
						>
							{/* < 560px: two-line card */}
							<div className="flex flex-col gap-1 px-4 py-2.5 @min-[560px]:hidden">
								<div className="flex items-center gap-2">
									<PriorityIcon severity={ticket.severity} />
									<span className="font-mono text-xs text-subtle whitespace-nowrap">{ticket.ticket_number}</span>
									<StatusLozenge status={ticket.status} />
									{sla ? (
										<SlaBadge className="ml-auto" due={sla.due} completedAt={sla.completedAt} now={now} target={sla.target} />
									) : (
										<span className="ml-auto text-xs text-subtlest">—</span>
									)}
								</div>
								<button
									type="button"
									className="block w-full min-w-0 truncate text-left text-sm font-medium text-foreground hover:underline"
									onClick={(e) => {
										e.stopPropagation();
										openThis();
									}}
								>
									{ticket.subject}
								</button>
							</div>

							{/* >= 560px: single-line grid row */}
							<div className={cn("hidden h-11 items-center gap-3 px-4 @min-[560px]:grid", ROW_GRID)}>
								<PriorityIcon severity={ticket.severity} />

								<span className="font-mono text-xs text-subtle whitespace-nowrap">{ticket.ticket_number}</span>

								<button
									type="button"
									className="flex min-w-0 items-center gap-2 text-left"
									onClick={(e) => {
										e.stopPropagation();
										openThis();
									}}
								>
									<span className="min-w-0 truncate text-sm font-medium text-foreground hover:underline">
										{ticket.subject}
									</span>
									{ticket.is_flagged_for_review && (
										<Lozenge appearance="moved" className="shrink-0">
											Review
										</Lozenge>
									)}
								</button>

								<span className={CUSTOMER_CELL} title={ticket.accounts?.company_name ?? undefined}>
									{ticket.contacts?.name || ticket.contacts?.email || "—"}
								</span>

								<span className={CATEGORY_CELL}>{ticket.category ?? "—"}</span>

								<span className="min-w-0">
									<StatusLozenge status={ticket.status} />
								</span>

								<span className={HIDE_860}>
									<ConfidenceMeter value={pct} size="sm" />
								</span>

								{sla ? (
									<SlaBadge due={sla.due} completedAt={sla.completedAt} now={now} target={sla.target} />
								) : (
									<span className="text-xs text-subtlest">—</span>
								)}

								<Tooltip content={assigneeTooltip}>
									<span className="inline-flex">
										<Avatar size="xs" name={ticket.assigned_agent ? assigneeName : null} />
									</span>
								</Tooltip>

								<time
									dateTime={ticket.updated_at}
									title={formatDateTime(ticket.updated_at)}
									className={cn(HIDE_1100, "text-right text-xs text-subtlest font-mono tabular")}
								>
									{formatCompactDuration(minutesAgo)}
								</time>

								{actionsMenu}
							</div>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
