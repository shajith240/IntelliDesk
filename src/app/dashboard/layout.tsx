// Dashboard layout: app shell for every /dashboard route, plus the ticket workspace that opens from ?ticket=<id>.
import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { TicketWorkspace } from "@/features/ticket-workspace/components/ticket-workspace";

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
