"use client";

// Support mailbox: a guided Gmail app-password connect (or any IMAP/SMTP provider),
// the live connection status, and disconnect. Credentials are verified by the
// server before they're saved and are never sent back to the browser.
import { useState } from "react";
import useSWR from "swr";
import { ExternalLink, Mail, RefreshCw, Server, Unlink } from "lucide-react";
import { apiGet, apiSend, ApiRequestError } from "@/lib/api-client";
import { formatRelative } from "@/lib/ticket-meta";
import { Button } from "@/components/ui/button";
import { Lozenge } from "@/components/ui/lozenge";
import { Label, Input, FieldMessage } from "@/components/ui/field";
import { SectionMessage } from "@/components/ui/section-message";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogTrigger, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import type { ConnectMailboxBody, MailboxResponse, MailboxStatus } from "@/types/api";

const ENDPOINT = "/api/settings/email-config";

export function MailboxForm() {
	const { data, error, isLoading, mutate } = useSWR<MailboxResponse>(ENDPOINT, apiGet, {
		revalidateOnFocus: false,
	});
	const [replacing, setReplacing] = useState(false);

	if (isLoading) return <Spinner label="Loading mailbox" />;
	if (error) {
		return (
			<SectionMessage
				appearance="error"
				actions={
					<Button size="sm" onClick={() => mutate()}>
						Retry
					</Button>
				}
			>
				Couldn&apos;t load the mailbox settings.
			</SectionMessage>
		);
	}

	const mailbox = data?.connected ? data.mailbox : null;

	if (mailbox && !replacing) {
		return <MailboxStatusCard mailbox={mailbox} onReplace={() => setReplacing(true)} onChange={() => mutate()} />;
	}

	return (
		<ConnectMailbox
			onCancel={mailbox ? () => setReplacing(false) : undefined}
			onConnected={async (next) => {
				await mutate(next, { revalidate: false });
				setReplacing(false);
			}}
		/>
	);
}

// ---------------------------------------------------------------------------
// Connected state
// ---------------------------------------------------------------------------

