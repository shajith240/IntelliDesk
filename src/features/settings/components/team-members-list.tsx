"use client";

// Team members: admins get full management (add, change role, (de)activate); everyone else sees a read-only list.
import { useState } from "react";
import { useSession } from "next-auth/react";
import { MoreHorizontal, Plus } from "lucide-react";
import { useTeam, useRefreshAll } from "@/hooks/use-api";
import { apiSend, ApiRequestError } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Lozenge } from "@/components/ui/lozenge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubTrigger,
	DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { formatRelative } from "@/lib/ticket-meta";
import { AddMemberDialog } from "./add-member-dialog";
import { DeactivateMemberDialog } from "./deactivate-member-dialog";
import type { TeamMember } from "@/types/api";
import type { UserRole } from "@/types";

function roleLabel(role: UserRole): string {
	return role === "admin" ? "Admin" : role === "agent" ? "Agent" : "Viewer";
}

function LoadingTable({ columns }: { columns: number }) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					{Array.from({ length: columns }).map((_, i) => (
						<TableHead key={i}>
							<Skeleton className="h-4 w-16" />
						</TableHead>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{[1, 2, 3].map((row) => (
					<TableRow key={row}>
						<TableCell>
							<div className="flex items-center gap-2">
								<Skeleton className="h-6 w-6 rounded-full" />
								<Skeleton className="h-4 w-32" />
							</div>
						</TableCell>
						{Array.from({ length: columns - 1 }).map((_, i) => (
							<TableCell key={i}>
								<Skeleton className="h-4 w-20" />
							</TableCell>
						))}
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

export function TeamMembersList() {
	const { data: session } = useSession();
	const isAdmin = session?.user.role === "admin";
	const { data, error, isLoading, mutate } = useTeam({ includeInactive: isAdmin });
	const refreshAll = useRefreshAll();
	const { toast } = useToast();

	const [addOpen, setAddOpen] = useState(false);
	const [deactivateTarget, setDeactivateTarget] = useState<TeamMember | null>(null);
	const [pendingId, setPendingId] = useState<string | null>(null);

	const handleRefresh = async () => {
		await mutate();
		void refreshAll();
	};

	const handleRoleChange = async (member: TeamMember, role: UserRole) => {
		if (role === member.role) return;
		setPendingId(member.id);
		try {
			await apiSend(`/api/team/${member.id}`, "PATCH", { role });
			toast({ tone: "success", title: `${member.name} is now ${roleLabel(role).toLowerCase()}` });
			await handleRefresh();
		} catch (err) {
			toast({
				tone: "error",
				title: "Couldn't change role",
				description: err instanceof ApiRequestError ? err.message : "Something went wrong.",
			});
		} finally {
			setPendingId(null);
		}
	};

	const handleReactivate = async (member: TeamMember) => {
		setPendingId(member.id);
		try {
			await apiSend(`/api/team/${member.id}`, "PATCH", { is_active: true });
			toast({ tone: "success", title: `${member.name} reactivated` });
			await handleRefresh();
		} catch (err) {
			toast({
				tone: "error",
				title: "Couldn't reactivate member",
				description: err instanceof ApiRequestError ? err.message : "Something went wrong.",
			});
		} finally {
			setPendingId(null);
		}
	};

	if (isLoading) {
		return <LoadingTable columns={isAdmin ? 7 : 3} />;
	}

	if (error) {
		return <ErrorState message="Failed to load team members" onRetry={() => mutate()} size="sm" />;
	}

	const members = data?.members ?? [];

	if (!isAdmin) {
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
										{roleLabel(member.role)}
									</Lozenge>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex justify-end">
				<Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
					<Plus aria-hidden="true" />
					Add member
				</Button>
			</div>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Name</TableHead>
						<TableHead>Email</TableHead>
						<TableHead>Role</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Availability</TableHead>
						<TableHead>Last login</TableHead>
						<TableHead className="sr-only">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{members.map((member) => {
						const isSelf = member.id === session?.user.id;
						const isPending = pendingId === member.id;
						// Changing your own role away from admin would lock you out; the server refuses it too.
						const blockSelfDemotion = isSelf && member.role === "admin";

						return (
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
										{roleLabel(member.role)}
									</Lozenge>
								</TableCell>
								<TableCell>
									<Lozenge appearance={member.is_active ? "success" : "removed"}>
										{member.is_active ? "Active" : "Deactivated"}
									</Lozenge>
								</TableCell>
								<TableCell>
									{member.role === "viewer" ? (
										<span className="text-sm text-subtlest">—</span>
									) : (
										<Lozenge appearance={member.is_available ? "success" : "default"}>
											{member.is_available ? "Available" : "Away"}
										</Lozenge>
									)}
								</TableCell>
								<TableCell className="text-sm text-subtle">{formatRelative(member.last_login)}</TableCell>
								<TableCell>
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button
												variant="subtle"
												size="icon-sm"
												aria-label={`Actions for ${member.name}`}
												loading={isPending}
											>
												<MoreHorizontal aria-hidden="true" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuSub>
												<DropdownMenuSubTrigger disabled={isPending}>Change role</DropdownMenuSubTrigger>
												<DropdownMenuSubContent>
													<DropdownMenuRadioGroup
														value={member.role}
														onValueChange={(value) => void handleRoleChange(member, value as UserRole)}
													>
														<DropdownMenuRadioItem value="admin">Admin</DropdownMenuRadioItem>
														<DropdownMenuRadioItem value="agent" disabled={blockSelfDemotion}>
															Agent
														</DropdownMenuRadioItem>
														<DropdownMenuRadioItem value="viewer" disabled={blockSelfDemotion}>
															Viewer
														</DropdownMenuRadioItem>
													</DropdownMenuRadioGroup>
												</DropdownMenuSubContent>
											</DropdownMenuSub>
											<DropdownMenuSeparator />
											{member.is_active ? (
												<DropdownMenuItem
													disabled={isPending || isSelf}
													onClick={() => setDeactivateTarget(member)}
												>
													Deactivate
												</DropdownMenuItem>
											) : (
												<DropdownMenuItem disabled={isPending} onClick={() => void handleReactivate(member)}>
													Reactivate
												</DropdownMenuItem>
											)}
										</DropdownMenuContent>
									</DropdownMenu>
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>

			<AddMemberDialog open={addOpen} onOpenChange={setAddOpen} onAdded={() => void handleRefresh()} />
			{deactivateTarget && (
				<DeactivateMemberDialog
					member={deactivateTarget}
					open={!!deactivateTarget}
					onOpenChange={(open) => {
						if (!open) setDeactivateTarget(null);
					}}
					onSuccess={() => {
						setDeactivateTarget(null);
						void handleRefresh();
					}}
				/>
			)}
		</div>
	);
}
