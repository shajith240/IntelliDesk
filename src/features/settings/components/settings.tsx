"use client";

// Settings: mailbox connection, polling notes, and members; non-admins see an "Admins only" state.
import { useSession } from "next-auth/react";
import { Mail, Clock, Users, Lock, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Panel, PanelHeader, PanelBody } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { MailboxForm } from "./mailbox-form";
import { AiSettings } from "./ai-settings";
import { TeamMembersList } from "./team-members-list";

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
					description="Mailbox, AI and workspace members."
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
				description="Mailbox, AI and workspace members."
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
						title="AI"
						icon={<Sparkles />}
						description="The model that classifies email and drafts replies from your knowledge base."
					/>
					<PanelBody>
						<AiSettings />
					</PanelBody>
				</Panel>

				<Panel>
					<PanelHeader
						title="Scheduled email polling"
						icon={<Clock />}
						description="How new email becomes tickets."
					/>
					<PanelBody className="space-y-3">
						<p className="text-sm text-foreground">
							A GitHub Actions schedule calls <code className="rounded-sm bg-fill px-1 font-mono text-xs">/api/emails/poll</code> every 10 minutes with the 
							<code className="rounded-sm bg-fill px-1 font-mono text-xs">CRON_SECRET</code>, plus a daily Vercel Cron as a fallback. Each run stores new mail before marking it
							read, then processes the queue, so a run that times out loses nothing and overlapping runs never double-process a
							message.
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
