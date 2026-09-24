"use client";

// Reply composer docked under the conversation. Edits an AI draft; nothing is sent until the agent confirms.
import { useId } from "react";
import { CheckCircle2, Info, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea, FieldMessage } from "@/components/ui/field";
import { AiLabel } from "@/components/ui/ai-mark";
import { formatDateTime } from "@/lib/ticket-meta";
import type { ReplyDraft } from "@/features/ticket-workspace/hooks/use-reply-draft";
import type { MatchType } from "@/types";

const MAX_LENGTH = 20000;

function matchLabel(matchType: MatchType, score: number): string {
	const pct = score > 0 && score <= 1 ? Math.round(score * 100) : score > 1 ? Math.round(score) : null;
	const base =
		matchType === "perfect" ? "Knowledge base match" : matchType === "partial" ? "Partial match" : "No article match";
	return pct === null ? base : `${base} · ${pct}%`;
}

interface ReplyComposerProps {
	draft: ReplyDraft;
	recipient: string | null;
	onRequestSend: () => void;
}

export function ReplyComposer({ draft, recipient, onRequestSend }: ReplyComposerProps) {
	const { pending, lastSent, text, setText, isDirty, restoreAiDraft, savedLocally, status, errorMessage } = draft;

	// Mounted once per responsive layout, so ids must be unique per instance.
	const baseId = useId();
	const textareaId = `${baseId}-text`;
	const counterId = `${baseId}-counter`;
	const errorId = `${baseId}-error`;
	const tooLong = text.length > MAX_LENGTH;
	const sending = status === "sending";

	if (!pending && lastSent) {
		return (
			<details className="group">
				<summary className="flex cursor-pointer list-none items-center gap-2 text-sm">
					<CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
					<span className="font-medium text-foreground">Reply sent</span>
					<span className="truncate text-subtle">· draft from {formatDateTime(lastSent.created_at)}</span>
					<span className="ml-auto shrink-0 text-xs font-medium text-primary group-open:hidden">View reply</span>
					<span className="ml-auto hidden shrink-0 text-xs font-medium text-primary group-open:inline">Hide</span>
				</summary>
				<blockquote className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-sunken p-3 text-sm text-foreground">
					{lastSent.response_text}
				</blockquote>
			</details>
		);
	}

	if (!pending) {
		return (
			<p className="flex items-start gap-2 text-sm text-subtle">
				<Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
				<span>
					<span className="font-medium text-foreground">No AI draft for this ticket.</span> No knowledge base
					article matched, so reply from your mailbox and update the status here.
				</span>
			</p>
		);
	}

	return (
		<div>
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
				<label htmlFor={textareaId} className="text-sm font-semibold text-foreground">
					Reply
				</label>
				<AiLabel>AI draft</AiLabel>
				<span className="text-xs text-discovery-text">{matchLabel(pending.match_type, pending.match_score)}</span>
				<span className="ml-auto truncate text-xs text-subtle">To {recipient ?? "unknown recipient"}</span>
			</div>

			<Textarea
				id={textareaId}
				className="mt-2 max-h-[38vh] min-h-[132px] bg-background"
				value={text}
				onChange={(e) => setText(e.target.value)}
				disabled={sending}
				invalid={status === "error"}
				aria-describedby={`${counterId}${status === "error" ? ` ${errorId}` : ""}`}
			/>
			{status === "error" && errorMessage && (
				<FieldMessage id={errorId} tone="error">
					{errorMessage}
				</FieldMessage>
			)}

			<div className="mt-2 flex flex-wrap items-center gap-2">
				<p id={counterId} className="mr-auto text-xs text-subtlest">
					<span className={tooLong ? "text-danger-text" : undefined}>
						{text.length.toLocaleString()} / 20,000
					</span>
					{savedLocally ? " · Saved on this device" : " · Review before sending"}
				</p>
				<Button variant="subtle" size="sm" onClick={restoreAiDraft} disabled={!isDirty || sending}>
					<RotateCcw aria-hidden="true" />
					Restore draft
				</Button>
				<Button
					variant="primary"
					onClick={onRequestSend}
					disabled={text.trim().length === 0 || tooLong || sending}
				>
					<Send aria-hidden="true" />
					Review &amp; send
				</Button>
			</div>
		</div>
	);
}
