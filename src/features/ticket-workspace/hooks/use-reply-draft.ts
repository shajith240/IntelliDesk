"use client";

// Composer state for a ticket's conversation: a public reply (emailed to the customer) or an
// internal note (team-only). Syncs draft text to localStorage per mode, handles send
// (POST /api/tickets/[id]/messages) with error recovery.
import { useCallback, useRef, useState } from "react";
import { apiSend, ApiRequestError } from "@/lib/api-client";
import { useRefreshAll } from "@/hooks/use-api";
import { useToast } from "@/components/ui/toast";
import { findRecipient } from "@/features/ticket-workspace/lib/ticket-detail";
import type { AutoResponseRow, PostMessageResponse, ReplyStatusAfter, TicketDetailResponse } from "@/types/api";

const MAX_LENGTH = 20000;
const REPLY_STATUS_OPTIONS: ReplyStatusAfter[] = ["In Progress", "Pending", "Resolved"];

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
		// Storage may be unavailable (private mode, quota) — fall back to the default text.
		return null;
	}
}

function writeStored(key: string, value: string, blank: string) {
	try {
		if (value === blank) window.localStorage.removeItem(key);
		else window.localStorage.setItem(key, value);
	} catch {
		// Best effort only — edits still work in memory for this session.
	}
}

function clearStored(key: string) {
	try {
		window.localStorage.removeItem(key);
	} catch {
		// Best effort only.
	}
}

export type ComposerMode = "reply" | "note";
export type ReplyDraftStatus = "idle" | "sending" | "sent" | "error";

interface ComposerSession {
	ticketId: string;
	mode: ComposerMode;
	replyText: string;
	noteText: string;
	statusAfter: ReplyStatusAfter;
}

/**
 * Lifted composer state shared by every ReplyComposer instance mounted for the
 * current breakpoint layout, so the desktop/tablet/mobile renders never disagree.
 */
