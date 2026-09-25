// Command Center: the first screen after login — metrics, SLA risk, recent activity, and the open work queue.
import { Suspense } from "react";
import { requirePageRole } from "@/server/auth/page-guard";
import { CommandCenter } from "@/features/command-center/components/command-center";
import { CommandCenterFallback } from "@/features/command-center/components/command-center-fallback";

export const metadata = { title: "Command Center" };

export default async function DashboardPage() {
	await requirePageRole("admin", "viewer");
	return (
		<Suspense fallback={<CommandCenterFallback />}>
			<CommandCenter />
		</Suspense>
	);
}
