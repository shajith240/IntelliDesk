"use client";

// Data sync status indicator showing last refresh time and connection state.
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { useSyncSnapshot, deriveSyncState, REFRESH_INTERVAL_MS, type SyncState } from "@/lib/sync-status";
import { formatClock } from "@/lib/ticket-meta";
import { useNow } from "@/hooks/useNow";

const STATE_META: Record<SyncState, { dot: string; label: string }> = {
	synced: { dot: "bg-success", label: "Up to date" },
	stale: { dot: "bg-warning", label: "Data may be stale" },
	reconnecting: { dot: "bg-warning", label: "Reconnecting…" },
	offline: { dot: "bg-danger", label: "Offline" },
	connecting: { dot: "bg-border-bold", label: "Connecting…" },
};

export function SyncIndicator() {
	const snap = useSyncSnapshot();
	const now = useNow(5000);
	const state = deriveSyncState(snap, now.getTime());
	const meta = STATE_META[state];

	const lastUpdated = snap.lastSuccessAt
		? `Last updated ${formatClock(new Date(snap.lastSuccessAt))}`
		: "Not loaded yet";

	return (
		<>
			<Tooltip
				content={
					<div className="flex flex-col gap-0.5">
						<span>
							{lastUpdated} &middot; refreshes every {REFRESH_INTERVAL_MS / 1000}s
						</span>
						{snap.lastError && <span>Last error: {snap.lastError}</span>}
					</div>
				}
			>
				<button
					type="button"
					aria-label={`Data status: ${meta.label}`}
					className="inline-flex h-8 items-center gap-2 rounded-md px-2 text-xs font-medium text-subtle hover:bg-fill"
				>
					{state === "reconnecting" ? (
						<Spinner size="sm" />
					) : (
						<span className={cn("h-2 w-2 rounded-full", meta.dot)} aria-hidden="true" />
					)}
					<span className="hidden md:inline">{meta.label}</span>
				</button>
			</Tooltip>
			<span className="sr-only" aria-live="polite">
				{meta.label}
			</span>
		</>
	);
}
