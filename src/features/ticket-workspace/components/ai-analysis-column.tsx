"use client";

// Displays AI classification results: confidence, suggested tags, and evidence (matched article, similar tickets).
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { Frown, Meh, Smile } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Lozenge, StatusLozenge } from "@/components/ui/lozenge";
import { PriorityIcon } from "@/components/ui/priority-icon";
import { SectionMessage } from "@/components/ui/section-message";
import { AiMark, AiLabel } from "@/components/ui/ai-mark";
import { ConfidenceMeter, confidenceBand } from "@/components/ui/confidence-meter";
import { confidencePercent, formatRelative, isSeverity } from "@/lib/ticket-meta";
import { parseClassification } from "@/features/ticket-workspace/lib/ticket-detail";
import type { AutoResponseRow, SimilarTicketRef, TicketDetail } from "@/types/api";

interface AiAnalysisColumnProps {
	ticket: TicketDetail;
	similarTickets: SimilarTicketRef[];
	pending: AutoResponseRow | null;
	lastSent: AutoResponseRow | null;
	onOpenTicket: (id: string) => void;
}

function matchLabel(matchType: AutoResponseRow["match_type"]): string {
	if (matchType === "perfect") return "Knowledge base match";
	if (matchType === "partial") return "Partial knowledge base match";
	return "No knowledge base match";
}

function matchScoreLabel(score: number): string | null {
	if (score > 0 && score <= 1) return `${Math.round(score * 100)}% match`;
	if (score > 1) return `${Math.round(score)}% match`;
	return null;
}

function sentimentIcon(sentiment: string) {
	const normalized = sentiment.toLowerCase();
	if (normalized === "positive") return Smile;
	if (normalized === "negative" || normalized === "angry" || normalized === "frustrated") return Frown;
	return Meh;
}

