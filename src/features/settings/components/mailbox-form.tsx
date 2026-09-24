"use client";

// Email mailbox configuration form: IMAP/SMTP credentials with connect/disconnect actions, admin-only.
import { useRef, useState } from "react";
import useSWR from "swr";
import { Unlink } from "lucide-react";
import { apiGet, apiSend, ApiRequestError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Lozenge } from "@/components/ui/lozenge";
import { Label, Input, FieldMessage } from "@/components/ui/field";
import { SectionMessage } from "@/components/ui/section-message";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogTrigger, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

interface ConfigResponse {
	connected: boolean;
	config?: {
		email: string;
		imap_host: string;
		imap_port: number;
		smtp_host: string;
		smtp_port: number;
		password_set: boolean;
	};
}

export function MailboxForm() {
	const { data: response, error: loadError, isLoading, mutate } = useSWR<ConfigResponse>(
		"/api/settings/email-config",
		apiGet,
		{ revalidateOnFocus: false }
	);

	const { toast } = useToast();
	const formRef = useRef<HTMLFormElement>(null);
	const [formError, setFormError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isDisconnecting, setIsDisconnecting] = useState(false);
	const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);

	const connected = response?.connected ?? false;
	const config = response?.config;

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setFormError(null);
		setIsSubmitting(true);

		const formData = new FormData(e.currentTarget);
		const email = formData.get("email") as string;
		const password = formData.get("password") as string;
		const imap_host = formData.get("imap_host") as string;
		const imap_port = parseInt(formData.get("imap_port") as string, 10);
		const smtp_host = formData.get("smtp_host") as string;
		const smtp_port = parseInt(formData.get("smtp_port") as string, 10);

		// Validation
		if (!email || !password) {
			setFormError("Email and password are required");
			setIsSubmitting(false);
			return;
		}

		if (imap_port < 1 || imap_port > 65535 || smtp_port < 1 || smtp_port > 65535) {
			setFormError("Port numbers must be between 1 and 65535");
			setIsSubmitting(false);
			return;
		}

		try {
			await apiSend<{ message: string }>("/api/settings/email-config", "POST", {
				email,
				password,
				imap_host,
				imap_port,
				smtp_host,
				smtp_port,
			});

			toast({ tone: "success", title: "Email configuration saved" });
			await mutate();
		} catch (err) {
			if (err instanceof ApiRequestError) {
				if (err.status === 403) {
					setFormError("Only admins can change the mailbox.");
				} else {
					setFormError(err.message);
				}
			} else {
				setFormError("Failed to save email configuration");
			}
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleDisconnect = async () => {
		setIsDisconnecting(true);
		try {
			await apiSend<{ message: string }>("/api/settings/email-config", "DELETE");
			toast({ tone: "success", title: "Mailbox disconnected" });
			setDisconnectDialogOpen(false);
			await mutate();
		} catch (err) {
			if (err instanceof ApiRequestError) {
				toast({ tone: "error", title: "Failed to disconnect mailbox", description: err.message });
			} else {
				toast({ tone: "error", title: "Failed to disconnect mailbox" });
			}
		} finally {
			setIsDisconnecting(false);
		}
	};

	if (isLoading) {
		return <Spinner label="Loading mailbox configuration" />;
	}

	if (loadError) {
		return (
			<SectionMessage appearance="error">
				Failed to load email configuration. Please try again.
			</SectionMessage>
		);
	}

	return (
		<div className="space-y-4">
			{/* Connection Status */}
			<div className="flex items-center gap-2">
				<span className="text-xs font-semibold text-subtle">Status:</span>
				<Lozenge appearance={connected ? "success" : "default"}>
					{connected ? "Connected" : "Not connected"}
				</Lozenge>
				{connected && config && (
					<div className="text-xs text-subtle font-mono ml-2">
						{config.email} • IMAP: {config.imap_host}:{config.imap_port} • SMTP: {config.smtp_host}:{config.smtp_port}
					</div>
				)}
			</div>

			{/* Form */}
			<form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
				{formError && <SectionMessage appearance="error">{formError}</SectionMessage>}

				{/* Email Address */}
				<div>
					<Label htmlFor="email">Email address</Label>
					<Input
						id="email"
						name="email"
						type="email"
						placeholder="your-email@gmail.com"
						defaultValue={config?.email ?? ""}
						required
						disabled={isSubmitting}
					/>
				</div>

				{/* Password */}
				<div>
					<Label htmlFor="password">App password</Label>
					<Input
						id="password"
						name="password"
						type="password"
						autoComplete="new-password"
						placeholder={config?.password_set ? "••••••••" : "Enter app password"}
						disabled={isSubmitting}
					/>
					{config?.password_set && (
						<FieldMessage id="password-hint" tone="hint">
							Leave blank to keep the saved password
						</FieldMessage>
					)}
				</div>

				{/* IMAP Configuration */}
				<div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
					<div>
						<Label htmlFor="imap_host">IMAP host</Label>
						<Input
							id="imap_host"
							name="imap_host"
							placeholder="imap.gmail.com"
							defaultValue={config?.imap_host ?? "imap.gmail.com"}
							disabled={isSubmitting}
						/>
					</div>
					<div>
						<Label htmlFor="imap_port">IMAP port</Label>
						<Input
							id="imap_port"
							name="imap_port"
							type="number"
							min="1"
							max="65535"
							placeholder="993"
							defaultValue={config?.imap_port ?? "993"}
							disabled={isSubmitting}
						/>
					</div>
				</div>

				{/* SMTP Configuration */}
				<div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
					<div>
						<Label htmlFor="smtp_host">SMTP host</Label>
						<Input
							id="smtp_host"
							name="smtp_host"
							placeholder="smtp.gmail.com"
							defaultValue={config?.smtp_host ?? "smtp.gmail.com"}
							disabled={isSubmitting}
						/>
					</div>
					<div>
						<Label htmlFor="smtp_port">SMTP port</Label>
						<Input
							id="smtp_port"
							name="smtp_port"
							type="number"
							min="1"
							max="65535"
							placeholder="587"
							defaultValue={config?.smtp_port ?? "587"}
							disabled={isSubmitting}
						/>
					</div>
				</div>

				{/* Submit Button */}
				<div className="flex gap-2 pt-2">
					<Button type="submit" variant="primary" loading={isSubmitting} disabled={isSubmitting}>
						Save configuration
					</Button>

					{connected && (
						<Dialog open={disconnectDialogOpen} onOpenChange={setDisconnectDialogOpen}>
							<DialogTrigger asChild>
								<Button variant="danger" size="md">
									<Unlink />
									Disconnect mailbox
								</Button>
							</DialogTrigger>
							<DialogContent title="Disconnect mailbox?" size="sm" description="New email will stop creating tickets and replies can't be sent until a mailbox is connected again.">
								<DialogFooter>
									<Button variant="default" onClick={() => setDisconnectDialogOpen(false)}>
										Cancel
									</Button>
									<Button variant="danger" onClick={handleDisconnect} loading={isDisconnecting} disabled={isDisconnecting}>
										Disconnect
									</Button>
								</DialogFooter>
							</DialogContent>
						</Dialog>
					)}
				</div>
			</form>
		</div>
	);
}
