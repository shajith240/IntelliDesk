// Settings page (admins only): support mailbox connection, polling notes, and the member list.
import { Suspense } from "react";
import { Settings } from "@/components/settings/Settings";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Settings" };

function SettingsSkeleton() {
	return (
		<div className="max-w-4xl space-y-6 px-4 sm:px-6 pb-10">
			<div className="space-y-3">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-4 w-96" />
			</div>
			{[1, 2, 3].map((i) => (
				<div key={i} className="rounded-lg border border-border bg-raised p-4">
					<Skeleton className="h-6 w-40 mb-4" />
					<Skeleton className="h-4 w-full" />
				</div>
			))}
		</div>
	);
}

export default function SettingsPage() {
	return (
		<Suspense fallback={<SettingsSkeleton />}>
			<Settings />
		</Suspense>
	);
}
