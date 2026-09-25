// Needs review: open, unassigned tickets the AI flagged for a human to look at and assign.
import { Suspense } from "react";
import type { Metadata } from "next";
import { requirePageRole } from "@/server/auth/page-guard";
import { PageHeader } from "@/components/layout/page-header";
import { WorkQueue, QueueSkeleton } from "@/features/queue/components/work-queue";

export const metadata: Metadata = { title: "Needs Review" };

export default async function ReviewPage() {
	await requirePageRole("admin", "viewer");
	return (
		<div className="pb-10">
			<PageHeader
				breadcrumbs={[{ label: "Support", href: "/dashboard" }, { label: "Needs Review" }]}
				title="Needs review"
				description="Unassigned tickets the AI flagged for a human. Assign each one to an available teammate."
			/>
			<div className="px-4 sm:px-6">
				<Suspense fallback={<QueueSkeleton />}>
					<WorkQueue scope="review" />
				</Suspense>
			</div>
		</div>
	);
}
