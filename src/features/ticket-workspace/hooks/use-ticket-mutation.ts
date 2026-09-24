"use client";

// PATCH /api/tickets/[id] helper for the details column and status menu: toasts the result, then refetches.
import { useCallback, useState } from "react";
import { apiSend, ApiRequestError } from "@/lib/api-client";
import { useRefreshAll } from "@/hooks/use-api";
import { useToast } from "@/components/ui/toast";
import type { TicketPatchBody } from "@/types/api";

/** Shared PATCH /api/tickets/[id] helper for the details column and header status menu. */
export function useTicketMutation(ticketId: string) {
	const [pendingField, setPendingField] = useState<keyof TicketPatchBody | null>(null);
	const refreshAll = useRefreshAll();
	const { toast } = useToast();

	const update = useCallback(
		async (body: TicketPatchBody, successMessage: string) => {
			const field = (Object.keys(body)[0] as keyof TicketPatchBody) ?? null;
			setPendingField(field);
			try {
				await apiSend(`/api/tickets/${ticketId}`, "PATCH", body);
				await refreshAll();
				toast({ tone: "success", title: successMessage });
			} catch (error) {
				const message =
					error instanceof ApiRequestError ? error.message : "Update failed. Try again.";
				toast({ tone: "error", title: "Update failed", description: message });
			} finally {
				setPendingField(null);
			}
		},
		[ticketId, refreshAll, toast],
	);

	return { pendingField, update };
}