export function useReplyDraft(detail: TicketDetailResponse) {
	const ticket = detail.ticket;
	// The pending AI draft: the newest auto-response that hasn't been sent yet.
	const pending = latestByCreatedAt(ticket.auto_responses.filter((r) => !r.sent && !r.sent_message_id));
	const recipient = findRecipient(ticket);
	const canReply = ticket.status !== "Closed";

	const replyStorageKey = `intellidesk.draft.${ticket.id}`;
	const noteStorageKey = `intellidesk.note.${ticket.id}`;

	const statusOptions: ReplyStatusAfter[] = REPLY_STATUS_OPTIONS.filter(
		(s) => s === ticket.status || detail.allowed_statuses.includes(s),
	);

	function defaultStatusAfter(): ReplyStatusAfter {
		if (statusOptions.includes("Pending")) return "Pending";
		return statusOptions[0] ?? "In Progress";
	}

	function buildSession(): ComposerSession {
		return {
			ticketId: ticket.id,
			mode: "reply",
			replyText: readStored(replyStorageKey) ?? pending?.response_text ?? "",
			noteText: readStored(noteStorageKey) ?? "",
			statusAfter: defaultStatusAfter(),
		};
	}

	const [session, setSession] = useState<ComposerSession>(buildSession);
	const [status, setStatus] = useState<ReplyDraftStatus>("idle");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	// The ticket changed under us (a different ticket opened in the same workspace) — re-derive
	// the composer for it. This mirrors React's documented "adjust state during render" pattern;
	// it is not an effect and stays compiler-safe.
	if (session.ticketId !== ticket.id) {
		setSession(buildSession());
		if (status !== "sending") {
			setStatus("idle");
			setErrorMessage(null);
		}
	}

	const mode = session.mode;
	const text = mode === "reply" ? session.replyText : session.noteText;

	const setMode = useCallback((next: ComposerMode) => {
		setSession((prev) => (prev.mode === next ? prev : { ...prev, mode: next }));
	}, []);

	const setText = useCallback(
		(next: string) => {
			setSession((prev) => {
				if (prev.mode === "reply") {
					writeStored(replyStorageKey, next, pending?.response_text ?? "");
					return { ...prev, replyText: next };
				}
				writeStored(noteStorageKey, next, "");
				return { ...prev, noteText: next };
			});
		},
		[replyStorageKey, noteStorageKey, pending],
	);

	const setStatusAfter = useCallback((next: ReplyStatusAfter) => {
		setSession((prev) => ({ ...prev, statusAfter: next }));
	}, []);

	const restoreAiDraft = useCallback(() => {
		if (!pending) return;
		setSession((prev) => {
			writeStored(replyStorageKey, pending.response_text, pending.response_text);
			return { ...prev, replyText: pending.response_text };
		});
	}, [pending, replyStorageKey]);

	// The ticket's status can move under the composer (header dropdown, a second agent) without
	// this being a ticket switch; fall back to a still-valid choice rather than an orphaned one.
	const statusAfter = statusOptions.includes(session.statusAfter)
		? session.statusAfter
		: (statusOptions[0] ?? session.statusAfter);

	const isDirty = pending ? session.replyText !== pending.response_text : false;
	/** Whether the current reply text is still exactly the AI draft it started from. */
	const fromAiDraft = mode === "reply" && !!pending && !isDirty;

	const sendingRef = useRef(false);
	const refreshAll = useRefreshAll();
	const { toast } = useToast();

	/** Resolves true when the message was sent/added. */
	const send = useCallback(async (): Promise<boolean> => {
		if (sendingRef.current || status === "sending") return false;
		const trimmed = text.trim();
		if (!trimmed) {
			setStatus("error");
			setErrorMessage(mode === "reply" ? "Write a reply first." : "Write a note first.");
			return false;
		}
		if (trimmed.length > MAX_LENGTH) {
			setStatus("error");
			setErrorMessage("Keep it under 20,000 characters.");
			return false;
		}
		if (mode === "reply" && !canReply) {
			setStatus("error");
			setErrorMessage("Closed tickets can't be replied to.");
			return false;
		}

		sendingRef.current = true;
		setStatus("sending");
		setErrorMessage(null);
		try {
			if (mode === "note") {
				await apiSend<PostMessageResponse>(`/api/tickets/${ticket.id}/messages`, "POST", {
					kind: "note",
					body: text,
				});
				clearStored(noteStorageKey);
				setStatus("sent");
				toast({ tone: "success", title: "Note added" });
			} else {
				const statusToSend = statusAfter === ticket.status ? undefined : statusAfter;
				const draftId = fromAiDraft && pending ? pending.id : undefined;
				const result = await apiSend<PostMessageResponse>(`/api/tickets/${ticket.id}/messages`, "POST", {
					kind: "reply",
					body: text,
					status_after: statusToSend,
					draft_id: draftId,
				});
				clearStored(replyStorageKey);
				setStatus("sent");
				toast({
					tone: "success",
					title: `Reply sent to ${result.to ?? recipient ?? "the customer"}`,
					description: result.status ? `Ticket is now ${result.status}` : undefined,
				});
			}
			setSession((prev) => ({
				...prev,
				replyText: mode === "reply" ? "" : prev.replyText,
				noteText: mode === "note" ? "" : prev.noteText,
			}));
			void refreshAll();
			return true;
		} catch (error) {
			let message =
				mode === "reply" ? "Sending failed. Your reply is kept here — try again." : "Couldn't add the note. Try again.";
			if (error instanceof ApiRequestError) {
				if ([400, 403, 404, 409, 502].includes(error.status)) message = error.message;
				else if (error.status === 0)
					message = "You're offline. Your text is kept here — try again when you're back online.";
			}
			setStatus("error");
			setErrorMessage(message);
			toast({ tone: "error", title: mode === "reply" ? "Send failed" : "Couldn't add note", description: message });
			return false;
		} finally {
			sendingRef.current = false;
		}
	}, [
		status,
		text,
		mode,
		canReply,
		ticket.id,
		ticket.status,
		statusAfter,
		fromAiDraft,
		pending,
		noteStorageKey,
		replyStorageKey,
		recipient,
		refreshAll,
		toast,
	]);

	return {
		mode,
		setMode,
		pending,
		recipient,
		text,
		setText,
		isDirty,
		fromAiDraft,
		restoreAiDraft,
		savedLocally: isDirty,
		statusAfter,
		setStatusAfter,
		statusOptions,
		canReply,
		status,
		errorMessage,
		send,
	};
}

export type ReplyDraft = ReturnType<typeof useReplyDraft>;
