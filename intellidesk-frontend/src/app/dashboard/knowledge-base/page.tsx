// Knowledge base management: view and manage FAQ articles for AI retrieval.
import { PageHeader } from "@/components/shell/PageHeader";
import { KnowledgeBase } from "@/components/knowledge-base/KnowledgeBase";

export const metadata = { title: "Knowledge Base" };

export default function KnowledgeBasePage() {
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
