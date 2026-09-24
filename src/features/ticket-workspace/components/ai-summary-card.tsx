"use client";

// Compact AI summary at the top of the ticket: what the model thinks the email is about and how sure it is.
import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { AiLabel } from "@/components/ui/ai-mark";
import { ConfidenceMeter } from "@/components/ui/confidence-meter";
import { confidencePercent } from "@/lib/ticket-meta";
import { parseClassification } from "@/features/ticket-workspace/lib/ticket-detail";
import type { TicketDetail } from "@/types/api";

export function AiSummaryCard({ ticket }: { ticket: TicketDetail }) {
	const classification = useMemo(() => parseClassification(ticket.ai_classification), [ticket.ai_classification]);
	if (!classification) return null;

	const pct = confidencePercent(classification.confidence ?? ticket.ai_confidence);
	const flagged = classification.requires_human_review || ticket.is_flagged_for_review;

	return (
		<section
			aria-label="AI summary"
			className="rounded-lg border border-discovery/25 bg-discovery-subtle/40 p-4"
		>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
				<AiLabel>AI summary</AiLabel>
				{pct !== null && <ConfidenceMeter value={pct} size="sm" className="ml-auto" />}
			</div>

			{classification.summary ? (
				<p className="mt-3 text-sm leading-6 text-foreground">{classification.summary}</p>
			) : (
				<p className="mt-3 text-sm text-subtle">The model returned a classification but no summary.</p>
			)}

			{flagged && (
				<p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-warning-text">
					<AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					Flagged for a human check before acting on this classification
				</p>
			)}

			{classification.reasoning && (
				<details className="group mt-3">
					<summary className="cursor-pointer list-none text-xs font-medium text-discovery-text hover:underline">
						<span className="group-open:hidden">Show reasoning</span>
						<span className="hidden group-open:inline">Hide reasoning</span>
					</summary>
					<p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-subtle">{classification.reasoning}</p>
				</details>
			)}
		</section>
	);
}
