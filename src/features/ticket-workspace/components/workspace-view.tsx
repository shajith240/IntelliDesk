"use client";

// Ticket workspace layout: conversation with a docked composer beside a collapsible sidebar; tabs on mobile.
import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCanWorkTicket } from "@/features/ticket-workspace/hooks/use-can-work-ticket";
import { useReplyDraft } from "@/features/ticket-workspace/hooks/use-reply-draft";
import { ConversationColumn } from "./conversation-column";
import { ReplyComposer } from "./reply-composer";
import { SendConfirmDialog } from "./send-confirm-dialog";
import { TicketSidebar } from "./ticket-sidebar";
import { WorkspaceHeader } from "./workspace-header";
import type { TicketDetailResponse } from "@/types/api";

interface WorkspaceViewProps {
	detail: TicketDetailResponse;
	onRefresh: () => void;
	onOpenTicket: (id: string) => void;
	onClose: () => void;
	onDirtyChange: (dirty: boolean) => void;
}

export function WorkspaceView({ detail, onOpenTicket, onClose, onDirtyChange }: WorkspaceViewProps) {
	const { ticket, sla, similar_tickets, allowed_statuses } = detail;
	const draft = useReplyDraft(detail);
	const [sendDialogOpen, setSendDialogOpen] = useState(false);
	const canWork = useCanWorkTicket(ticket);

	// Report dirty state up so the sheet can warn before discarding unsent edits. This is a
	// deliberate synchronization with the parent, not derivable render output, so it stays an effect.
	// Anything typed that isn't just the untouched AI draft counts as unsent work.
	const hasUnsentText = draft.text.trim().length > 0 && !draft.fromAiDraft;
	useEffect(() => {
		onDirtyChange(hasUnsentText);
	}, [hasUnsentText, onDirtyChange]);

	// The knowledge-base evidence shown in the sidebar: the pending draft, else the last one sent.
	const lastSentDraft =
		ticket.auto_responses
			.filter((row) => row.sent_message_id !== null)
			.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;

	const main = (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-6">
				<div className="mx-auto max-w-[760px]">
					<ConversationColumn ticket={ticket} onOpenTicket={onOpenTicket} />
				</div>
			</div>
			<div className="shrink-0 border-t border-border bg-raised px-4 py-3 sm:px-8">
				<div className="mx-auto max-w-[760px]">
					<ReplyComposer
						draft={draft}
						recipient={draft.recipient}
						onRequestSend={() => setSendDialogOpen(true)}
						canWork={canWork}
					/>
				</div>
			</div>
		</div>
	);

	const sidebar = (
		<TicketSidebar
			ticket={ticket}
			sla={sla}
			similarTickets={similar_tickets}
			evidence={draft.pending ?? lastSentDraft}
			onOpenTicket={onOpenTicket}
		/>
	);

	return (
		<div className="flex h-full min-h-0 flex-col bg-background">
			<WorkspaceHeader ticket={ticket} allowedStatuses={allowed_statuses} onClose={onClose} />

			<div className="hidden min-h-0 flex-1 md:grid md:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
				<div className="flex min-h-0 flex-col">{main}</div>
				<aside aria-label="Ticket details" className="min-h-0 overflow-y-auto border-l border-border bg-raised">
					{sidebar}
				</aside>
			</div>

			<Tabs defaultValue="conversation" className="flex min-h-0 flex-1 flex-col md:hidden">
				<TabsList className="px-3">
					<TabsTrigger value="conversation">Conversation</TabsTrigger>
					<TabsTrigger value="details">Details</TabsTrigger>
				</TabsList>
				<TabsContent value="conversation" className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
					{main}
				</TabsContent>
				<TabsContent value="details" className="min-h-0 flex-1 overflow-y-auto bg-raised">
					{sidebar}
				</TabsContent>
			</Tabs>

			<SendConfirmDialog
				open={sendDialogOpen}
				onOpenChange={setSendDialogOpen}
				draft={draft}
				recipient={draft.recipient}
				subject={ticket.subject}
				ticketNumber={ticket.ticket_number}
			/>
		</div>
	);
}
