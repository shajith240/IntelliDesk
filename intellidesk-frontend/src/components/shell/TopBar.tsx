"use client";

// App header bar with logo, search, sync status, refresh, theme, and user menu.
import { useState } from "react";
import Link from "next/link";
import { PanelLeft, RotateCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { useRefreshAll } from "@/hooks/useApi";
import { Logo } from "./Logo";
import { SyncIndicator } from "./SyncIndicator";
import { ThemeMenu } from "./ThemeMenu";
import { UserMenu } from "./UserMenu";
import { useShell } from "./ShellContext";

export function TopBar() {
	const { toggleSidebar, setPaletteOpen } = useShell();
	const refreshAll = useRefreshAll();
	const [refreshing, setRefreshing] = useState(false);

	const handleRefresh = () => {
		setRefreshing(true);
		const result = refreshAll();
		Promise.resolve(result).finally(() => setRefreshing(false));
	};

	return (
		<header className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b border-border bg-background px-2 sm:gap-2 sm:px-3">
			<Tooltip content="Toggle sidebar" shortcut="[">
				<Button variant="subtle" size="icon" aria-label="Toggle sidebar" onClick={toggleSidebar}>
					<PanelLeft aria-hidden="true" />
				</Button>
			</Tooltip>
			<Link href="/dashboard" className="rounded-md px-1.5 py-1 hover:bg-fill">
				<span className="hidden sm:inline">
					<Logo />
				</span>
				<span className="sm:hidden">
					<Logo markOnly />
				</span>
			</Link>

			<div className="mx-2 hidden min-w-0 flex-1 justify-center sm:flex">
				<button
					type="button"
					onClick={() => setPaletteOpen(true)}
					aria-label="Search tickets and pages"
					aria-keyshortcuts="/ Control+K Meta+K"
					className="flex h-8 w-full max-w-[560px] items-center gap-2 rounded-md border border-border-bold bg-background px-2 text-left text-sm text-subtlest transition-colors duration-100 hover:bg-fill focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
				>
					<Search className="h-4 w-4 shrink-0" aria-hidden="true" />
					<span className="flex-1 truncate">Search tickets, pages, actions</span>
					<Kbd>/</Kbd>
				</button>
			</div>
			<div className="flex-1 sm:hidden" />
			<Tooltip content="Search">
				<Button
					variant="subtle"
					size="icon"
					aria-label="Search tickets and pages"
					onClick={() => setPaletteOpen(true)}
					className="sm:hidden"
				>
					<Search aria-hidden="true" />
				</Button>
			</Tooltip>

			<div className="flex items-center gap-1">
				<SyncIndicator />
				<Tooltip content="Refresh data">
					<Button
						variant="subtle"
						size="icon"
						aria-label="Refresh data"
						aria-busy={refreshing || undefined}
						onClick={handleRefresh}
					>
						<RotateCw aria-hidden="true" className={cn(refreshing && "animate-spin")} />
					</Button>
				</Tooltip>
				<ThemeMenu />
				<UserMenu />
			</div>
		</header>
	);
}
