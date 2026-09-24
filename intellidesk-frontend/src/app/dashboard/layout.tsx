// Dashboard layout: app shell for every /dashboard route, plus the ticket workspace that opens from ?ticket=<id>.
import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { TicketWorkspace } from "@/components/ticket-workspace/TicketWorkspace";

export const dynamic = "force-dynamic";

export default function DashboardLayout({ children }: { children: ReactNode }) {
	return (
		<AppShell>
			{children}
			<Suspense fallback={null}>
				<TicketWorkspace />
			</Suspense>
		</AppShell>
	);
}
