// My work queue: displays tickets assigned to the current user.
import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { WorkQueue, QueueSkeleton } from "@/features/queue/components/work-queue";

export const metadata: Metadata = { title: "My Work" };

export default function MyWorkPage() {
	return (
		<div className="pb-10">
			<PageHeader
				breadcrumbs={[{ label: "Support", href: "/dashboard" }, { label: "My Work" }]}
				title="My Work"
				description="Tickets assigned to you. Open tickets are shown by default."
			/>
			<div className="px-4 sm:px-6">
				<Suspense fallback={<QueueSkeleton />}>
					<WorkQueue scope="mine" />
				</Suspense>
			</div>
		</div>
	);
}
