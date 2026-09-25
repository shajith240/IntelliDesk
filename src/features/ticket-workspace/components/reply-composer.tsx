"use client";

// Composer docked under the conversation: a public reply (optionally starting from the
// AI draft, sent only after confirmation) or an internal note the customer never sees.
import { useId } from "react";
import { Lock, MessageSquare, RotateCcw, Send, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea, FieldMessage } from "@/components/ui/field";
import { AiLabel } from "@/components/ui/ai-mark";
import { cn } from "@/lib/utils";
import type { ComposerMode, ReplyDraft } from "@/features/ticket-workspace/hooks/use-reply-draft";
import type { MatchType } from "@/types";
import type { ReplyStatusAfter } from "@/types/api";

const MAX_LENGTH = 20000;

const selectClass =
	"h-8 rounded-md border border-border-bold bg-background px-2 text-sm text-foreground transition-colors duration-100 hover:bg-fill focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50";

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
	/** False for viewers, and agents the ticket isn't assigned to. */
	canWork: boolean;
}

export function ReplyComposer({ draft, recipient, onRequestSend, canWork }: ReplyComposerProps) {
	const { mode, setMode, pending, text, setText, isDirty, fromAiDraft, restoreAiDraft, status, errorMessage } = draft;

	// Mounted once per responsive layout, so ids must be unique per instance.
	const baseId = useId();
	const textareaId = `${baseId}-text`;
	const counterId = `${baseId}-counter`;
	const errorId = `${baseId}-error`;
	const statusId = `${baseId}-status`;
	const tooLong = text.length > MAX_LENGTH;
	const sending = status === "sending";
	const isNote = mode === "note";
	const replyBlocked = !isNote && !draft.canReply;

	if (!canWork) {
		return (
			<p className="text-sm text-subtle">
				You can read this conversation, but only the assigned agent or an admin can reply or add notes.
			</p>
		);
	}

	return (
		<div>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
				<ModeSwitch mode={mode} onChange={setMode} disabled={sending} />
				{!isNote && fromAiDraft && pending && (
					<span className="flex items-center gap-2">
						<AiLabel>AI draft</AiLabel>
						<span className="text-xs text-discovery-text">{matchLabel(pending.match_type, pending.match_score)}</span>
					</span>
				)}
				<span className="ml-auto truncate text-xs text-subtle">
					{isNote ? (
						<span className="inline-flex items-center gap-1 text-warning-text">
							<Lock className="h-3 w-3" aria-hidden="true" />
							Only your team sees notes
						</span>
					) : (
						`To ${recipient ?? "unknown recipient"}`
					)}
				</span>
			</div>

			{replyBlocked ? (
				<p className="mt-3 rounded-md border border-border bg-sunken p-3 text-sm text-subtle">
					This ticket is closed, so it can&apos;t be replied to. If the customer writes again, their email opens a
					follow-up ticket. You can still add an internal note.
				</p>
			) : (
				<>
					<label htmlFor={textareaId} className="sr-only">
						{isNote ? "Internal note" : "Reply to the customer"}
					</label>
					<Textarea
						id={textareaId}
						className={cn(
							"mt-2 max-h-[38vh] min-h-[132px]",
							isNote ? "border-warning bg-warning-subtle/40" : "bg-background",
						)}
						placeholder={isNote ? "Add context for your team…" : "Write your reply…"}
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
							<span className={tooLong ? "text-danger-text" : undefined}>{text.length.toLocaleString()} / 20,000</span>
							{!isNote && (isDirty ? " · Saved on this device" : " · Review before sending")}
						</p>

						{!isNote && pending && (
							<Button variant="subtle" size="sm" onClick={restoreAiDraft} disabled={!isDirty || sending}>
								<RotateCcw aria-hidden="true" />
								Restore AI draft
							</Button>
						)}

						{!isNote && (
							<span className="flex items-center gap-1.5">
								<label htmlFor={statusId} className="text-xs text-subtle">
									Then set
								</label>
								<select
									id={statusId}
									className={selectClass}
									value={draft.statusAfter}
									onChange={(e) => draft.setStatusAfter(e.target.value as ReplyStatusAfter)}
									disabled={sending}
								>
									{draft.statusOptions.map((option) => (
										<option key={option} value={option}>
											{option === "Pending" ? "Pending (waiting on customer)" : option}
										</option>
									))}
								</select>
							</span>
						)}

						{isNote ? (
							<Button
								variant="primary"
								loading={sending}
								onClick={() => void draft.send()}
								disabled={text.trim().length === 0 || tooLong || sending}
							>
								<StickyNote aria-hidden="true" />
								Add note
							</Button>
						) : (
							<Button
								variant="primary"
								onClick={onRequestSend}
								disabled={text.trim().length === 0 || tooLong || sending}
							>
								<Send aria-hidden="true" />
								Review &amp; send
							</Button>
						)}
					</div>
				</>
			)}
		</div>
	);
}

function ModeSwitch({
	mode,
	onChange,
	disabled,
}: {
	mode: ComposerMode;
	onChange: (mode: ComposerMode) => void;
	disabled: boolean;
}) {
	const options: Array<{ value: ComposerMode; label: string; Icon: typeof MessageSquare }> = [
		{ value: "reply", label: "Reply", Icon: MessageSquare },
		{ value: "note", label: "Internal note", Icon: StickyNote },
	];
	return (
		<div role="group" aria-label="Message type" className="inline-flex rounded-md border border-border p-0.5">
			{options.map(({ value, label, Icon }) => (
				<button
					key={value}
					type="button"
					aria-pressed={mode === value}
					disabled={disabled}
					onClick={() => onChange(value)}
					className={cn(
						"inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-[13px] font-medium transition-colors duration-100 disabled:opacity-50",
						mode === value
							? value === "note"
								? "bg-warning-subtle text-warning-text"
								: "bg-primary text-primary-foreground"
							: "text-subtle hover:bg-fill hover:text-foreground",
					)}
				>
					<Icon className="h-3.5 w-3.5" aria-hidden="true" />
					{label}
				</button>
			))}
		</div>
	);
}
