"use client";

// User profile dropdown showing name, email, role, and sign out option.
import { signOut, useSession } from "next-auth/react";
import { Keyboard, LogOut } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Lozenge } from "@/components/ui/lozenge";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useShell } from "./ShellContext";

function capitalize(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

export function UserMenu() {
	const { data: session, status } = useSession();
	const { setShortcutsOpen } = useShell();
	const user = session?.user;

	if (status === "loading" || !user) {
		return <Skeleton className="h-8 w-8 rounded-full" />;
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button type="button" aria-label="Account menu" className="rounded-full p-0.5 hover:bg-fill">
					<Avatar name={user.name || user.email} size="md" />
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
	);
}
