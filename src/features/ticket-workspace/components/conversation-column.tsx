"use client";

// Ticket title and email thread. Customer bodies are untrusted, so they render as plain text (HTML is converted to text).
import { useId, useMemo } from "react";
import { MailX } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Lozenge, StatusLozenge } from "@/components/ui/lozenge";
import { PriorityIcon } from "@/components/ui/priority-icon";
import { cn } from "@/lib/utils";
import { formatDateTime, formatRelative } from "@/lib/ticket-meta";
import { AiSummaryCard } from "./ai-summary-card";
import type { TicketDetail, TicketEmailRow } from "@/types/api";

function bodyTextFor(row: TicketEmailRow): string {
	const email = row.emails;
	if (!email) return "";
	if (email.body_text.trim()) return email.body_text;
	if (email.body_html && typeof window !== "undefined") {
		return new DOMParser().parseFromString(email.body_html, "text/html").body.textContent ?? "";
	}
	return "";
}

const RELATIONSHIP_LABEL: Record<string, string> = {
	original: "Original",
	reply: "Reply",
	forward: "Forward",
	duplicate: "Duplicate",
};

export function ConversationColumn({ ticket }: { ticket: TicketDetail }) {
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

	const customer = ticket.contacts?.name ?? ticket.contacts?.email ?? null;
	// Rendered once per responsive layout, so the heading id must be unique per instance.
	const headingId = useId();

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-[22px] font-semibold leading-snug tracking-[-0.015em] text-foreground text-balance">
					{ticket.subject}
				</h1>
				<div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-subtle">
					<PriorityIcon severity={ticket.severity} showLabel />
					<StatusLozenge status={ticket.status} />
					{ticket.category && <span>{ticket.category}</span>}
					<span aria-hidden="true" className="text-border-bold">
						·
					</span>
					<span>
						{customer ? `${customer} opened this ` : "Opened "}
						<time dateTime={ticket.created_at} title={formatDateTime(ticket.created_at)}>
							{formatRelative(ticket.created_at)}
						</time>
					</span>
				</div>
			</div>

			<AiSummaryCard ticket={ticket} />

			<section aria-labelledby={headingId}>
				<h2 id={headingId} className="flex items-center gap-2 text-sm font-semibold text-foreground">
					Conversation
					<span className="text-xs font-normal tabular text-subtlest">{rows.length}</span>
				</h2>

				{rows.length === 0 ? (
					<EmptyState className="mt-3" size="sm" icon={MailX} title="No email content stored" />
				) : (
					<ol className="mt-3 space-y-3">
						{rows.map((row, index) => (
							<li key={row.email_id}>
								<MessageCard
									row={row}
									body={bodies.get(row.email_id) ?? ""}
									// Older messages start collapsed so the latest one is readable without scrolling.
									defaultOpen={index === rows.length - 1 || rows.length <= 2}
								/>
							</li>
						))}
					</ol>
				)}
			</section>
		</div>
	);
}

function MessageCard({ row, body, defaultOpen }: { row: TicketEmailRow; body: string; defaultOpen: boolean }) {
	const email = row.emails!;
	const sender = email.from_name || email.from_address;
	const preview = body.replace(/\s+/g, " ").trim();

	return (
		<details open={defaultOpen} className="group rounded-lg border border-border bg-raised">
			<summary className="flex cursor-pointer list-none items-start gap-3 rounded-lg px-4 py-3 hover:bg-fill/60">
				<Avatar name={sender} size="md" />
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
						<span className="text-sm font-semibold text-foreground">{sender}</span>
						{email.from_name && <span className="truncate text-xs text-subtle">{email.from_address}</span>}
						{row.relationship !== "original" && (
							<Lozenge>{RELATIONSHIP_LABEL[row.relationship] ?? row.relationship}</Lozenge>
						)}
						{email.language && email.language !== "en" && <Lozenge>{email.language}</Lozenge>}
						<time
							className="ml-auto shrink-0 text-xs text-subtlest"
							dateTime={email.received_at}
							title={formatDateTime(email.received_at)}
						>
							{formatRelative(email.received_at)}
						</time>
					</div>
					<p className={cn("mt-0.5 truncate text-sm text-subtle", "group-open:hidden")}>{preview}</p>
				</div>
			</summary>
			<p className="whitespace-pre-wrap break-words px-4 pb-4 text-sm leading-6 text-foreground sm:pl-[60px]">{body}</p>
		</details>
	);
}
