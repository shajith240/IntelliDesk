// Command Center: the first screen after login — metrics, SLA risk, recent activity, and the open work queue.
import { Suspense } from "react";
import { CommandCenter } from "@/components/command-center/CommandCenter";
import { CommandCenterFallback } from "@/components/command-center/CommandCenterFallback";

export const metadata = { title: "Command Center" };

export default function DashboardPage() {
	return (
		<Suspense fallback={<CommandCenterFallback />}>
			<CommandCenter />
		</Suspense>
	);
}
