"use client";

// Header with ticket breadcrumb, status selector, copy-link button, and close button.
import { ChevronDown, Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusLozenge } from "@/components/ui/lozenge";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STATUSES } from "@/lib/ticket-meta";
import { useCanWorkTicket } from "@/features/ticket-workspace/hooks/use-can-work-ticket";
import { useTicketMutation } from "@/features/ticket-workspace/hooks/use-ticket-mutation";
import type { TicketDetail } from "@/types/api";
import type { TicketStatus } from "@/types";

interface WorkspaceHeaderProps {
	ticket: TicketDetail;
	/** Valid next statuses from the database workflow (ticket_status_transitions). */
	allowedStatuses: TicketStatus[];
	onClose: () => void;
}

export function WorkspaceHeader({ ticket, allowedStatuses, onClose }: WorkspaceHeaderProps) {
	const { toast } = useToast();
	const canWork = useCanWorkTicket(ticket);

	const handleCopyLink = async () => {
		try {
			await navigator.clipboard.writeText(window.location.href);
			toast({ tone: "success", title: "Link copied" });
		} catch {
			toast({ tone: "error", title: "Couldn't copy link" });
		}
	};

	return (
		<header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-raised px-3 sm:px-4">
			<nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm text-subtle">
				<span>Queue /</span>
				<span className="truncate font-mono text-foreground">{ticket.ticket_number}</span>
			</nav>

			<div className="ml-auto flex items-center gap-1">
				<StatusMenu ticket={ticket} allowedStatuses={allowedStatuses} canWork={canWork} />

				<Tooltip content="Copy link">
					<Button variant="subtle" size="icon" aria-label="Copy link" onClick={() => void handleCopyLink()}>
						<Link2 aria-hidden="true" />
					</Button>
				</Tooltip>

				<Tooltip content="Close" shortcut="Esc">
					<Button variant="subtle" size="icon" aria-label="Close ticket" onClick={onClose}>
						<X aria-hidden="true" />
					</Button>
				</Tooltip>
			</div>
		</header>
	);
}

function StatusMenu({
	ticket,
	allowedStatuses,
	canWork,
}: {
	ticket: TicketDetail;
	allowedStatuses: TicketStatus[];
	canWork: boolean;
}) {
	const { pendingField, update } = useTicketMutation(ticket.id);
	const loading = pendingField === "status";

	const handleSelect = (status: string) => {
		if (!isTicketStatus(status) || status === ticket.status) return;
		void update({ status }, `${ticket.ticket_number} moved to ${status}`);
	};

	// Only moves the workflow allows, in the usual order; Closed tickets have none.
	const options = STATUSES.filter((status) => status === ticket.status || allowedStatuses.includes(status));

	if (!canWork || options.length <= 1) {
		return (
			<span className="mr-1 inline-flex h-8 items-center pl-2">
				<StatusLozenge status={ticket.status} />
			</span>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="default"
					size="md"
					className="mr-1 gap-2 pl-2"
					loading={loading}
					aria-label={`Status: ${ticket.status}. Change status`}
				>
					{!loading && <StatusLozenge status={ticket.status} />}
					<span className="hidden text-subtle sm:inline">Change status</span>
					<ChevronDown aria-hidden="true" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuRadioGroup value={ticket.status} onValueChange={handleSelect}>
					{options.map((status) => (
						<DropdownMenuRadioItem key={status} value={status}>
							<StatusLozenge status={status} />
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function isTicketStatus(value: string): value is TicketStatus {
	return (STATUSES as string[]).includes(value);
}
