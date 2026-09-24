"use client";

// Sidebar navigation with organization name, nav groups (filtered by role), and new ticket badge.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";
import { useTeam, useDashboard } from "@/hooks/use-api";
import { NAV_GROUPS, isNavActive } from "./nav";
import { useShell } from "./shell-context";

interface SidebarContentProps {
	onNavigate?: () => void;
}

export function SidebarContent({ onNavigate }: SidebarContentProps) {
	const pathname = usePathname();
	const { data: session } = useSession();
	const { data: team, isLoading: teamLoading, error: teamError } = useTeam();
	const { data: dashboard } = useDashboard();
	const { setShortcutsOpen } = useShell();
	const isAdmin = session?.user.role === "admin";
	const newCount = dashboard?.tickets.by_status.New;

	const orgName = teamError ? "Workspace" : team?.organization.name;

	return (
		<div className="flex h-full flex-col">
			<div className="px-3 pt-3 pb-2">
				<div className="flex items-center gap-2 rounded-md p-1.5">
					<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
						{orgName ? orgName.charAt(0).toUpperCase() : ""}
					</span>
					<div className="min-w-0">
						{teamLoading && !teamError ? (
							<Skeleton className="h-4 w-28" />
						) : (
							<p className="truncate text-sm font-semibold text-foreground">{orgName ?? "Workspace"}</p>
						)}
						<p className="text-xs text-subtlest">Support workspace</p>
					</div>
				</div>
			</div>
			<nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-2">
				{NAV_GROUPS.map((group) => {
					const items = group.items.filter((item) => !item.adminOnly || isAdmin);
					if (items.length === 0) return null;
					return (
						<div key={group.label}>
							<p className="px-2 pb-1 pt-4 text-[11px] font-bold uppercase tracking-[0.02em] text-subtlest first:pt-1">
								{group.label}
							</p>
							<ul>
								{items.map((item) => {
									const active = isNavActive(pathname, item.href);
									const Icon = item.icon;
									const showBadge = item.href === "/dashboard/queue" && typeof newCount === "number" && newCount > 0;
									return (
										<li key={item.href}>
											<Link
												href={item.href}
												aria-current={active ? "page" : undefined}
												onClick={onNavigate}
												className={cn(
													"group relative flex h-8 items-center gap-2 rounded-md px-2 text-sm text-subtle transition-colors duration-100 hover:bg-fill-hover hover:text-foreground",
													active && "bg-selected font-medium text-selected-foreground hover:bg-selected hover:text-selected-foreground",
												)}
											>
												{active && (
													<span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-primary" />
												)}
												<Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
												<span className="truncate">{item.label}</span>
												{showBadge && (
													<span className="ml-auto">
														<Badge tone="primary">
															{newCount}
															<span className="sr-only"> new tickets</span>
														</Badge>
													</span>
												)}
											</Link>
										</li>
									);
								})}
							</ul>
						</div>
					);
				})}
			</nav>
			<div className="border-t border-border p-3">
				<button
					type="button"
					onClick={() => setShortcutsOpen(true)}
					className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-subtle transition-colors duration-100 hover:bg-fill-hover hover:text-foreground"
				>
					<Keyboard className="h-4 w-4 shrink-0" aria-hidden="true" />
					<span>Keyboard shortcuts</span>
					<span className="ml-auto">
						<Kbd>?</Kbd>
					</span>
				</button>
			</div>
		</div>
	);
}
