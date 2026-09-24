"use client";

// Main app shell layout: header, sidebar/mobile nav, and main content area with command palette.
import { Suspense, useEffect } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { TopBar } from "./TopBar";
import { SidebarContent } from "./SidebarContent";
import { CommandPalette } from "./CommandPalette";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { ShellProvider, useShell } from "./ShellContext";

function ShellFrame({ children }: { children: ReactNode }) {
	const { sidebarCollapsed, mobileNavOpen, setMobileNavOpen } = useShell();

	useEffect(() => {
		const mql = window.matchMedia("(min-width: 1024px)");
		const onChange = (e: MediaQueryListEvent) => {
			if (e.matches) setMobileNavOpen(false);
		};
		mql.addEventListener("change", onChange);
		return () => mql.removeEventListener("change", onChange);
	}, [setMobileNavOpen]);

	return (
		<>
			<a
				href="#main-content"
				className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[70] focus:rounded-md focus:bg-overlay focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary focus:shadow-overlay"
			>
				Skip to main content
			</a>
			<TopBar />
			<div className="flex">
				<aside
					aria-label="Sidebar"
					className={cn(
						"sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 border-r border-border bg-sunken lg:block",
						sidebarCollapsed && "lg:hidden",
					)}
				>
					<SidebarContent />
				</aside>
				<Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
					<SheetContent side="left" title="Navigation" hideTitle className="bg-sunken p-0 lg:hidden">
						<SidebarContent onNavigate={() => setMobileNavOpen(false)} />
					</SheetContent>
				</Sheet>
				<main id="main-content" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
					{children}
				</main>
			</div>
			<Suspense fallback={null}>
				<CommandPalette />
			</Suspense>
			<KeyboardShortcuts />
		</>
	);
}

export function AppShell({ children }: { children: ReactNode }) {
	return (
		<ShellProvider>
			<ShellFrame>{children}</ShellFrame>
		</ShellProvider>
	);
}
