// Analytics page: a live snapshot of the current queue. No history is stored, so there are no trends.
import { Suspense } from "react";
import { requirePageRole } from "@/server/auth/page-guard";
import { Analytics } from "@/features/analytics/components/analytics";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Analytics" };

function AnalyticsSkeleton() {
	return (
		<div className="pb-10">
			<div className="px-4 sm:px-6 space-y-3 pb-4">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-4 w-96" />
			</div>
			<div className="px-4 sm:px-6 pb-4">
				<Skeleton className="h-20 w-full rounded-md" />
			</div>
			<div className="grid grid-cols-[minmax(0,1fr)] gap-6 px-4 sm:px-6 lg:grid-cols-2">
				{[1, 2, 3, 4, 5].map((i) => (
					<div key={i} className="rounded-lg border border-border bg-raised p-4">
						<Skeleton className="h-6 w-40 mb-4" />
						<Skeleton className="h-32 w-full" />
					</div>
				))}
			</div>
		</div>
	);
}

export default async function AnalyticsPage() {
	await requirePageRole("admin", "viewer");
	return (
		<Suspense fallback={<AnalyticsSkeleton />}>
			<Analytics />
		</Suspense>
	);
}
