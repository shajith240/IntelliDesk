"use client";

// Work queue view: filterable ticket list with keyboard navigation (j/k), assign/status actions, pagination.
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { CheckCircle2, ChevronLeft, ChevronRight, Inbox, SearchX, ShieldCheck, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiSend, ApiRequestError } from "@/lib/api-client";
import { useTickets, useTeam, useWorkload, useRefreshAll } from "@/hooks/use-api";
import { useTicketParam } from "@/hooks/use-ticket-param";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SectionMessage } from "@/components/ui/section-message";
import { useAssignTicket } from "@/features/ticket-workspace/components/assign-menu";
import { QueueFilters } from "./queue-filters";
import { QueueList } from "./queue-list";
import { QueueSkeleton, QueueRowsSkeleton } from "./queue-skeleton";
import { useQueueState, type QueueScope } from "@/features/queue/hooks/use-queue-state";
import type { TicketStatus } from "@/types";
import { ticketsKey } from "@/hooks/use-api";

export { QueueSkeleton };

export interface WorkQueueProps {
	scope: QueueScope;
	title?: string;
	pageSize?: number;
	className?: string;
}

export function WorkQueue({ scope, title, pageSize = 25, className }: WorkQueueProps) {
	const headingId = "work-queue-heading";
	const state = useQueueState(scope, pageSize);
	const { data, error, isLoading, isValidating, mutate } = useTickets(state.query);
	const { data: teamData } = useTeam();
	const { data: session } = useSession();
	const { openTicket } = useTicketParam();
	const refreshAll = useRefreshAll();
	const { toast } = useToast();
	const isAdmin = session?.user.role === "admin";
	const { data: workload } = useWorkload(isAdmin);
	const { assign, pendingTicketId } = useAssignTicket();

	const [pendingId, setPendingId] = useState<string | null>(null);
	const [activeState, setActiveState] = useState<{ key: string; index: number }>({
		key: ticketsKey(state.query),
		index: 0,
	});
	const currentKey = ticketsKey(state.query);
	const activeIndex = activeState.key === currentKey ? activeState.index : 0;
	const setActiveIndex = (index: number) => setActiveState({ key: currentKey, index });

	const sectionRef = useRef<HTMLElement | null>(null);
	const members = teamData?.members ?? [];
	const currentUserId = session?.user.id;
	const currentUserRole = session?.user.role;

	const tickets = data?.tickets ?? [];

	const resultText = data
		? data.total === 0
			? "No results"
			: `${(data.page - 1) * data.limit + 1}–${Math.min(data.page * data.limit, data.total)} of ${data.total}`
		: "";

	async function patch(id: string, body: Record<string, unknown>, successTitle: string) {
		setPendingId(id);
		try {
			await apiSend(`/api/tickets/${id}`, "PATCH", body);
			toast({ tone: "success", title: successTitle });
			await refreshAll();
		} catch (err) {
			if (err instanceof ApiRequestError) {
				toast({ tone: "error", title: "Couldn't update ticket", description: err.message });
			} else {
				toast({ tone: "error", title: "Couldn't update ticket", description: "Something went wrong." });
			}
		} finally {
			setPendingId(null);
		}
	}

	function handleAssign(id: string, assigneeId: string | null, assigneeName: string | null) {
		void assign(id, assigneeId, assigneeName);
	}

	function handleSetStatus(id: string, status: TicketStatus) {
		const ticket = tickets.find((t) => t.id === id);
		void patch(id, { status }, `${ticket?.ticket_number ?? "Ticket"} moved to ${status}`);
	}

	function moveActive(delta: number) {
		if (tickets.length === 0) return;
		const next = Math.min(Math.max(activeIndex + delta, 0), tickets.length - 1);
		setActiveIndex(next);
		requestAnimationFrame(() => {
			sectionRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: "nearest" });
		});
	}

	function handleKeyDown(e: KeyboardEvent<HTMLElement>) {
		const target = e.target as HTMLElement;
		if (
			target.tagName === "INPUT" ||
			target.tagName === "TEXTAREA" ||
			target.closest('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]')
		) {
			return;
		}
		// J/K and arrows move the active row; arrows' default is prevented because it would also scroll the page.
		if (e.key === "j" || e.key === "ArrowDown") {
			if (e.key === "ArrowDown") e.preventDefault();
			moveActive(1);
		} else if (e.key === "k" || e.key === "ArrowUp") {
			if (e.key === "ArrowUp") e.preventDefault();
			moveActive(-1);
		} else if (e.key === "Enter") {
			const ticket = tickets[activeIndex];
			if (ticket) openTicket(ticket.id);
		}
	}

	const emptyContent = useMemo(() => {
		if (state.activeFilterCount > 0 || state.filters.q) {
			return (
				<EmptyState
					icon={SearchX}
					title="No tickets match these filters"
					description="Try removing a filter or searching for a ticket key."
					action={<Button onClick={state.clearFilters}>Clear filters</Button>}
				/>
			);
		}
		if (scope === "incoming") {
			return (
				<EmptyState
					icon={CheckCircle2}
					title="Incoming queue is clear"
					description="New tickets land here as emails are processed."
				/>
			);
		}
		if (scope === "mine") {
			return (
				<EmptyState
					icon={UserCheck}
					title="Nothing assigned to you"
					description="Tickets an admin assigns to you will show up here."
				/>
			);
		}
		if (scope === "review") {
			return (
				<EmptyState
					icon={ShieldCheck}
					title="Nothing waiting for review"
					description="Tickets the AI flags for a human land here, unassigned, until someone picks them up."
				/>
			);
		}
		return (
			<EmptyState
				icon={Inbox}
				title="No open tickets"
				description="Tickets are created automatically when customer emails arrive in a connected mailbox."
				action={
					isAdmin ? (
						<Button asChild variant="primary">
							<Link href="/dashboard/settings">Connect a mailbox</Link>
						</Button>
					) : undefined
				}
			/>
		);
	}, [isAdmin, scope, state.activeFilterCount, state.clearFilters, state.filters.q]);

	return (
		<section
			aria-labelledby={headingId}
			className={cn("@container min-w-0 rounded-lg border border-border bg-raised", className)}
			ref={sectionRef}
			onKeyDown={handleKeyDown}
		>
			<div className="flex flex-col gap-3 border-b border-border px-4 py-3">
				{title ? (
					<h2 id={headingId} className="text-base font-semibold">
						{title}
					</h2>
				) : (
					<h2 id={headingId} className="sr-only">
						Tickets
					</h2>
				)}
				<QueueFilters state={state} resultText={resultText} isRefreshing={isValidating && !isLoading} />
			</div>

			<p className="sr-only" aria-live="polite">
				{data ? `${data.total} tickets` : ""}
			</p>

			{error && data && (
				<div className="px-4 pt-3">
					<SectionMessage
						appearance="warning"
						title="Couldn't refresh the queue"
						actions={
							<Button variant="link" onClick={() => mutate()}>
								Retry
							</Button>
						}
					>
						Showing the last loaded results. {error.message}
					</SectionMessage>
				</div>
			)}

			{isLoading && !data ? (
				<QueueRowsSkeleton />
			) : error && !data ? (
				<ErrorState message={error.message} onRetry={() => mutate()} retrying={isValidating} />
			) : tickets.length === 0 ? (
				emptyContent
			) : (
				<div tabIndex={0} className="group/list min-w-0 focus-visible:outline-none" aria-label="Ticket list. Use J and K or arrow keys to move, Enter to open.">
					<QueueList
						tickets={tickets}
						sort={state.sort}
						onSort={state.setSort}
						activeIndex={activeIndex}
						setActiveIndex={setActiveIndex}
						onOpen={openTicket}
						members={members}
						currentUserId={currentUserId}
						currentUserRole={currentUserRole}
						isAdmin={isAdmin}
						candidates={workload?.candidates ?? []}
						onAssign={handleAssign}
						onSetStatus={handleSetStatus}
						pendingId={pendingId}
						assigningId={pendingTicketId}
					/>
				</div>
			)}

			{data && data.total_pages > 1 && (
				<nav aria-label="Pagination">
					<div className="flex items-center justify-between border-t border-border px-4 py-2 text-sm">
						<span>
							Page {data.page} of {data.total_pages}
						</span>
						<div className="flex items-center gap-2">
							<Button
								size="sm"
								variant="default"
								aria-label="Previous page"
								disabled={data.page <= 1}
								onClick={() => state.setPage(data.page - 1)}
							>
								<ChevronLeft aria-hidden="true" />
							</Button>
							<Button
								size="sm"
								variant="default"
								aria-label="Next page"
								disabled={data.page >= data.total_pages}
								onClick={() => state.setPage(data.page + 1)}
							>
								<ChevronRight aria-hidden="true" />
							</Button>
						</div>
					</div>
				</nav>
			)}
		</section>
	);
}
