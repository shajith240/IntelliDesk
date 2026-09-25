"use client";

// Shared assignment UI (admins only): a radio list of candidates from useWorkload, used both as
// the ticket sidebar's Assign dropdown and as the queue row's "Assign to…" submenu.
import { useCallback, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Lozenge } from "@/components/ui/lozenge";
import { DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import { useRefreshAll } from "@/hooks/use-api";
import { apiSend, ApiRequestError } from "@/lib/api-client";
import type { AssigneeCandidate } from "@/types/api";

const UNASSIGNED_VALUE = "__unassigned__";

/** POST /api/tickets/[id]/assign, with the toast + refresh every call site needs. */
export function useAssignTicket() {
	const { toast } = useToast();
	const refreshAll = useRefreshAll();
	const [pendingTicketId, setPendingTicketId] = useState<string | null>(null);

	const assign = useCallback(
		async (ticketId: string, assigneeId: string | null, assigneeName: string | null) => {
			setPendingTicketId(ticketId);
			try {
				await apiSend(`/api/tickets/${ticketId}/assign`, "POST", { assignee_id: assigneeId });
				toast({ tone: "success", title: assigneeId ? `Assigned to ${assigneeName}` : "Unassigned" });
				await refreshAll();
			} catch (error) {
				toast({
					tone: "error",
					title: "Couldn't assign ticket",
					description: error instanceof ApiRequestError ? error.message : "Something went wrong.",
				});
			} finally {
				setPendingTicketId(null);
			}
		},
		[toast, refreshAll],
	);

	return { assign, pendingTicketId };
}

interface AssignMenuItemsProps {
	candidates: AssigneeCandidate[];
	currentAssigneeId: string | null;
	onSelect: (assigneeId: string | null, assigneeName: string | null) => void;
}

/** The radio group of candidates + "Unassign", meant to sit inside a DropdownMenuContent/SubContent. */
export function AssignMenuItems({ candidates, currentAssigneeId, onSelect }: AssignMenuItemsProps) {
	const handleChange = (value: string) => {
		if (value === UNASSIGNED_VALUE) {
			onSelect(null, null);
			return;
		}
		const candidate = candidates.find((c) => c.id === value);
		onSelect(value, candidate?.name ?? null);
	};

	return (
		<DropdownMenuRadioGroup value={currentAssigneeId ?? UNASSIGNED_VALUE} onValueChange={handleChange}>
			{candidates.map((candidate) => (
				<DropdownMenuRadioItem key={candidate.id} value={candidate.id} className="h-auto gap-2 py-1.5">
					<Avatar name={candidate.name} size="xs" />
					<span className="min-w-0 flex-1 truncate">{candidate.name}</span>
					<Lozenge appearance={candidate.is_available ? "success" : "default"}>
						{candidate.is_available ? "Available" : "Away"}
					</Lozenge>
					<span className="shrink-0 text-xs tabular text-subtlest">{candidate.open_tickets} open</span>
				</DropdownMenuRadioItem>
			))}
			{candidates.length > 0 && <DropdownMenuSeparator />}
			<DropdownMenuRadioItem value={UNASSIGNED_VALUE}>Unassign</DropdownMenuRadioItem>
		</DropdownMenuRadioGroup>
	);
}
