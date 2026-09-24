"use client";

// Queue filter UI: search, status, priority, category filters, sort dropdown; URL-synced via useQueueState.
import { useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { StatusLozenge } from "@/components/ui/lozenge";
import { PriorityIcon } from "@/components/ui/priority-icon";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuCheckboxItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { CATEGORIES, SEVERITIES, STATUSES } from "@/lib/ticket-meta";
import type { UseQueueStateResult } from "./useQueueState";
import type { TicketSortField } from "@/types/api";

const SORT_FIELDS: { field: TicketSortField; label: string }[] = [
	{ field: "severity", label: "Priority" },
	{ field: "ticket_number", label: "Key" },
	{ field: "status", label: "Status" },
	{ field: "updated_at", label: "Updated" },
];

export interface QueueFiltersProps {
	state: UseQueueStateResult;
	resultText: string;
	isRefreshing: boolean;
}

export function QueueFilters({ state, resultText, isRefreshing }: QueueFiltersProps) {
	const {
		filters,
		sort,
		setSort,
		statusLocked,
		toggleStatus,
		togglePriority,
		setCategory,
		setSearch,
		clearFilters,
		activeFilterCount,
		resetToken,
	} = state;

	return (
		<div className="flex flex-wrap items-center gap-2">
			<SearchBox key={resetToken} initialValue={filters.q} onSearch={setSearch} />

			{!statusLocked && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="default"
							className={cn(
								filters.statuses.length > 0 && "bg-selected text-selected-foreground hover:bg-selected",
							)}
						>
							Status
							{filters.statuses.length > 0 && <Badge tone="primary">{filters.statuses.length}</Badge>}
							<ChevronDown className="h-4 w-4" aria-hidden="true" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent>
						{STATUSES.map((status) => (
							<DropdownMenuCheckboxItem
								key={status}
								checked={filters.statuses.includes(status)}
								onSelect={(e) => e.preventDefault()}
								onCheckedChange={() => toggleStatus(status)}
							>
								<StatusLozenge status={status} />
							</DropdownMenuCheckboxItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			)}

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="default"
						className={cn(
							filters.priorities.length > 0 && "bg-selected text-selected-foreground hover:bg-selected",
						)}
					>
						Priority
						{filters.priorities.length > 0 && <Badge tone="primary">{filters.priorities.length}</Badge>}
						<ChevronDown className="h-4 w-4" aria-hidden="true" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent>
					{SEVERITIES.map((severity) => (
						<DropdownMenuCheckboxItem
							key={severity}
							checked={filters.priorities.includes(severity)}
							onSelect={(e) => e.preventDefault()}
							onCheckedChange={() => togglePriority(severity)}
						>
							<PriorityIcon severity={severity} showLabel />
						</DropdownMenuCheckboxItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="default"
						className={cn(filters.category && "bg-selected text-selected-foreground hover:bg-selected")}
					>
						Category
						{filters.category && <Badge tone="primary">1</Badge>}
						<ChevronDown className="h-4 w-4" aria-hidden="true" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuLabel>Category</DropdownMenuLabel>
					<DropdownMenuRadioGroup
						value={filters.category ?? "__all__"}
						onValueChange={(value) => setCategory(value === "__all__" ? null : (value as typeof filters.category))}
					>
						<DropdownMenuRadioItem value="__all__">All categories</DropdownMenuRadioItem>
						<DropdownMenuSeparator />
						{CATEGORIES.map((cat) => (
							<DropdownMenuRadioItem key={cat} value={cat}>
								{cat}
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>

			{activeFilterCount > 0 && (
				<Button variant="subtle" onClick={clearFilters}>
					Clear filters
				</Button>
			)}

			<div className="ml-auto flex items-center gap-2">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="default" className="@min-[560px]:hidden" aria-label="Sort tickets">
							Sort
							<ChevronDown className="h-4 w-4" aria-hidden="true" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuLabel>Sort by</DropdownMenuLabel>
						<DropdownMenuRadioGroup value={sort.field} onValueChange={(value) => setSort(value as TicketSortField)}>
							{SORT_FIELDS.map(({ field, label }) => (
								<DropdownMenuRadioItem key={field} value={field}>
									{label}
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuRadioGroup>
					</DropdownMenuContent>
				</DropdownMenu>

				<div className="flex items-center gap-2 text-xs text-subtlest">
					<span className="whitespace-nowrap">{resultText}</span>
					{isRefreshing && <Spinner size="sm" label="Refreshing" />}
				</div>
			</div>
		</div>
	);
}

interface SearchBoxProps {
	initialValue: string;
	onSearch: (value: string) => void;
}

/** Owns its own text state so typing feels instant; remount (via `key`) resets it. */
function SearchBox({ initialValue, onSearch }: SearchBoxProps) {
	const [value, setValue] = useState(initialValue);

	return (
		<div className="relative w-full @min-[560px]:w-56">
			<Search
				className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-subtlest"
				aria-hidden="true"
			/>
			<Input
				type="search"
				aria-label="Search tickets in this queue"
				placeholder="Search queue"
				className="pl-8"
				value={value}
				onChange={(e) => {
					setValue(e.target.value);
					onSearch(e.target.value);
				}}
			/>
		</div>
	);
}
