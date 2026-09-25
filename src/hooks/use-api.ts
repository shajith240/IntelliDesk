// SWR hooks for fetching dashboard stats, ticket lists, single tickets, and team info.
"use client";

import useSWR, { useSWRConfig } from "swr";
import { useCallback } from "react";
import { apiGet, buildQuery } from "@/lib/api-client";
import { REFRESH_INTERVAL_MS } from "@/lib/sync-status";
import type {
	DashboardResponse,
	MeResponse,
	TeamResponse,
	TicketDetailResponse,
	TicketListQuery,
	TicketListResponse,
	WorkloadResponse,
} from "@/types/api";

const liveOptions = {
	refreshInterval: REFRESH_INTERVAL_MS,
	revalidateOnFocus: true,
	keepPreviousData: true,
} as const;

/** Pass false to skip fetching (e.g. the sidebar badge isn't shown for this role). */
export function useDashboard(enabled = true) {
	return useSWR<DashboardResponse>(enabled ? "/api/dashboard" : null, apiGet, liveOptions);
}

/** GET /api/tickets accepts `view=review` in addition to the fields on TicketListQuery. */
export type TicketListQueryWithView = TicketListQuery & { view?: "review" };

export function ticketsKey(query: TicketListQueryWithView): string {
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
		view: query.view,
	})}`;
}

export function useTickets(query: TicketListQueryWithView) {
	return useSWR<TicketListResponse>(ticketsKey(query), apiGet, liveOptions);
}

/** Pass null to skip fetching (e.g. no ticket selected). */
export function useTicket(id: string | null) {
	return useSWR<TicketDetailResponse>(id ? `/api/tickets/${id}` : null, apiGet, {
		revalidateOnFocus: true,
	});
}

export interface UseTeamOptions {
	/** Admins only: also returns deactivated members. */
	includeInactive?: boolean;
}

export function useTeam(options: UseTeamOptions = {}) {
	const { includeInactive = false } = options;
	return useSWR<TeamResponse>(
		`/api/team${includeInactive ? "?include=inactive" : ""}`,
		apiGet,
		{ revalidateOnFocus: false },
	);
}

export function useMe() {
	return useSWR<MeResponse>("/api/me", apiGet, { revalidateOnFocus: true });
}

/** Assignee candidates for the admin assign menu. Pass false to skip fetching (non-admins). */
export function useWorkload(enabled: boolean) {
	return useSWR<WorkloadResponse>(enabled ? "/api/team/workload" : null, apiGet, {
		revalidateOnFocus: false,
	});
}

/** Revalidates every cached /api/* request. Use after mutations and for the Refresh button. */
export function useRefreshAll() {
	const { mutate } = useSWRConfig();
	return useCallback(
		() => mutate((key) => typeof key === "string" && key.startsWith("/api/")),
		[mutate],
	);
}
