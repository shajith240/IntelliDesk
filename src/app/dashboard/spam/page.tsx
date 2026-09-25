// Spam review: email the filters kept out of the queue, with a way to recover false positives.
import type { Metadata } from "next";
import { requirePageRole } from "@/server/auth/page-guard";
import { PageHeader } from "@/components/layout/page-header";
import { SpamReview } from "@/features/spam/components/spam-review";

export const metadata: Metadata = { title: "Spam" };

export default async function SpamPage() {
	await requirePageRole("admin");
	return (
		<div className="pb-10">
			<PageHeader
				breadcrumbs={[{ label: "Support", href: "/dashboard" }, { label: "Spam" }]}
				title="Spam"
				description="Email the spam filters kept out of the queue in the last 30 days. Recover anything that's a real customer."
			/>
			<div className="max-w-4xl px-4 sm:px-6">
				<SpamReview />
			</div>
		</div>
	);
}
