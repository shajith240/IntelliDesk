"use client";

// Team members table showing name, email, and role (admin/agent/viewer) with loading and error states.
import { useTeam } from "@/hooks/use-api";
import { Avatar } from "@/components/ui/avatar";
import { Lozenge } from "@/components/ui/lozenge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";

export function TeamMembersList() {
	const { data, error, isLoading, mutate } = useTeam();

	if (isLoading) {
		return (
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Name</TableHead>
						<TableHead>Email</TableHead>
						<TableHead>Role</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{[1, 2, 3].map((i) => (
						<TableRow key={i}>
							<TableCell>
								<div className="flex items-center gap-2">
									<Skeleton className="h-6 w-6 rounded-full" />
									<Skeleton className="h-4 w-32" />
								</div>
							</TableCell>
							<TableCell>
								<Skeleton className="h-4 w-40" />
							</TableCell>
							<TableCell>
								<Skeleton className="h-5 w-16" />
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		);
	}

	if (error) {
		return (
			<ErrorState
				message="Failed to load team members"
				onRetry={() => mutate()}
				size="sm"
			/>
		);
	}

	const members = data?.members ?? [];

	return (
		<div className="space-y-4">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Name</TableHead>
						<TableHead>Email</TableHead>
						<TableHead>Role</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{members.map((member) => (
						<TableRow key={member.id}>
							<TableCell>
								<div className="flex items-center gap-2">
									<Avatar name={member.name} size="xs" />
									<span className="text-sm text-foreground">{member.name}</span>
								</div>
							</TableCell>
							<TableCell className="text-sm text-subtle">{member.email}</TableCell>
							<TableCell>
								<Lozenge appearance={member.role === "admin" ? "new" : "default"}>
									{member.role === "admin" ? "Admin" : member.role === "agent" ? "Agent" : "Viewer"}
								</Lozenge>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
			<p className="text-xs text-subtlest">
				Members are managed in the database for now; invites aren&apos;t available in the app.
			</p>
		</div>
	);
}
