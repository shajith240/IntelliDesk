"use client";

// Theme selector dropdown (light, dark, system).
import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function subscribeNoop() {
	return () => {};
}

function useMounted(): boolean {
	// Detect client mount to avoid hydration mismatch; returns false on server.
	return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

export function ThemeMenu() {
	const { theme, setTheme } = useTheme();
	const mounted = useMounted();

	const Icon = !mounted ? Monitor : theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

	return (
		<DropdownMenu>
			<Tooltip content="Theme">
				<DropdownMenuTrigger asChild>
					<Button variant="subtle" size="icon" aria-label="Change theme">
						<Icon aria-hidden="true" />
					</Button>
				</DropdownMenuTrigger>
			</Tooltip>
			<DropdownMenuContent align="end">
				<DropdownMenuLabel>Theme</DropdownMenuLabel>
				<DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
					<DropdownMenuRadioItem value="light">
						<Sun aria-hidden="true" />
						Light
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="dark">
						<Moon aria-hidden="true" />
						Dark
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="system">
						<Monitor aria-hidden="true" />
						System
					</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
