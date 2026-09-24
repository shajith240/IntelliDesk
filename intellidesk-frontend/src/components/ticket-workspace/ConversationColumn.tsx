"use client";

// Email conversation thread. Customer bodies are untrusted, so they render as plain text (HTML is converted to text).
import { useMemo } from "react";
import { MailX } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Lozenge, StatusLozenge } from "@/components/ui/lozenge";
import { PriorityIcon } from "@/components/ui/priority-icon";
import { formatDateTime, formatRelative } from "@/lib/ticket-meta";
import { ReplyComposer } from "./ReplyComposer";
import type { ReplyDraft } from "./useReplyDraft";
import type { TicketDetail, TicketEmailRow } from "@/types/api";

interface ConversationColumnProps {
	ticket: TicketDetail;
	draft: ReplyDraft;
	onRequestSend: () => void;
	/** Mobile renders its own composer with a sticky action bar below this column. */
	hideComposer?: boolean;
}

function bodyTextFor(row: TicketEmailRow): string {
	const email = row.emails;
	if (!email) return "";
	if (email.body_text.trim()) return email.body_text;
	if (email.body_html && typeof window !== "undefined") {
		return new DOMParser().parseFromString(email.body_html, "text/html").body.textContent ?? "";
	}
	return "";
}

export function ConversationColumn({ ticket, draft, onRequestSend, hideComposer = false }: ConversationColumnProps) {
	const rows = useMemo(
		() =>
			ticket.ticket_emails
				.filter((row) => row.emails)
				.sort(
					(a, b) => new Date(a.emails!.received_at).getTime() - new Date(b.emails!.received_at).getTime(),
				),
		[ticket.ticket_emails],
	);

	const bodies = useMemo(() => {
		const map = new Map<string, string>();
		for (const row of rows) map.set(row.email_id, bodyTextFor(row));
		return map;
	}, [rows]);

	const original = rows.find((row) => row.relationship === "original") ?? rows[0];
	const thread = rows.filter((row) => row !== original);

	return (
		<div>
			<h1 className="text-2xl font-semibold tracking-[-0.01em] text-foreground">{ticket.subject}</h1>
			<div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-subtle">
				<PriorityIcon severity={ticket.severity} showLabel />
				<StatusLozenge status={ticket.status} />
				<time dateTime={ticket.created_at} title={formatDateTime(ticket.created_at)}>
					Opened {formatRelative(ticket.created_at)}
				</time>
				{ticket.category && <span>{ticket.category}</span>}
			</div>

			<div className="mt-4 flex items-start gap-3 rounded-lg border border-border bg-raised p-3">
				<Avatar name={ticket.contacts?.name ?? ticket.contacts?.email ?? null} size="md" />
				<div className="min-w-0 text-sm">
					<p className="font-medium text-foreground">
						{ticket.contacts?.name ?? ticket.contacts?.email ?? "Unknown contact"}
					</p>
					{ticket.contacts?.name && <p className="text-subtle">{ticket.contacts.email}</p>}
					<p className="text-subtle">
						{[ticket.contacts?.role, ticket.contacts?.phone].filter(Boolean).join(" · ")}
					</p>
					{ticket.accounts && (
						<p className="mt-1 flex items-center gap-1.5 text-subtle">
							{ticket.accounts.company_name}
							<Lozenge>{ticket.accounts.tier}</Lozenge>
						</p>
					)}
				</div>
			</div>

			<div className="mt-5">
				{rows.length === 0 && (
					<EmptyState size="sm" icon={MailX} title="No email content stored" />
				)}

				{original && (
					<MessageBlock
						row={original}
						heading="Original message"
						body={bodies.get(original.email_id) ?? ""}
					/>
				)}

				{thread.length > 0 && (
					<div className="mt-4">
						<h2 className="text-sm font-semibold text-foreground">Thread history ({thread.length})</h2>
						<div className="mt-2 space-y-2">
							{thread.map((row) => (
								<details key={row.email_id} className="rounded-md border border-border">
									<summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm">
										<span className="min-w-0 flex-1 truncate text-foreground">
											{row.emails!.from_name || row.emails!.from_address}
										</span>
										<Lozenge>{row.relationship}</Lozenge>
										<time
											className="text-xs text-subtlest"
											dateTime={row.emails!.received_at}
											title={formatDateTime(row.emails!.received_at)}
										>
											{formatRelative(row.emails!.received_at)}
										</time>
									</summary>
									<div className="border-t border-border px-3 py-2">
										{row.emails!.language && row.emails!.language !== "en" && (
											<Lozenge className="mb-2">{row.emails!.language}</Lozenge>
										)}
										<p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
											{bodies.get(row.email_id) ?? ""}
										</p>
									</div>
								</details>
							))}
						</div>
					</div>
				)}
			</div>

			{!hideComposer && (
				<div className="mt-8 border-t border-border pt-6">
					<ReplyComposer
						draft={draft}
						recipient={draft.recipient}
						subject={ticket.subject}
						ticketNumber={ticket.ticket_number}
						onRequestSend={onRequestSend}
					/>
				</div>
			)}
		</div>
	);
}

function MessageBlock({
	row,
	heading,
	body,
}: {
	row: TicketEmailRow;
	heading: string;
	body: string;
}) {
	const email = row.emails!;
	return (
		<div>
			<h2 className="text-sm font-semibold text-foreground">{heading}</h2>
			<div className="mt-2 flex items-center justify-between gap-2">
				<span className="text-sm font-medium text-foreground">{email.from_name || email.from_address}</span>
				<time className="text-xs text-subtlest" dateTime={email.received_at} title={formatDateTime(email.received_at)}>
					{formatRelative(email.received_at)}
				</time>
			</div>
			{email.language && email.language !== "en" && <Lozenge className="mt-1">{email.language}</Lozenge>}
			<p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{body}</p>
		</div>
	);
}
