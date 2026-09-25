"use client";

// User profile dropdown: name/email/role, availability toggle, change password, shortcuts, sign out.
import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { Keyboard, KeyRound, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Lozenge } from "@/components/ui/lozenge";
import { useToast } from "@/components/ui/toast";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMe } from "@/hooks/use-api";
import { apiSend, ApiRequestError } from "@/lib/api-client";
import type { MeResponse } from "@/types/api";
import { ChangePasswordDialog } from "./change-password-dialog";
import { useShell } from "./shell-context";

function capitalize(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

export function UserMenu() {
	const { data: session, status } = useSession();
	const { setShortcutsOpen } = useShell();
	const { toast } = useToast();
	const user = session?.user;
	const canSetAvailability = user?.role === "admin" || user?.role === "agent";
	const { data: me, mutate: mutateMe } = useMe();
	const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
	const [savingAvailability, setSavingAvailability] = useState(false);

	if (status === "loading" || !user) {
		return <Skeleton className="h-8 w-8 rounded-full" />;
	}

	const isAvailable = me?.me.is_available ?? false;

	const handleAvailabilityChange = async (next: boolean) => {
		setSavingAvailability(true);
		try {
			const result = await apiSend<MeResponse>("/api/me", "PATCH", { is_available: next });
			await mutateMe(result, { revalidate: false });
			toast({
				tone: "success",
				title: next ? "You're available for new tickets" : "You're no longer available for new tickets",
			});
		} catch (error) {
			toast({
				tone: "error",
				title: "Couldn't update availability",
				description: error instanceof ApiRequestError ? error.message : "Something went wrong.",
			});
		} finally {
			setSavingAvailability(false);
		}
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button type="button" aria-label="Account menu" className="relative rounded-full p-0.5 hover:bg-fill">
						<Avatar name={user.name || user.email} size="md" />
						{canSetAvailability && (
							<span
								aria-hidden="true"
								className={cn(
									"absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background",
									isAvailable ? "bg-success" : "bg-subtlest",
								)}
							/>
						)}
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="min-w-[240px]">
					<div className="px-3 py-2">
						<p className="text-sm font-semibold text-foreground">{user.name || user.email}</p>
						<p className="truncate text-xs text-subtlest">{user.email}</p>
						<div className="mt-1.5">
							<Lozenge>{capitalize(user.role)}</Lozenge>
						</div>
					</div>
					<DropdownMenuSeparator />
					{canSetAvailability && (
						<>
							<DropdownMenuCheckboxItem
								checked={isAvailable}
								onCheckedChange={(checked) => void handleAvailabilityChange(checked)}
								disabled={savingAvailability || !me}
							>
								Available for new tickets
							</DropdownMenuCheckboxItem>
							<DropdownMenuSeparator />
						</>
					)}
					<DropdownMenuItem onSelect={() => setPasswordDialogOpen(true)}>
						<KeyRound aria-hidden="true" />
						Change password
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => setShortcutsOpen(true)}>
						<Keyboard aria-hidden="true" />
						Keyboard shortcuts
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem onSelect={() => signOut({ callbackUrl: "/login" })}>
						<LogOut aria-hidden="true" />
						Sign out
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<ChangePasswordDialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen} />
		</>
	);
}
