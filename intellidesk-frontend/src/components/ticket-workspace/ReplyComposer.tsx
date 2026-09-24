"use client";

// Compose and review a reply from an AI-generated draft; edits persist in localStorage.
import { useId } from "react";
import { RotateCcw, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label, Textarea, FieldMessage } from "@/components/ui/field";
import { SectionMessage } from "@/components/ui/section-message";
import { AiLabel } from "@/components/ui/ai-mark";
import { formatDateTime } from "@/lib/ticket-meta";
import type { ReplyDraft } from "./useReplyDraft";
import type { MatchType } from "@/types";

const MAX_LENGTH = 20000;

function matchLabel(matchType: MatchType): string {
	if (matchType === "perfect") return "Knowledge base match";
	if (matchType === "partial") return "Partial knowledge base match";
	return "No knowledge base match";
}

function matchScoreLabel(score: number): string | null {
	if (score > 0 && score <= 1) return `${Math.round(score * 100)}% match`;
	if (score > 1) return `${Math.round(score)}% match`;
	return null;
}

interface ReplyComposerProps {
	draft: ReplyDraft;
	recipient: string | null;
	subject: string;
	ticketNumber: string;
	onRequestSend: () => void;
	compactActions?: boolean;
}

export function ReplyComposer({
	draft,
	recipient,
	subject,
	ticketNumber,
	onRequestSend,
	compactActions = false,
}: ReplyComposerProps) {
	const { pending, lastSent, text, setText, isDirty, restoreAiDraft, savedLocally, status, errorMessage } = draft;

	// Mounted once per responsive layout, so ids must be unique per instance.
	const baseId = useId();
	const textareaId = `${baseId}-text`;
	const counterId = `${baseId}-counter`;
	const errorId = `${baseId}-error`;
	const trimmedLength = text.trim().length;
	const tooLong = text.length > MAX_LENGTH;
	const sending = status === "sending";

	return (
		<div>
			<div className="flex flex-wrap items-center gap-2">
				<h2 className="text-base font-semibold text-foreground">Reply</h2>
				{pending && <AiLabel>AI draft</AiLabel>}
				{pending && (
					<span className="text-xs text-discovery-text">
						{matchLabel(pending.match_type)}
						{matchScoreLabel(pending.match_score) ? ` · ${matchScoreLabel(pending.match_score)}` : ""}
					</span>
				)}
			</div>

			{pending && (
				<SectionMessage appearance="discovery" className="mt-3">
					Review before sending. This draft was written by AI from your knowledge base and may be wrong or
					incomplete. Nothing is sent until you approve it.
				</SectionMessage>
			)}

			{pending && (
				<>
					<p className="mt-3 text-xs text-subtle">
						To: {recipient ?? "unknown"} · Subject: Re: {subject} [{ticketNumber}]
					</p>

					<div className="mt-2">
						<Label htmlFor={textareaId}>Response to customer</Label>
						<Textarea
							id={textareaId}
							className="mt-1 min-h-[220px]"
							value={text}
							onChange={(e) => setText(e.target.value)}
							disabled={sending}
							invalid={status === "error"}
							aria-describedby={`${counterId}${status === "error" ? ` ${errorId}` : ""}`}
						/>
						<FieldMessage id={counterId} tone={tooLong ? "error" : "hint"}>
							{text.length.toLocaleString()} / 20,000 characters
							{savedLocally ? " · Edits saved on this device" : ""}
						</FieldMessage>
						{status === "error" && errorMessage && (
							<FieldMessage id={errorId} tone="error">
								{errorMessage}
							</FieldMessage>
						)}
					</div>

					<div
						className={cn(
							"flex flex-wrap items-center justify-end gap-2",
							compactActions
								? "sticky bottom-0 -mx-4 mt-3 border-t border-border bg-overlay px-4 py-3"
								: "mt-4",
						)}
					>
						<Button variant="subtle" onClick={restoreAiDraft} disabled={!isDirty || sending}>
							<RotateCcw aria-hidden="true" />
							Restore AI draft
						</Button>
						<Button
							variant="primary"
							onClick={onRequestSend}
							disabled={trimmedLength === 0 || tooLong || sending}
						>
							<Send aria-hidden="true" />
							Review &amp; send
						</Button>
					</div>
				</>
			)}

			{!pending && lastSent && (
				<SectionMessage appearance="success" title="Response sent" className="mt-3">
					<p>A reply for this ticket has already been sent.</p>
					<p className="text-xs text-subtle">Draft created {formatDateTime(lastSent.created_at)}</p>
					<blockquote className="mt-2 whitespace-pre-wrap rounded-md border border-border bg-sunken p-3 text-sm">
						{lastSent.response_text}
					</blockquote>
				</SectionMessage>
			)}

			{!pending && !lastSent && (
				<SectionMessage appearance="information" title="No AI draft for this ticket" className="mt-3">
					IntelliDesk only sends replies from an AI draft, and none was generated for this ticket (usually
					because no knowledge base article matched). Reply from your mailbox, then update the status here.
				</SectionMessage>
			)}
		</div>
	);
}
