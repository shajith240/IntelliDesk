"use client";

// Confirms deactivating a member (admins only): warns that their open tickets are released.
import { useState } from "react";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SectionMessage } from "@/components/ui/section-message";
import { apiSend, ApiRequestError } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import type { TeamMember } from "@/types/api";

interface DeactivateMemberDialogProps {
	member: TeamMember;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess: () => void;
}

export function DeactivateMemberDialog({ member, open, onOpenChange, onSuccess }: DeactivateMemberDialogProps) {
	const { toast } = useToast();
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleConfirm = async () => {
		setSubmitting(true);
		setError(null);
		try {
			await apiSend(`/api/team/${member.id}`, "PATCH", { is_active: false });
			toast({ tone: "success", title: `${member.name} deactivated` });
			onSuccess();
		} catch (err) {
			setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Try again.");
		} finally {
			setSubmitting(false);
		}
	};

	const handleOpenChange = (next: boolean) => {
		if (submitting) return;
		if (!next) setError(null);
		onOpenChange(next);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent title={`Deactivate ${member.name}?`} size="sm">
				<div className="space-y-3">
					<p className="text-sm text-subtle">
						They&rsquo;ll lose access immediately. Their open tickets go back to the unassigned pool.
					</p>
					{error && <SectionMessage appearance="error">{error}</SectionMessage>}
				</div>
				<DialogFooter>
					<Button variant="default" onClick={() => handleOpenChange(false)} disabled={submitting}>
						Cancel
					</Button>
					<Button variant="danger" onClick={() => void handleConfirm()} loading={submitting}>
						Deactivate
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
