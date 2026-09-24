"use client";

// Settings: mailbox connection, polling notes, and members; non-admins see an "Admins only" state.
import { useSession } from "next-auth/react";
import { Mail, Clock, Users, Lock } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Panel, PanelHeader, PanelBody } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { MailboxForm } from "./MailboxForm";
import { TeamMembersList } from "./TeamMembersList";

export function Settings() {
	const { data: session, status } = useSession();

	if (status === "loading") {
		return (
			<div className="max-w-4xl space-y-6 px-4 sm:px-6 pb-10">
				<div className="space-y-3">
					<Skeleton className="h-8 w-48" />
					<Skeleton className="h-4 w-96" />
				</div>
				{[1, 2].map((i) => (
					<div key={i} className="rounded-lg border border-border bg-raised p-4">
						<Skeleton className="h-6 w-40 mb-4" />
						<Skeleton className="h-4 w-full" />
					</div>
				))}
			</div>
		);
	}

	const isAdmin = session?.user?.role === "admin";

	if (!isAdmin) {
		return (
			<div className="pb-10">
				<PageHeader
					breadcrumbs={[
						{ label: "Support", href: "/dashboard" },
						{ label: "Settings" },
					]}
					title="Settings"
					description="Mailbox connection and workspace members."
				/>
				<div className="px-4 sm:px-6">
					<EmptyState
						icon={Lock}
						title="Admins only"
						description="Ask a workspace admin to change mailbox or team settings."
					/>
				</div>
			</div>
		);
	}

	return (
		<div className="pb-10">
			<PageHeader
				breadcrumbs={[
					{ label: "Support", href: "/dashboard" },
					{ label: "Settings" },
				]}
				title="Settings"
				description="Mailbox connection and workspace members."
			/>
			<div className="max-w-4xl space-y-6 px-4 sm:px-6">
				<Panel>
					<PanelHeader
						title="Support mailbox"
						icon={<Mail />}
						description="IntelliDesk reads new customer email over IMAP and sends approved replies over SMTP."
					/>
					<PanelBody>
						<MailboxForm />
					</PanelBody>
				</Panel>

				<Panel>
					<PanelHeader
						title="Scheduled email polling"
						icon={<Clock />}
						description="Email polling configuration."
					/>
					<PanelBody className="space-y-3">
						<p className="text-sm text-foreground">
							In production, Vercel Cron calls <code className="rounded-sm bg-fill px-1 font-mono text-xs">/api/emails/poll</code> with the{" "}
							<code className="rounded-sm bg-fill px-1 font-mono text-xs">CRON_SECRET</code>. The schedule is set in{" "}
							<code className="rounded-sm bg-fill px-1 font-mono text-xs">vercel.json</code> (daily on the Hobby plan; every 5–10 minutes on Pro). Polling is safe to run twice: already-processed messages are skipped.
						</p>
					</PanelBody>
				</Panel>

				<Panel>
					<PanelHeader title="Members" icon={<Users />} />
					<PanelBody>
						<TeamMembersList />
					</PanelBody>
				</Panel>
			</div>
		</div>
	);
}
