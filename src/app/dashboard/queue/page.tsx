// Incoming queue: tickets still in New status, waiting for an agent to pick them up.
import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { WorkQueue, QueueSkeleton } from "@/features/queue/components/work-queue";

export const metadata: Metadata = { title: "Incoming Queue" };

export default function QueuePage() {
	return (
		<div className="pb-10">
			<PageHeader
				breadcrumbs={[{ label: "Support", href: "/dashboard" }, { label: "Incoming Queue" }]}
				title="Incoming Queue"
				description="New tickets that nobody has picked up yet, newest activity first."
			/>
			<div className="px-4 sm:px-6">
				<Suspense fallback={<QueueSkeleton />}>
					<WorkQueue scope="incoming" />
				</Suspense>
			</div>
		</div>
	);
}
