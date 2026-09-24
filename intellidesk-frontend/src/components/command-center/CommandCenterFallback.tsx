import { Skeleton } from "@/components/ui/skeleton";
import { QueueSkeleton } from "@/components/queue/QueueSkeleton";
import { MetricStripSkeleton } from "./MetricStrip";

/** Server-safe skeleton shown while CommandCenter (a client component) mounts. */
export function CommandCenterFallback() {
	return (
		<div className="pb-10">
			<div className="flex flex-col gap-3 px-4 pb-4 pt-5 sm:px-6 md:flex-row md:items-end md:justify-between">
				<div className="min-w-0 space-y-2">
					<Skeleton className="h-4 w-40" />
					<Skeleton className="h-7 w-64" />
					<Skeleton className="h-4 w-80" />
				</div>
				<Skeleton className="h-8 w-40" />
			</div>
			<div className="space-y-6 px-4 sm:px-6">
				<MetricStripSkeleton />
				<div className="grid grid-cols-[minmax(0,1fr)] gap-6">
					<div className="min-w-0">
						<QueueSkeleton />
					</div>
					<div className="space-y-6">
						<Skeleton className="h-48 w-full" />
						<Skeleton className="h-48 w-full" />
					</div>
				</div>
			</div>
		</div>
	);
}
