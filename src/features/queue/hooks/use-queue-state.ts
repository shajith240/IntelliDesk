"use client";

// Queue state hook: manages filters (status, priority, category, search), sort, and page via URL params; debounces search.
import { useCallback, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { isCategory, isSeverity, isStatus } from "@/lib/ticket-meta";
import type { TicketListQueryWithView } from "@/hooks/use-api";
import type { EmailCategory, Severity, TicketStatus } from "@/types";
import type { TicketSortField } from "@/types/api";

export type QueueScope = "all" | "open" | "incoming" | "mine" | "review";

interface QueueFiltersState {
	q: string;
	statuses: TicketStatus[];
	priorities: Severity[];
	category: EmailCategory | null;
}

interface QueueSortState {
	field: TicketSortField;
	order: "asc" | "desc";
}

export interface UseQueueStateResult {
	query: TicketListQueryWithView;
	filters: QueueFiltersState;
	sort: QueueSortState;
	page: number;
	setSearch: (q: string) => void;
	toggleStatus: (status: TicketStatus) => void;
	togglePriority: (priority: Severity) => void;
	setCategory: (category: EmailCategory | null) => void;
	setSort: (field: TicketSortField) => void;
	setPage: (page: number) => void;
	clearFilters: () => void;
	activeFilterCount: number;
	statusLocked: boolean;
	/** Bumped every time filters are cleared; consumers can key remountable inputs on it. */
	resetToken: number;
}

function scopeDefaultStatuses(scope: QueueScope): TicketStatus[] {
	if (scope === "incoming") return ["New"];
	if (scope === "open" || scope === "mine") return ["New", "In Progress"];
	// "review" locks its own status filter server-side (view=review); no client default needed.
	return [];
}

function defaultSortField(field: TicketSortField): "asc" | "desc" {
	return field === "ticket_number" ? "asc" : "desc";
}

/** Reads/writes queue filter, sort and page state to and from the URL. */
export function useQueueState(scope: QueueScope, pageSize = 25): UseQueueStateResult {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const rawStatusParam = searchParams.get("status");
	const statusLocked = scope === "incoming" || scope === "review";

	const statuses = useMemo<TicketStatus[]>(() => {
		if (scope === "incoming") return ["New"];
		// The review view (view=review) already restricts to open, unassigned, flagged tickets server-side.
		if (scope === "review") return [];
		if (rawStatusParam === null) return scopeDefaultStatuses(scope);
		if (rawStatusParam === "all" || rawStatusParam === "") return [];
		return rawStatusParam
			.split(",")
			.map((s) => s.trim())
			.filter(isStatus);
	}, [rawStatusParam, scope]);

	const priorities = useMemo<Severity[]>(() => {
		const raw = searchParams.get("priority");
		if (!raw) return [];
		return raw
			.split(",")
			.map((s) => s.trim())
			.filter(isSeverity);
	}, [searchParams]);

	const category = useMemo<EmailCategory | null>(() => {
		const raw = searchParams.get("category");
		return isCategory(raw) ? raw : null;
	}, [searchParams]);

	const q = searchParams.get("q")?.trim() ?? "";

	const sortField = useMemo<TicketSortField>(() => {
		const raw = searchParams.get("sort");
		const valid: TicketSortField[] = [
			"created_at",
			"updated_at",
			"severity",
			"status",
			"ticket_number",
		];
		return (valid as string[]).includes(raw ?? "") ? (raw as TicketSortField) : "updated_at";
	}, [searchParams]);

	const sortOrder = useMemo<"asc" | "desc">(() => {
		const raw = searchParams.get("order");
		return raw === "asc" || raw === "desc" ? raw : "desc";
	}, [searchParams]);

	const page = useMemo(() => {
		const raw = Number.parseInt(searchParams.get("page") ?? "1", 10);
		return Number.isFinite(raw) && raw >= 1 ? raw : 1;
	}, [searchParams]);

	const writeParams = useCallback(
		(updates: Record<string, string | null>, resetPage: boolean) => {
			const params = new URLSearchParams(searchParams.toString());
			for (const [key, value] of Object.entries(updates)) {
				if (value === null || value === "") params.delete(key);
				else params.set(key, value);
			}
			if (resetPage) params.delete("page");
			const qs = params.toString();
			router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
		},
		[pathname, router, searchParams],
	);

	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const setSearch = useCallback(
		(value: string) => {
			// Debounce search by 300ms to avoid hammering the API while typing.
			if (debounceRef.current) clearTimeout(debounceRef.current);
			debounceRef.current = setTimeout(() => {
				writeParams({ q: value.trim() || null }, true);
			}, 300);
		},
		[writeParams],
	);

	const toggleStatus = useCallback(
		(status: TicketStatus) => {
			if (statusLocked) return;
			const current = statuses.includes(status)
				? statuses.filter((s) => s !== status)
				: [...statuses, status];
			writeParams({ status: current.length ? current.join(",") : "all" }, true);
		},
		[statusLocked, statuses, writeParams],
	);

	const togglePriority = useCallback(
		(priority: Severity) => {
			const current = priorities.includes(priority)
				? priorities.filter((p) => p !== priority)
				: [...priorities, priority];
			writeParams({ priority: current.length ? current.join(",") : null }, true);
		},
		[priorities, writeParams],
	);

	const setCategoryValue = useCallback(
		(value: EmailCategory | null) => {
			writeParams({ category: value }, true);
		},
		[writeParams],
	);

	const setSort = useCallback(
		(field: TicketSortField) => {
			const nextOrder = field === sortField ? (sortOrder === "asc" ? "desc" : "asc") : defaultSortField(field);
			writeParams({ sort: field, order: nextOrder }, true);
		},
		[sortField, sortOrder, writeParams],
	);

	const setPage = useCallback(
		(value: number) => {
			writeParams({ page: value > 1 ? String(value) : null }, false);
		},
		[writeParams],
	);

	const [resetToken, setResetToken] = useState(0);
	const clearFilters = useCallback(() => {
		writeParams(
			{
				q: null,
				status: statusLocked ? null : scopeDefaultStatuses(scope).length ? "all" : null,
				priority: null,
				category: null,
			},
			true,
		);
		setResetToken((n) => n + 1);
	}, [scope, statusLocked, writeParams]);

	const activeFilterCount = useMemo(() => {
		let count = 0;
		const defaults = scopeDefaultStatuses(scope);
		const statusIsDefault =
			statuses.length === defaults.length && statuses.every((s) => defaults.includes(s));
		if (!statusLocked && !statusIsDefault) count += 1;
		if (priorities.length > 0) count += 1;
		if (category) count += 1;
		return count;
	}, [category, priorities.length, scope, statusLocked, statuses]);

	const query: TicketListQueryWithView = useMemo(
		() => ({
			statuses: statuses.length ? statuses : undefined,
			severities: priorities.length ? priorities : undefined,
			category: category ?? undefined,
			search: q || undefined,
			assigned: scope === "mine" ? "me" : undefined,
			view: scope === "review" ? "review" : undefined,
			page,
			limit: pageSize,
			sort: sortField,
			order: sortOrder,
		}),
		[category, page, pageSize, priorities, q, scope, sortField, sortOrder, statuses],
	);

	return {
		query,
		filters: { q, statuses, priorities, category },
		sort: { field: sortField, order: sortOrder },
		page,
		setSearch,
		toggleStatus,
		togglePriority,
		setCategory: setCategoryValue,
		setSort,
		setPage,
		clearFilters,
		activeFilterCount,
		statusLocked,
		resetToken,
	};
}
