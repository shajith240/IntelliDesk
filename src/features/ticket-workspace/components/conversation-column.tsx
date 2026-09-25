"use client";

// Ticket title and conversation: customer emails, team replies, and internal notes.
// Customer/reply bodies are untrusted or user-authored, so they always render as plain text.
import { useId, useMemo } from "react";
import { Lock, MailX } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Lozenge, StatusLozenge } from "@/components/ui/lozenge";
import { PriorityIcon } from "@/components/ui/priority-icon";
import { AiLabel } from "@/components/ui/ai-mark";
import { cn } from "@/lib/utils";
import { formatDateTime, formatRelative } from "@/lib/ticket-meta";
import { AiSummaryCard } from "./ai-summary-card";
import type { TicketDetail, TicketMessageRow } from "@/types/api";

interface ConversationColumnProps {
	ticket: TicketDetail;
	onOpenTicket: (id: string) => void;
}

export function ConversationColumn({ ticket, onOpenTicket }: ConversationColumnProps) {
	const rows = useMemo(
		() =>
			[...ticket.ticket_messages].sort(
				(a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
			),
		[ticket.ticket_messages],
	);

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
				{ticket.follow_up_parent && (
					<p className="mt-1.5 text-xs text-subtle">
						Follow-up to{" "}
						<button
							type="button"
							onClick={() => onOpenTicket(ticket.follow_up_parent!.id)}
							className="font-mono text-primary hover:underline"
						>
							{ticket.follow_up_parent.ticket_number}
						</button>
					</p>
				)}
			</div>

			<AiSummaryCard ticket={ticket} />

			<section aria-labelledby={headingId}>
				<h2 id={headingId} className="flex items-center gap-2 text-sm font-semibold text-foreground">
					Conversation
					<span className="text-xs font-normal tabular text-subtlest">{rows.length}</span>
				</h2>

				{rows.length === 0 ? (
					<EmptyState className="mt-3" size="sm" icon={MailX} title="No messages yet" />
				) : (
					<ol className="mt-3 space-y-3">
						{rows.map((row, index) => (
							<li key={row.id}>
								<MessageCard
									row={row}
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

function MessageCard({ row, defaultOpen }: { row: TicketMessageRow; defaultOpen: boolean }) {
	const body = row.body_text ?? "";
	const preview = body.replace(/\s+/g, " ").trim();

	if (row.kind === "note") {
		const author = row.users?.name ?? "Former member";
		return (
			<details open={defaultOpen} className="group rounded-lg border border-warning/30 bg-warning-subtle/40">
				<summary className="flex cursor-pointer list-none items-start gap-3 rounded-lg px-4 py-3 hover:bg-warning-subtle/70">
					<Avatar name={author} size="md" />
					<div className="min-w-0 flex-1">
						<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
							<span className="text-sm font-semibold text-foreground">{author}</span>
							<Lock className="h-3.5 w-3.5 shrink-0 text-warning-text" aria-hidden="true" />
							<Lozenge appearance="moved">Internal note</Lozenge>
							<time
								className="ml-auto shrink-0 text-xs text-subtlest"
								dateTime={row.created_at}
								title={formatDateTime(row.created_at)}
							>
								{formatRelative(row.created_at)}
							</time>
						</div>
						<p className={cn("mt-0.5 truncate text-sm text-subtle", "group-open:hidden")}>{preview}</p>
					</div>
				</summary>
				<p className="whitespace-pre-wrap break-words px-4 pb-4 text-sm leading-6 text-foreground sm:pl-[60px]">
					{body}
				</p>
			</details>
		);
	}

	if (row.kind === "reply") {
		const isAi = row.author_type === "ai";
		const author = isAi ? "IntelliDesk AI" : (row.users?.name ?? "Former member");
		return (
			<details open={defaultOpen} className="group rounded-lg border border-border bg-raised">
				<summary className="flex cursor-pointer list-none items-start gap-3 rounded-lg px-4 py-3 hover:bg-fill/60">
					<Avatar name={author} size="md" />
					<div className="min-w-0 flex-1">
						<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
							<span className="text-sm font-semibold text-foreground">{author}</span>
							{isAi ? <AiLabel>Sent automatically</AiLabel> : <Lozenge>Reply</Lozenge>}
							{row.delivery_status === "sending" && <Lozenge appearance="inprogress">Sending…</Lozenge>}
							{row.delivery_status === "failed" && <Lozenge appearance="removed">Not delivered</Lozenge>}
							<time
								className="ml-auto shrink-0 text-xs text-subtlest"
								dateTime={row.created_at}
								title={formatDateTime(row.created_at)}
							>
								{formatRelative(row.created_at)}
							</time>
						</div>
						<p className={cn("mt-0.5 truncate text-sm text-subtle", "group-open:hidden")}>{preview}</p>
						{row.delivery_status === "failed" && row.delivery_error && (
							<p className="mt-1 text-xs text-danger-text group-open:hidden">{row.delivery_error}</p>
						)}
					</div>
				</summary>
				<div className="px-4 pb-4 sm:pl-[60px]">
					{row.delivery_status === "failed" && row.delivery_error && (
						<p className="mb-2 text-xs text-danger-text">{row.delivery_error}</p>
					)}
					<p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{body}</p>
				</div>
			</details>
		);
	}

	// Customer message.
	const email = row.emails;
	const sender = email?.from_name || email?.from_address || "Unknown sender";
	const showLanguage = email?.language && email.language.toLowerCase() !== "english";

	return (
		<details open={defaultOpen} className="group rounded-lg border border-border bg-raised">
			<summary className="flex cursor-pointer list-none items-start gap-3 rounded-lg px-4 py-3 hover:bg-fill/60">
				<Avatar name={sender} size="md" />
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
						<span className="text-sm font-semibold text-foreground">{sender}</span>
						{email?.from_name && <span className="truncate text-xs text-subtle">{email.from_address}</span>}
						{showLanguage && <Lozenge>{email!.language}</Lozenge>}
						<time
							className="ml-auto shrink-0 text-xs text-subtlest"
							dateTime={row.created_at}
							title={formatDateTime(row.created_at)}
						>
							{formatRelative(row.created_at)}
						</time>
					</div>
					<p className={cn("mt-0.5 truncate text-sm text-subtle", "group-open:hidden")}>{preview}</p>
				</div>
			</summary>
			<p className="whitespace-pre-wrap break-words px-4 pb-4 text-sm leading-6 text-foreground sm:pl-[60px]">{body}</p>
		</details>
	);
}
