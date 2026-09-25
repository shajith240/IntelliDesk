"use client";

// Final confirmation before emailing the customer; states the status the ticket will be left in.
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { SectionMessage } from "@/components/ui/section-message";
import type { ReplyDraft } from "@/features/ticket-workspace/hooks/use-reply-draft";

interface SendConfirmDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	draft: ReplyDraft;
	recipient: string | null;
	subject: string;
	ticketNumber: string;
}

export function SendConfirmDialog({
	open,
	onOpenChange,
	draft,
	recipient,
	subject,
	ticketNumber,
}: SendConfirmDialogProps) {
	const sending = draft.status === "sending";

	const handleOpenChange = (next: boolean) => {
		if (sending) return;
		onOpenChange(next);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				title="Send this reply?"
				description={`This emails the customer and sets the ticket to ${draft.statusAfter}. It can't be undone.`}
				size="md"
				onEscapeKeyDown={(e) => {
					if (sending) e.preventDefault();
				}}
				onPointerDownOutside={(e) => {
					if (sending) e.preventDefault();
				}}
			>
				<dl className="grid grid-cols-[80px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
					<dt className="text-subtle">To</dt>
					<dd className="text-foreground">{recipient ?? "unknown"}</dd>
					<dt className="text-subtle">Subject</dt>
					<dd className="text-foreground">
						Re: {subject} [{ticketNumber}]
					</dd>
					<dt className="text-subtle">Ticket</dt>
					<dd className="font-mono text-foreground">{ticketNumber}</dd>
					<dt className="text-subtle">Length</dt>
					<dd className="text-foreground">{draft.text.length.toLocaleString()} characters</dd>
				</dl>
				<div className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-sunken p-3 text-sm">
					{draft.text}
				</div>
				{draft.status === "error" && draft.errorMessage && (
					<SectionMessage appearance="error" className="mt-3">
						{draft.errorMessage}
					</SectionMessage>
				)}

				<DialogFooter>
					<DialogClose asChild>
						<Button variant="subtle" disabled={sending}>
							Cancel
						</Button>
					</DialogClose>
					<Button variant="primary" loading={sending} onClick={async () => {
							// Close only on success; on failure the error stays visible in the dialog.
							if (await draft.send()) onOpenChange(false);
						}}>
						Send reply
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
