"use client";

// Add-member dialog (admins only): name/email/role form, then a one-time-password reveal screen.
import { useId, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label, Input, FieldMessage } from "@/components/ui/field";
import { SectionMessage } from "@/components/ui/section-message";
import { apiSend, ApiRequestError } from "@/lib/api-client";
import type { CreateMemberResponse } from "@/types/api";
import type { UserRole } from "@/types";

interface AddMemberDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Called once the dialog is dismissed after a successful add, so the list can refresh. */
	onAdded: () => void;
}

export function AddMemberDialog({ open, onOpenChange, onAdded }: AddMemberDialogProps) {
	const baseId = useId();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<UserRole>("agent");
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [created, setCreated] = useState<CreateMemberResponse | null>(null);
	const [copied, setCopied] = useState(false);

	const reset = () => {
		setName("");
		setEmail("");
		setRole("agent");
		setError(null);
		setSubmitting(false);
		setCreated(null);
		setCopied(false);
	};

	const handleOpenChange = (next: boolean) => {
		if (!next && created) onAdded();
		if (!next) reset();
		onOpenChange(next);
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setSubmitting(true);
		try {
			const result = await apiSend<CreateMemberResponse>("/api/team", "POST", { name, email, role });
			setCreated(result);
		} catch (err) {
			setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Try again.");
		} finally {
			setSubmitting(false);
		}
	};

	const handleCopy = async () => {
		if (!created) return;
		try {
			await navigator.clipboard.writeText(created.initial_password);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 2000);
		} catch {
			// Clipboard access can fail (permissions, insecure context); the password stays visible to copy manually.
		}
	};

	const nameId = `${baseId}-name`;
	const emailId = `${baseId}-email`;
	const roleId = `${baseId}-role`;

	if (created) {
		return (
			<Dialog open={open} onOpenChange={handleOpenChange}>
				<DialogContent title="Member added" size="sm">
					<div className="space-y-3">
						<p className="text-sm text-subtle">
							{created.member.name}&rsquo;s one-time password. Share it with them securely — they can change it
							from their user menu.
						</p>
						<div>
							<Label htmlFor={`${baseId}-password`}>One-time password</Label>
							<div className="mt-1 flex items-center gap-2">
								<Input
									id={`${baseId}-password`}
									readOnly
									value={created.initial_password}
									className="font-mono"
									onFocus={(e) => e.currentTarget.select()}
								/>
								<Button
									type="button"
									variant="default"
									size="icon"
									aria-label="Copy password"
									onClick={() => void handleCopy()}
								>
									{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
								</Button>
							</div>
						</div>
						<SectionMessage appearance="warning">
							Copy this now. It won&rsquo;t be shown again — share it securely; they can change it from their
							user menu.
						</SectionMessage>
					</div>
					<DialogFooter>
						<Button variant="primary" onClick={() => handleOpenChange(false)}>
							Done
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent title="Add member" size="sm">
				<form onSubmit={handleSubmit} className="space-y-3">
					{error && <SectionMessage appearance="error">{error}</SectionMessage>}
					<div>
						<Label htmlFor={nameId}>Name</Label>
						<Input
							id={nameId}
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
							minLength={2}
							className="mt-1"
						/>
					</div>
					<div>
						<Label htmlFor={emailId}>Email</Label>
						<Input
							id={emailId}
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							className="mt-1"
						/>
					</div>
					<div>
						<Label htmlFor={roleId}>Role</Label>
						<select
							id={roleId}
							value={role}
							onChange={(e) => setRole(e.target.value as UserRole)}
							className="mt-1 h-8 w-full rounded-md border border-border-bold bg-background px-2 text-sm text-foreground"
						>
							<option value="agent">Agent</option>
							<option value="viewer">Viewer</option>
							<option value="admin">Admin</option>
						</select>
						<FieldMessage id={`${roleId}-hint`} tone="hint">
							Admins assign tickets and manage the workspace. Agents work assigned tickets. Viewers are
							read-only.
						</FieldMessage>
					</div>
					<DialogFooter>
						<Button variant="default" onClick={() => handleOpenChange(false)} disabled={submitting}>
							Cancel
						</Button>
						<Button type="submit" variant="primary" loading={submitting}>
							Add member
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