export function AiAnalysisColumn({ ticket, similarTickets, pending, lastSent, onOpenTicket }: AiAnalysisColumnProps) {
	const classification = useMemo(() => parseClassification(ticket.ai_classification), [ticket.ai_classification]);
	const evidence = pending ?? lastSent;

	return (
		<div>
			<div className="flex items-center gap-2">
				<h2 className="text-sm font-semibold text-foreground">AI analysis</h2>
				<AiLabel />
			</div>
			<p className="mt-1 text-xs text-subtlest">
				Generated automatically when the email arrived. Verify before acting.
			</p>

			{!classification && (
				<EmptyState
					className="mt-4"
					size="sm"
					icon={AiMark}
					title="No AI analysis recorded"
					description="This ticket was created before analysis was stored, or classification failed."
				/>
			)}

			{classification && (
				<div className="mt-4 space-y-5">
					<section>
						<p className="text-[11px] font-bold uppercase tracking-[0.02em] text-subtlest">Confidence</p>
						{(() => {
							const pct = confidencePercent(classification.confidence ?? ticket.ai_confidence);
							return (
								<>
									<div className="mt-1 flex items-center gap-3">
										<p className="text-2xl font-semibold tabular text-foreground">
											{pct === null ? "—" : `${pct}%`}
										</p>
										<ConfidenceMeter value={pct} showValue={false} size="md" />
									</div>
									{pct !== null && (
										<p className={cn("mt-1 text-xs", confidenceBand(pct).text)}>
											{confidenceBand(pct).summary}
										</p>
									)}
								</>
							);
						})()}
						{(classification.requires_human_review || ticket.is_flagged_for_review) && (
							<SectionMessage appearance="warning" title="Flagged for human review" className="mt-2" />
						)}
					</section>

					<section>
						<p className="text-[11px] font-bold uppercase tracking-[0.02em] text-subtlest">
							Suggested classification
						</p>
						<dl className="mt-2 grid grid-cols-[80px_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-sm">
							<dt className="text-subtle">Category</dt>
							<dd className="text-foreground">{classification.category ?? "—"}</dd>
							<dt className="text-subtle">Severity</dt>
							<dd className="flex items-center gap-1.5 text-foreground">
								{classification.severity && isSeverity(classification.severity) ? (
									<PriorityIcon severity={classification.severity} showLabel />
								) : (
									(classification.severity ?? "—")
								)}
							</dd>
							<dt className="text-subtle">Sentiment</dt>
							<dd className="flex items-center gap-1.5 text-foreground">
								{classification.sentiment ? (
									<>
										{(() => {
											const Icon = sentimentIcon(classification.sentiment);
											return <Icon className="h-4 w-4" aria-hidden="true" />;
										})()}
										{classification.sentiment}
									</>
								) : (
									"—"
								)}
							</dd>
							<dt className="text-subtle">Language</dt>
							<dd className="text-foreground">{classification.language ?? "—"}</dd>
							{classification.is_spam && (
								<>
									<dt className="text-subtle">Spam</dt>
									<dd>
										<Lozenge appearance="removed">Flagged as spam</Lozenge>
									</dd>
								</>
							)}
						</dl>
					</section>

					{classification.summary && (
						<section>
							<p className="text-[11px] font-bold uppercase tracking-[0.02em] text-subtlest">Summary</p>
							<p className="mt-1 text-sm text-foreground">{classification.summary}</p>
						</section>
					)}

					{classification.reasoning && (
						<section>
							<p className="text-[11px] font-bold uppercase tracking-[0.02em] text-subtlest">Reasoning</p>
							<p className="mt-1 whitespace-pre-wrap text-sm text-subtle">{classification.reasoning}</p>
						</section>
					)}

					{classification.key_entities && classification.key_entities.length > 0 && (
						<section>
							<p className="text-[11px] font-bold uppercase tracking-[0.02em] text-subtlest">Key entities</p>
							<div className="mt-1.5 flex flex-wrap gap-1.5">
								{classification.key_entities.map((entity) => (
									<Lozenge key={entity}>{entity}</Lozenge>
								))}
							</div>
						</section>
					)}

					{classification.suggested_tags && classification.suggested_tags.length > 0 && (
						<section>
							<p className="text-[11px] font-bold uppercase tracking-[0.02em] text-subtlest">
								Suggested tags
							</p>
							<div className="mt-1.5 flex flex-wrap gap-1.5">
								{classification.suggested_tags.map((tag) => (
									<Lozenge key={tag}>{tag}</Lozenge>
								))}
							</div>
						</section>
					)}

					<section>
						<p className="text-[11px] font-bold uppercase tracking-[0.02em] text-subtlest">Evidence</p>
						<div className="mt-1.5 space-y-3 text-sm">
							<div>
								<p className="font-medium text-foreground">Knowledge base match</p>
								{evidence ? (
									<p className="text-subtle">
										{matchLabel(evidence.match_type)}
										{matchScoreLabel(evidence.match_score)
											? ` · ${matchScoreLabel(evidence.match_score)}`
											: ""}
										. The matched article text isn&apos;t stored on the ticket.
									</p>
								) : (
									<p className="text-subtle">No knowledge base match was recorded.</p>
								)}
							</div>

							<div>
								<p className="font-medium text-foreground">Similar tickets</p>
								{similarTickets.length === 0 ? (
									<p className="text-subtle">No other tickets in this category.</p>
								) : (
									<ul className="mt-1 space-y-1">
										{similarTickets.map((similar) => (
											<li key={similar.id}>
												<button
													type="button"
													onClick={() => onOpenTicket(similar.id)}
													className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors duration-100 hover:bg-fill"
												>
													<PriorityIcon severity={similar.severity} />
													<span className="font-mono text-xs text-subtle">{similar.ticket_number}</span>
													<span className="min-w-0 flex-1 truncate text-foreground">{similar.subject}</span>
													<StatusLozenge status={similar.status} />
													<span className="text-xs text-subtlest">{formatRelative(similar.created_at)}</span>
												</button>
											</li>
										))}
									</ul>
								)}
								<p className="mt-1 text-xs text-subtlest">
									Same category, most recent first. Not a semantic match.
								</p>
							</div>
						</div>
					</section>
				</div>
			)}
		</div>
	);
}
