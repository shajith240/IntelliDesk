"use client";

// Change-password dialog for the signed-in user: current + new + confirm, then POST /api/me/password.
import { useId, useState } from "react";
import { KeyRound } from "lucide-react";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label, Input, FieldMessage } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiSend, ApiRequestError } from "@/lib/api-client";

const MIN_LENGTH = 12;

interface ChangePasswordDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
	const { toast } = useToast();
	const baseId = useId();
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const reset = () => {
		setCurrentPassword("");
		setNewPassword("");
		setConfirmPassword("");
		setError(null);
		setSubmitting(false);
	};

	const handleOpenChange = (next: boolean) => {
		if (!next) reset();
		onOpenChange(next);
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);

		if (newPassword.length < MIN_LENGTH) {
			setError(`Use at least ${MIN_LENGTH} characters.`);
			return;
		}
		if (newPassword !== confirmPassword) {
			setError("New password and confirmation don't match.");
			return;
		}
		if (newPassword === currentPassword) {
			setError("The new password must be different.");
			return;
		}

		setSubmitting(true);
		try {
			await apiSend("/api/me/password", "POST", {
				current_password: currentPassword,
				new_password: newPassword,
			});
			toast({ tone: "success", title: "Password changed" });
			handleOpenChange(false);
		} catch (err) {
			setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Try again.");
		} finally {
			setSubmitting(false);
		}
	};

	const currentId = `${baseId}-current`;
	const newId = `${baseId}-new`;
	const confirmId = `${baseId}-confirm`;
	const errorId = `${baseId}-error`;

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent title="Change password" size="sm">
				<form onSubmit={handleSubmit} className="space-y-3">
					<div>
						<Label htmlFor={currentId}>Current password</Label>
						<Input
							id={currentId}
							type="password"
							autoComplete="current-password"
							value={currentPassword}
							onChange={(e) => setCurrentPassword(e.target.value)}
							required
							className="mt-1"
						/>
					</div>
					<div>
						<Label htmlFor={newId}>New password</Label>
						<Input
							id={newId}
							type="password"
							autoComplete="new-password"
							value={newPassword}
							onChange={(e) => setNewPassword(e.target.value)}
							required
							minLength={MIN_LENGTH}
							className="mt-1"
						/>
					</div>
					<div>
						<Label htmlFor={confirmId}>Confirm new password</Label>
						<Input
							id={confirmId}
							type="password"
							autoComplete="new-password"
							value={confirmPassword}
							onChange={(e) => setConfirmPassword(e.target.value)}
							required
							minLength={MIN_LENGTH}
							className="mt-1"
							invalid={!!error}
							aria-describedby={error ? errorId : undefined}
						/>
					</div>
					{error && (
						<FieldMessage id={errorId} tone="error">
							{error}
						</FieldMessage>
					)}
					<DialogFooter>
						<Button variant="default" onClick={() => handleOpenChange(false)} disabled={submitting}>
							Cancel
						</Button>
						<Button type="submit" variant="primary" loading={submitting}>
							<KeyRound aria-hidden="true" />
							Change password
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