function MailboxStatusCard({
	mailbox,
	onReplace,
	onChange,
}: {
	mailbox: MailboxStatus;
	onReplace: () => void;
	onChange: () => void;
}) {
	const { toast } = useToast();
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [disconnecting, setDisconnecting] = useState(false);
	const healthy = mailbox.status === "active";

	const disconnect = async () => {
		setDisconnecting(true);
		try {
			await apiSend<MailboxResponse>(ENDPOINT, "DELETE");
			toast({ tone: "success", title: "Mailbox disconnected" });
			setConfirmOpen(false);
			onChange();
		} catch (err) {
			toast({
				tone: "error",
				title: "Couldn't disconnect the mailbox",
				description: err instanceof ApiRequestError ? err.message : undefined,
			});
		} finally {
			setDisconnecting(false);
		}
	};

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-start gap-3 rounded-lg border border-border p-3">
				<div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-fill text-subtle">
					{mailbox.provider === "gmail" ? <Mail className="size-4" /> : <Server className="size-4" />}
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className="truncate text-sm font-semibold text-foreground">{mailbox.email_address}</span>
						<Lozenge appearance={healthy ? "success" : "removed"}>{healthy ? "Connected" : "Needs attention"}</Lozenge>
					</div>
					<p className="mt-0.5 font-mono text-xs text-subtle">
						{mailbox.provider === "gmail" ? "Gmail" : "IMAP/SMTP"} · IMAP {mailbox.imap_host}:{mailbox.imap_port} · SMTP{" "}
						{mailbox.smtp_host}:{mailbox.smtp_port}
					</p>
					<p className="mt-0.5 text-xs text-subtle">
						{mailbox.last_synced_at ? `Last checked ${formatRelative(mailbox.last_synced_at)}` : "Not checked yet: the next scheduled poll will read new mail."}
					</p>
				</div>
			</div>

			{!healthy && mailbox.last_error && (
				<SectionMessage appearance="error" title="The last check failed">
					{mailbox.last_error} Reconnect with a fresh app password to fix it.
				</SectionMessage>
			)}

			<div className="flex flex-wrap gap-2">
				<Button variant={healthy ? "default" : "primary"} onClick={onReplace}>
					<RefreshCw />
					{healthy ? "Change mailbox" : "Reconnect"}
				</Button>
				<Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
					<DialogTrigger asChild>
						<Button variant="danger">
							<Unlink />
							Disconnect
						</Button>
					</DialogTrigger>
					<DialogContent
						title="Disconnect mailbox?"
						size="sm"
						description="New email will stop creating tickets and replies can't be sent until a mailbox is connected again. The saved credentials are deleted."
					>
						<DialogFooter>
							<Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
							<Button variant="danger" onClick={disconnect} loading={disconnecting} disabled={disconnecting}>
								Disconnect
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Connect flow
// ---------------------------------------------------------------------------

function ConnectMailbox({
	onCancel,
	onConnected,
}: {
	onCancel?: () => void;
	onConnected: (next: MailboxResponse) => Promise<void>;
}) {
	const { toast } = useToast();
	const [formError, setFormError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const submit = async (body: ConnectMailboxBody) => {
		setFormError(null);
		setSubmitting(true);
		try {
			const next = await apiSend<MailboxResponse>(ENDPOINT, "POST", body);
			toast({ tone: "success", title: "Mailbox connected", description: `New email to ${body.email} will become tickets.` });
			await onConnected(next);
		} catch (err) {
			setFormError(err instanceof ApiRequestError ? err.message : "Couldn't connect the mailbox. Try again.");
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Tabs defaultValue="gmail" className="space-y-4">
			<TabsList>
				<TabsTrigger value="gmail">
					<Mail className="size-4" />
					Gmail
				</TabsTrigger>
				<TabsTrigger value="imap_smtp">
					<Server className="size-4" />
					Other provider
				</TabsTrigger>
			</TabsList>

			{formError && <SectionMessage appearance="error">{formError}</SectionMessage>}

			<TabsContent value="gmail">
				<GmailForm submitting={submitting} onSubmit={submit} onCancel={onCancel} />
			</TabsContent>
			<TabsContent value="imap_smtp">
				<CustomForm submitting={submitting} onSubmit={submit} onCancel={onCancel} />
			</TabsContent>
		</Tabs>
	);
}

interface FormProps {
	submitting: boolean;
	onSubmit: (body: ConnectMailboxBody) => Promise<void>;
	onCancel?: () => void;
}

function FormActions({ submitting, onCancel }: Pick<FormProps, "submitting" | "onCancel">) {
	return (
		<div className="flex flex-wrap items-center gap-2 pt-1">
			<Button type="submit" variant="primary" loading={submitting} disabled={submitting}>
				{submitting ? "Checking sign-in…" : "Verify and connect"}
			</Button>
			{onCancel && (
				<Button onClick={onCancel} disabled={submitting}>
					Cancel
				</Button>
			)}
			<span className="text-xs text-subtle">We sign in once to check the details before saving anything.</span>
		</div>
	);
}

const GMAIL_STEPS = [
	{
		title: "Turn on 2-Step Verification",
		body: "Google only issues app passwords to accounts with 2-Step Verification.",
		href: "https://myaccount.google.com/signinoptions/twosv",
		link: "Open security settings",
	},
	{
		title: "Create an app password",
		body: "Name it “IntelliDesk”. Google shows a 16-letter code once: copy it.",
		href: "https://myaccount.google.com/apppasswords",
		link: "Open app passwords",
	},
	{
		title: "Paste it below",
		body: "Use the Gmail address customers write to. IMAP is on by default for Gmail.",
	},
] as const;

function GmailForm({ submitting, onSubmit, onCancel }: FormProps) {
	return (
		<form
			className="space-y-4"
			onSubmit={(e) => {
				e.preventDefault();
				const form = new FormData(e.currentTarget);
				void onSubmit({
					provider: "gmail",
					email: String(form.get("email") ?? "").trim(),
					app_password: String(form.get("app_password") ?? ""),
				});
			}}
		>
			<ol className="grid gap-3 sm:grid-cols-3">
				{GMAIL_STEPS.map((step, i) => (
					<li key={step.title} className="rounded-lg border border-border p-3">
						<div className="flex items-center gap-2">
							<span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
								{i + 1}
							</span>
							<span className="text-sm font-semibold text-foreground">{step.title}</span>
						</div>
						<p className="mt-1.5 text-xs text-subtle">{step.body}</p>
						{"href" in step && (
							<a
								href={step.href}
								target="_blank"
								rel="noopener noreferrer"
								className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
							>
								{step.link}
								<ExternalLink className="size-3" />
							</a>
						)}
					</li>
				))}
			</ol>

			<div className="grid gap-4 sm:grid-cols-2">
				<div>
					<Label htmlFor="gmail-email">Gmail address</Label>
					<Input
						id="gmail-email"
						name="email"
						type="email"
						autoComplete="off"
						placeholder="support@yourcompany.com"
						required
						disabled={submitting}
					/>
				</div>
				<div>
					<Label htmlFor="gmail-app-password">App password</Label>
					<Input
						id="gmail-app-password"
						name="app_password"
						type="password"
						autoComplete="new-password"
						placeholder="xxxx xxxx xxxx xxxx"
						aria-describedby="gmail-app-password-hint"
						required
						disabled={submitting}
					/>
					<FieldMessage id="gmail-app-password-hint">Not your Google password. Spaces are fine.</FieldMessage>
				</div>
			</div>

			<FormActions submitting={submitting} onCancel={onCancel} />
		</form>
	);
}

const selectClass =
	"h-8 w-full rounded-md border border-border-bold bg-background px-2 text-sm text-foreground transition-colors duration-100 hover:bg-fill focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50";

function CustomForm({ submitting, onSubmit, onCancel }: FormProps) {
	return (
		<form
			className="space-y-4"
			onSubmit={(e) => {
				e.preventDefault();
				const form = new FormData(e.currentTarget);
				const username = String(form.get("username") ?? "").trim();
				void onSubmit({
					provider: "imap_smtp",
					email: String(form.get("email") ?? "").trim(),
					username: username || undefined,
					app_password: String(form.get("app_password") ?? ""),
					imap_host: String(form.get("imap_host") ?? "").trim(),
					imap_port: 993,
					smtp_host: String(form.get("smtp_host") ?? "").trim(),
					smtp_port: form.get("smtp_port") === "465" ? 465 : 587,
				});
			}}
		>
			<p className="text-xs text-subtle">
				For Outlook, Zoho, Fastmail or your own mail server. Encrypted connections only: IMAP over TLS on 993, SMTP on
				465 or 587 with STARTTLS.
			</p>

			<div className="grid gap-4 sm:grid-cols-2">
				<div>
					<Label htmlFor="custom-email">Mailbox address</Label>
					<Input id="custom-email" name="email" type="email" autoComplete="off" required disabled={submitting} />
				</div>
				<div>
					<Label htmlFor="custom-username">Sign-in username</Label>
					<Input
						id="custom-username"
						name="username"
						autoComplete="off"
						placeholder="Same as the address"
						disabled={submitting}
					/>
				</div>
				<div className="sm:col-span-2">
					<Label htmlFor="custom-password">Password or app password</Label>
					<Input
						id="custom-password"
						name="app_password"
						type="password"
						autoComplete="new-password"
						required
						disabled={submitting}
					/>
				</div>
				<div>
					<Label htmlFor="custom-imap-host">IMAP server</Label>
					<Input
						id="custom-imap-host"
						name="imap_host"
						placeholder="imap.example.com"
						aria-describedby="custom-imap-hint"
						required
						disabled={submitting}
					/>
					<FieldMessage id="custom-imap-hint">Port 993 (TLS)</FieldMessage>
				</div>
				<div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
					<div>
						<Label htmlFor="custom-smtp-host">SMTP server</Label>
						<Input id="custom-smtp-host" name="smtp_host" placeholder="smtp.example.com" required disabled={submitting} />
					</div>
					<div>
						<Label htmlFor="custom-smtp-port">Port</Label>
						<select id="custom-smtp-port" name="smtp_port" defaultValue="587" className={selectClass} disabled={submitting}>
							<option value="587">587</option>
							<option value="465">465</option>
						</select>
					</div>
				</div>
			</div>

			<FormActions submitting={submitting} onCancel={onCancel} />
		</form>
	);
}
