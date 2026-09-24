// Skeleton loading placeholders for queue list: two-line cards on mobile, single-line grid on desktop.
import { cn } from "@/lib/utils";
import { ROW_GRID, HIDE_860, HIDE_1100, HIDE_1240 } from "./grid";
import { Skeleton } from "@/components/ui/skeleton";



/** 8 placeholder rows, same two-line-card / single-line-grid geometry as the real rows. */
export function QueueRowsSkeleton() {
	return (
		<ul className="divide-y divide-border" aria-hidden="true">
			{Array.from({ length: 8 }, (_, i) => (
				<li key={i}>
					{/* < 560px: two-line card */}
					<div className="flex flex-col gap-1 px-4 py-2.5 @min-[560px]:hidden">
						<div className="flex items-center gap-2">
							<Skeleton className="h-4 w-4 rounded-sm" />
							<Skeleton className="h-3 w-12" />
							<Skeleton className="h-5 w-16 rounded-sm" />
							<Skeleton className="ml-auto h-5 w-[68px] rounded-sm" />
						</div>
						<Skeleton className="h-4 w-3/4" />
					</div>

					{/* >= 560px: single-line grid row */}
					<div className={cn("hidden h-11 items-center gap-3 px-4 @min-[560px]:grid", ROW_GRID)}>
						<Skeleton className="h-4 w-4 rounded-sm" />
						<Skeleton className="h-3 w-14" />
						<Skeleton className="h-4 max-w-[320px]" />
						<Skeleton className={cn(HIDE_860, "h-3 w-24")} />
						<Skeleton className={cn(HIDE_1240, "h-3 w-20")} />
						<Skeleton className="h-5 w-16 rounded-sm" />
						<Skeleton className={cn(HIDE_860, "h-3 w-12")} />
						<Skeleton className="h-5 w-[68px] rounded-sm" />
						<Skeleton className="h-5 w-5 rounded-full" />
						<Skeleton className={cn(HIDE_1100, "h-3 w-8 ml-auto")} />
						<Skeleton className="h-7 w-7 rounded-md" />
					</div>
				</li>
			))}
		</ul>
	);
}

/** Server-safe loading placeholder for WorkQueue, used as a Suspense fallback. */
export function QueueSkeleton() {
	return (
		<div className="@container rounded-lg border border-border bg-raised">
			<div className="flex flex-col gap-3 border-b border-border px-4 py-3">
				<Skeleton className="h-4 w-40" />
				<div className="flex flex-wrap items-center gap-2">
					<Skeleton className="h-8 w-full @min-[560px]:w-56" />
					<Skeleton className="h-8 w-24" />
					<Skeleton className="h-8 w-24" />
					<Skeleton className="h-8 w-28" />
				</div>
			</div>
			<QueueRowsSkeleton />
		</div>
	);
}
