"use client";

// FAQ article deletion confirmation dialog with irreversible warning.
import { useState } from "react";
import { apiSend } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import type { FAQ } from "@/types";

import {
	Dialog,
	DialogContent,
	DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SectionMessage } from "@/components/ui/section-message";

interface DeleteArticleDialogProps {
	article: FAQ;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess: () => void;
}

export function DeleteArticleDialog({
	article,
	open,
	onOpenChange,
	onSuccess,
}: DeleteArticleDialogProps) {
	const { toast } = useToast();
	const [isDeleting, setIsDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleDelete = async () => {
		setIsDeleting(true);
		setError(null);

		try {
			await apiSend(`/api/faqs/${article.id}`, "DELETE");
			toast({
				tone: "success",
				title: "Article deleted",
			});
			onSuccess();
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to delete article";
			setError(message);
		} finally {
			setIsDeleting(false);
		}
	};

	const handleOpenChange = (newOpen: boolean) => {
		if (isDeleting) return;
		onOpenChange(newOpen);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				size="sm"
				title="Delete this article?"
				description="The AI will stop using it for replies. This can't be undone."
			>
				<div className="space-y-3">
					{error && <SectionMessage appearance="error">{error}</SectionMessage>}

					<p className="text-sm text-subtle">
						<span className="font-medium text-foreground">{article.question}</span>
					</p>
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="secondary"
						onClick={() => handleOpenChange(false)}
						disabled={isDeleting}
					>
						Cancel
					</Button>
					<Button
						type="button"
						variant="danger"
						loading={isDeleting}
						onClick={handleDelete}
					>
						Delete
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
