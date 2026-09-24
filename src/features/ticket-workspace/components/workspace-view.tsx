"use client";

// Main ticket workspace layout; responsive three-column (desktop), two-column (tablet), or tabbed (mobile).
import { useEffect, useState } from "react";
import { AiAnalysisColumn } from "./ai-analysis-column";
import { ConversationColumn } from "./conversation-column";
import { DetailsColumn } from "./details-column";
import { ReplyComposer } from "./reply-composer";
import { SendConfirmDialog } from "./send-confirm-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkspaceHeader } from "./workspace-header";
import { useReplyDraft } from "@/features/ticket-workspace/hooks/use-reply-draft";
import type { TicketDetailResponse } from "@/types/api";

interface WorkspaceViewProps {
	detail: TicketDetailResponse;
	onRefresh: () => void;
	onOpenTicket: (id: string) => void;
	onClose: () => void;
	onDirtyChange: (dirty: boolean) => void;
}

export function WorkspaceView({ detail, onOpenTicket, onClose, onDirtyChange }: WorkspaceViewProps) {
	const { ticket, sla, similar_tickets } = detail;
	const draft = useReplyDraft(detail);
	const [sendDialogOpen, setSendDialogOpen] = useState(false);

	// Report dirty state up so the sheet can warn before discarding unsent edits. This is a
	// deliberate synchronization with the parent, not derivable render output, so it stays an effect.
	useEffect(() => {
		onDirtyChange(draft.isDirty);
	}, [draft.isDirty, onDirtyChange]);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<WorkspaceHeader ticket={ticket} onClose={onClose} />

			<div className="hidden min-h-0 flex-1 xl:grid xl:grid-cols-[minmax(0,1fr)_360px_320px]">
				<div className="min-h-0 overflow-y-auto px-6 py-5">
					<ConversationColumn ticket={ticket} draft={draft} onRequestSend={() => setSendDialogOpen(true)} />
				</div>
				<div className="min-h-0 overflow-y-auto border-l border-border bg-sunken px-4 py-5">
					<AiAnalysisColumn
						ticket={ticket}
						similarTickets={similar_tickets}
						pending={draft.pending}
						lastSent={draft.lastSent}
						onOpenTicket={onOpenTicket}
					/>
				</div>
				<div className="min-h-0 overflow-y-auto border-l border-border px-4 py-5">
					<DetailsColumn ticket={ticket} sla={sla} />
				</div>
			</div>

			<div className="hidden min-h-0 flex-1 md:grid md:grid-cols-[minmax(0,1fr)_340px] xl:hidden">
				<div className="min-h-0 overflow-y-auto px-6 py-5">
					<ConversationColumn ticket={ticket} draft={draft} onRequestSend={() => setSendDialogOpen(true)} />
				</div>
				<div className="min-h-0 overflow-y-auto border-l border-border px-4 py-5">
					<AiAnalysisColumn
						ticket={ticket}
						similarTickets={similar_tickets}
						pending={draft.pending}
						lastSent={draft.lastSent}
						onOpenTicket={onOpenTicket}
					/>
					<div className="mt-6 border-t border-border pt-5">
						<DetailsColumn ticket={ticket} sla={sla} />
					</div>
				</div>
			</div>

			<Tabs defaultValue="conversation" className="flex min-h-0 flex-1 flex-col md:hidden">
				<TabsList className="px-3">
					<TabsTrigger value="conversation">Conversation</TabsTrigger>
					<TabsTrigger value="ai">AI analysis</TabsTrigger>
					<TabsTrigger value="details">Details</TabsTrigger>
				</TabsList>
				<TabsContent value="conversation" className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
					<ConversationColumn
						ticket={ticket}
						draft={draft}
						onRequestSend={() => setSendDialogOpen(true)}
						hideComposer
					/>
					<div className="mt-8 border-t border-border pt-6">
						<ReplyComposer
							draft={draft}
							recipient={draft.recipient}
							subject={ticket.subject}
							ticketNumber={ticket.ticket_number}
							onRequestSend={() => setSendDialogOpen(true)}
							compactActions
						/>
					</div>
				</TabsContent>
				<TabsContent value="ai" className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
					<AiAnalysisColumn
						ticket={ticket}
						similarTickets={similar_tickets}
						pending={draft.pending}
						lastSent={draft.lastSent}
						onOpenTicket={onOpenTicket}
					/>
				</TabsContent>
				<TabsContent value="details" className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
					<DetailsColumn ticket={ticket} sla={sla} />
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
