// SWR hooks for fetching dashboard stats, ticket lists, single tickets, and team info.
"use client";

import useSWR, { useSWRConfig } from "swr";
import { useCallback } from "react";
import { apiGet, buildQuery } from "@/lib/api-client";
import { REFRESH_INTERVAL_MS } from "@/lib/sync-status";
import type {
	DashboardResponse,
	TeamResponse,
	TicketDetailResponse,
	TicketListQuery,
	TicketListResponse,
} from "@/types/api";

const liveOptions = {
	refreshInterval: REFRESH_INTERVAL_MS,
	revalidateOnFocus: true,
	keepPreviousData: true,
} as const;

export function useDashboard() {
	return useSWR<DashboardResponse>("/api/dashboard", apiGet, liveOptions);
}

export function ticketsKey(query: TicketListQuery): string {
	return `/api/tickets${buildQuery({
		status: query.statuses?.length ? query.statuses.join(",") : query.status,
		severity: query.severities?.length ? query.severities.join(",") : query.severity,
		category: query.category,
		search: query.search?.trim(),
		assigned: query.assigned,
		page: query.page,
		limit: query.limit,
		sort: query.sort,
		order: query.order,
	})}`;
}

export function useTickets(query: TicketListQuery) {
	return useSWR<TicketListResponse>(ticketsKey(query), apiGet, liveOptions);
}

/** Pass null to skip fetching (e.g. no ticket selected). */
export function useTicket(id: string | null) {
	return useSWR<TicketDetailResponse>(id ? `/api/tickets/${id}` : null, apiGet, {
		revalidateOnFocus: true,
	});
}

export function useTeam() {
	return useSWR<TeamResponse>("/api/team", apiGet, { revalidateOnFocus: false });
}

/** Revalidates every cached /api/* request. Use after mutations and for the Refresh button. */
export function useRefreshAll() {
	const { mutate } = useSWRConfig();
	return useCallback(
		() => mutate((key) => typeof key === "string" && key.startsWith("/api/")),
		[mutate],
	);
}
