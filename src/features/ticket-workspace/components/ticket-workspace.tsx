"use client";

// Renders a ticket in a right-side drawer; handles loading, errors, and unsaved edits.
import { useCallback, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { Tooltip } from "@/components/ui/tooltip";
import { useTicket } from "@/hooks/use-api";
import { useTicketParam } from "@/hooks/use-ticket-param";
import { ApiRequestError } from "@/lib/api-client";
import { WorkspaceView } from "./workspace-view";

export function TicketWorkspace() {
	const { ticketId, closeTicket, openTicket } = useTicketParam();
	const { data, error, isLoading, mutate } = useTicket(ticketId);
	const [dirty, setDirty] = useState(false);

	const handleDirtyChange = useCallback((next: boolean) => setDirty(next), []);

	const handleOpenChange = (open: boolean) => {
		if (open) return;
		if (dirty && !window.confirm("Close this ticket? Your reply edits stay saved on this device.")) {
			return;
		}
		closeTicket();
	};

	const title = data ? `${data.ticket.ticket_number}: ${data.ticket.subject}` : "Ticket";

	return (
		<Sheet open={!!ticketId} onOpenChange={handleOpenChange}>
			<SheetContent
				side="right"
				title={title}
				hideTitle
				className="w-full p-0 sm:max-w-none md:w-[min(1240px,calc(100vw-48px))]"
			>
				{!data && isLoading && <WorkspaceSkeleton />}
				{!data && !isLoading && error && (
					<div className="flex h-full flex-col">
						<header className="flex h-14 shrink-0 items-center justify-end border-b border-border px-3 sm:px-4">
							<Tooltip content="Close" shortcut="Esc">
								<Button variant="subtle" size="icon" aria-label="Close ticket" onClick={closeTicket}>
									<X aria-hidden="true" />
								</Button>
							</Tooltip>
						</header>
						<div className="flex flex-1 items-center justify-center">
							{error instanceof ApiRequestError && error.status === 404 ? (
								<ErrorState
									size="md"
									title="Ticket not found"
									message="It may have been deleted or belongs to another workspace."
								/>
							) : (
								<ErrorState
									size="md"
									message={error instanceof Error ? error.message : "Failed to load ticket."}
									onRetry={() => void mutate()}
								/>
							)}
						</div>
					</div>
				)}
				{data && (
					<WorkspaceView
						detail={data}
						onRefresh={mutate}
						onOpenTicket={openTicket}
						onClose={closeTicket}
						onDirtyChange={handleDirtyChange}
					/>
				)}
			</SheetContent>
		</Sheet>
	);
}

function WorkspaceSkeleton() {
	return (
		<div className="flex h-full flex-col">
			<div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
				<Skeleton className="h-4 w-40" />
				<div className="ml-auto flex items-center gap-2">
					<Skeleton className="h-8 w-8 rounded-md" />
					<Skeleton className="h-8 w-8 rounded-md" />
					<Skeleton className="h-8 w-8 rounded-md" />
				</div>
			</div>
			<div className="grid min-h-0 flex-1 grid-cols-1 bg-background md:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
				<div className="mx-auto w-full max-w-[824px] space-y-4 px-4 py-6 sm:px-8">
					<Skeleton className="h-7 w-3/4" />
					<Skeleton className="h-4 w-1/2" />
					<Skeleton className="h-28 w-full rounded-lg" />
					<Skeleton className="h-4 w-28" />
					<Skeleton className="h-40 w-full rounded-lg" />
				</div>
				<div className="hidden space-y-4 border-l border-border bg-raised px-4 py-4 md:block">
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-5/6" />
					<Skeleton className="h-4 w-4/6" />
					<Skeleton className="h-4 w-20" />
					<Skeleton className="h-10 w-full" />
				</div>
			</div>
		</div>
	);
}
