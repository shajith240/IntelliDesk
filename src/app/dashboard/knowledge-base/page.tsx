// Knowledge base management: view and manage FAQ articles for AI retrieval.
import { requirePageRole } from "@/server/auth/page-guard";
import { PageHeader } from "@/components/layout/page-header";
import { KnowledgeBase } from "@/features/knowledge-base/components/knowledge-base";

export const metadata = { title: "Knowledge Base" };

export default async function KnowledgeBasePage() {
	await requirePageRole("admin", "agent", "viewer");
	return (
		<div className="pb-10">
			<PageHeader
				breadcrumbs={[
					{ label: "Support", href: "/dashboard" },
					{ label: "Knowledge Base" },
				]}
				title="Knowledge Base"
				description="Articles the AI searches when drafting replies. Changes are re-indexed automatically."
			/>
			<div className="px-4 sm:px-6">
				<KnowledgeBase />
			</div>
		</div>
	);
}
