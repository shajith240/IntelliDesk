"use client";

// Draft reply state; syncs text edits to localStorage, handles send (POST /api/respond) with error recovery.
import { useCallback, useRef, useState } from "react";
import { apiSend, ApiRequestError } from "@/lib/api-client";
import { useRefreshAll } from "@/hooks/use-api";
import { useToast } from "@/components/ui/toast";
import { findRecipient } from "@/features/ticket-workspace/lib/ticket-detail";
import type { AutoResponseRow, RespondResponse, TicketDetailResponse } from "@/types/api";

const MAX_LENGTH = 20000;

function latestByCreatedAt(rows: AutoResponseRow[]): AutoResponseRow | null {
	if (rows.length === 0) return null;
	return rows.reduce((latest, row) =>
		new Date(row.created_at).getTime() > new Date(latest.created_at).getTime() ? row : latest,
	);
}

function readStored(key: string): string | null {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage.getItem(key);
	} catch {
		// Storage may be unavailable (private mode, quota) — fall back to the AI draft.
		return null;
	}
}

export type ReplyDraftStatus = "idle" | "sending" | "sent" | "error";

/**
 * Lifted reply-draft state shared by every ReplyComposer instance mounted for the
 * current breakpoint layout, so the desktop/tablet/mobile renders never disagree.
 */
export function useReplyDraft(detail: TicketDetailResponse) {
	const ticket = detail.ticket;
	const pending = latestByCreatedAt(ticket.auto_responses.filter((r) => !r.sent));
	const lastSent = latestByCreatedAt(ticket.auto_responses.filter((r) => r.sent));
	const recipient = findRecipient(ticket);

	const storageKey = pending ? `intellidesk.draft.${ticket.id}.${pending.id}` : null;

	const [tracked, setTracked] = useState<{ key: string | null; text: string }>(() => ({
		key: storageKey,
		text: storageKey && pending ? (readStored(storageKey) ?? pending.response_text) : "",
	}));

	// The pending draft identity changed (ticket switch, or the AI draft was regenerated) —
	// re-derive the initial text for the new key. This mirrors React's documented
	// "adjust state during render" pattern; it is not an effect and stays compiler-safe.
	const [status, setStatus] = useState<ReplyDraftStatus>("idle");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	let text = tracked.text;
	const keyChanged = storageKey !== tracked.key;
	if (keyChanged) {
		text = storageKey && pending ? (readStored(storageKey) ?? pending.response_text) : "";
		setTracked({ key: storageKey, text });
		// A different draft is a fresh start; a finished send must not carry over.
		if (status !== "sending") {
			setStatus("idle");
			setErrorMessage(null);
		}
	}

	const setText = useCallback(
		(next: string) => {
			setTracked({ key: storageKey, text: next });
			if (!storageKey) return;
			try {
				if (pending && next === pending.response_text) {
					window.localStorage.removeItem(storageKey);
				} else {
					window.localStorage.setItem(storageKey, next);
				}
			} catch {
				// Best effort only — edits still work in memory for this session.
			}
		},
		[storageKey, pending],
	);

	const restoreAiDraft = useCallback(() => {
		if (pending) setText(pending.response_text);
	}, [pending, setText]);

	const isDirty = pending ? text !== pending.response_text : false;

	const sendingRef = useRef(false);
	const refreshAll = useRefreshAll();
	const { toast } = useToast();

	/** Resolves true when the email was sent. */
	const send = useCallback(async (): Promise<boolean> => {
		if (!pending || sendingRef.current || status === "sending") return false;
		const trimmed = text.trim();
		if (!trimmed) {
			setStatus("error");
			setErrorMessage("Response text cannot be empty.");
			return false;
		}
		if (trimmed.length > MAX_LENGTH) {
			setStatus("error");
			setErrorMessage("Response text is too long (max 20,000 characters).");
			return false;
		}

		sendingRef.current = true;
		setStatus("sending");
		setErrorMessage(null);
		try {
			await apiSend<RespondResponse>("/api/respond", "POST", {
				ticket_id: ticket.id,
				response_id: pending.id,
				response_text: text,
			});
			if (storageKey) {
				try {
					window.localStorage.removeItem(storageKey);
				} catch {
					// Best effort only.
				}
			}
			setStatus("sent");
			toast({
				tone: "success",
				title: `Response sent to ${recipient ?? "the customer"}`,
				description: "The ticket is now Resolved.",
			});
			void refreshAll();
			return true;
		} catch (error) {
			let message = "Sending failed. Your reply is kept here — try again.";
			if (error instanceof ApiRequestError) {
				if (error.status === 400) message = error.message;
				else if (error.status === 404)
					message =
						"This draft was already sent or no longer exists. Refresh the ticket to see its current state.";
				else if (error.status === 502)
					message =
						"The email server rejected the message. Check the mailbox settings (SMTP) and try again.";
				else if (error.status === 0)
					message = "You're offline. Your reply is kept here — try again when you're back online.";
			}
			setStatus("error");
			setErrorMessage(message);
			toast({ tone: "error", title: "Send failed", description: message });
			return false;
		} finally {
			sendingRef.current = false;
		}
	}, [pending, ticket.id, text, storageKey, recipient, refreshAll, toast, status]);

	return {
		pending,
		lastSent,
		recipient,
		text,
		setText,
		isDirty,
		restoreAiDraft,
		savedLocally: isDirty,
		status,
		errorMessage,
		send,
	};
}

export type ReplyDraft = ReturnType<typeof useReplyDraft>;
