"use client";

// Command palette for searching tickets and navigating to app sections.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import useSWR from "swr";
import { useTheme } from "next-themes";
import { Keyboard, Moon, RotateCw, Search, Sun } from "lucide-react";
import { useSession } from "next-auth/react";
import { apiGet } from "@/lib/api-client";
import { ticketsKey, useRefreshAll } from "@/hooks/use-api";
import type { TicketListResponse } from "@/types/api";
import { PriorityIcon } from "@/components/ui/priority-icon";
import { StatusLozenge } from "@/components/ui/lozenge";
import { Spinner } from "@/components/ui/spinner";
import { Kbd } from "@/components/ui/kbd";
import { useTicketParam } from "@/hooks/use-ticket-param";
import { NAV_GROUPS } from "./nav";
import { useShell } from "./shell-context";

const ITEM_CLASS =
	"flex h-10 cursor-default select-none items-center gap-3 rounded-md px-2 text-sm text-foreground data-[selected=true]:bg-selected data-[selected=true]:text-selected-foreground";

const GROUP_HEADING_CLASS =
	"[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-subtlest";

export function CommandPalette() {
	const { paletteOpen, setPaletteOpen, setShortcutsOpen } = useShell();
	const { openTicket } = useTicketParam();
	const router = useRouter();
	const refreshAll = useRefreshAll();
	const { resolvedTheme, setTheme } = useTheme();
	const { data: session } = useSession();
	const isAdmin = session?.user.role === "admin";

	const [query, setQuery] = useState("");
	const [debounced, setDebounced] = useState("");

	useEffect(() => {
		const id = window.setTimeout(() => setDebounced(query), 200);
		return () => window.clearTimeout(id);
	}, [query]);

	const trimmed = debounced.trim();
	const shouldSearchTickets = trimmed.length >= 2;
	const {
		data: ticketData,
		error: ticketError,
		isLoading: ticketsLoading,
	} = useSWR<TicketListResponse>(
		shouldSearchTickets
			? ticketsKey({ search: trimmed, limit: 8, sort: "updated_at", order: "desc" })
			: null,
		apiGet,
	);

	const close = () => setPaletteOpen(false);

	const handleOpenChange = (open: boolean) => {
		setPaletteOpen(open);
		if (!open) setQuery("");
	};

	const lowerQuery = query.toLowerCase();
	const navItems = NAV_GROUPS.flatMap((group) => group.items)
		.filter((item) => !item.adminOnly || isAdmin)
		.filter((item) => item.label.toLowerCase().includes(lowerQuery));

	const isDark = resolvedTheme === "dark";
	const actions = [
		{
			id: "refresh",
			label: "Refresh data",
			icon: RotateCw,
			onSelect: () => {
				close();
				void refreshAll();
			},
		},
		{
			id: "theme",
			label: isDark ? "Switch to light theme" : "Switch to dark theme",
			icon: isDark ? Sun : Moon,
			onSelect: () => {
				close();
				setTheme(isDark ? "light" : "dark");
			},
		},
		{
			id: "shortcuts",
			label: "Keyboard shortcuts",
			icon: Keyboard,
			onSelect: () => {
				close();
				setShortcutsOpen(true);
			},
		},
	].filter((action) => action.label.toLowerCase().includes(lowerQuery));

	return (
		<DialogPrimitive.Root open={paletteOpen} onOpenChange={handleOpenChange}>
			<DialogPrimitive.Portal>
				<DialogPrimitive.Overlay className="anim-overlay fixed inset-0 z-50 bg-blanket" />
				<DialogPrimitive.Content
					className="anim-dialog fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-32px)] max-w-[640px] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-overlay shadow-overlay focus:outline-none"
					aria-describedby={undefined}
				>
					<DialogPrimitive.Title className="sr-only">Search and commands</DialogPrimitive.Title>
					<Command label="Search and commands" shouldFilter={false} loop>
						<div className="flex items-center gap-2 border-b border-border px-3">
							<Search className="h-4 w-4 shrink-0 text-subtlest" aria-hidden="true" />
							<Command.Input
								value={query}
								onValueChange={setQuery}
								placeholder="Search tickets by key, subject or summary…"
								className="h-12 flex-1 bg-transparent text-sm text-foreground placeholder:text-subtlest outline-none"
							/>
						</div>
						<Command.List className="max-h-[min(420px,60vh)] overflow-y-auto p-2">
							<Command.Empty className="py-8 text-center text-sm text-subtle">
								No matches. Try a ticket key like TCK-0042.
							</Command.Empty>

							{shouldSearchTickets && (
								<Command.Group heading="Tickets" className={GROUP_HEADING_CLASS}>
									{ticketsLoading && (
										<div className="flex h-10 items-center gap-2 px-2">
											<Spinner size="sm" label="Searching tickets" />
										</div>
									)}
									{ticketError && (
										<div className="px-2 py-2 text-sm text-danger-text">Ticket search failed</div>
									)}
									{ticketData?.tickets.map((ticket) => (
										<Command.Item
											key={ticket.id}
											value={ticket.id}
											onSelect={() => {
												close();
												openTicket(ticket.id);
											}}
											className={ITEM_CLASS}
										>
											<PriorityIcon severity={ticket.severity} />
											<span className="shrink-0 font-mono text-xs text-subtle">{ticket.ticket_number}</span>
											<span className="min-w-0 flex-1 truncate">{ticket.subject}</span>
											<StatusLozenge status={ticket.status} />
										</Command.Item>
									))}
								</Command.Group>
							)}

							{navItems.length > 0 && (
								<Command.Group heading="Go to" className={GROUP_HEADING_CLASS}>
									{navItems.map((item) => {
										const Icon = item.icon;
										return (
											<Command.Item
												key={item.href}
												value={item.href}
												onSelect={() => {
													close();
													router.push(item.href);
												}}
												className={ITEM_CLASS}
											>
												<Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
												<span className="min-w-0 flex-1 truncate">{item.label}</span>
												<Kbd>{item.shortcut}</Kbd>
											</Command.Item>
										);
									})}
								</Command.Group>
							)}

							{actions.length > 0 && (
								<Command.Group heading="Actions" className={GROUP_HEADING_CLASS}>
									{actions.map((action) => {
										const Icon = action.icon;
										return (
											<Command.Item
												key={action.id}
												value={action.id}
												onSelect={action.onSelect}
												className={ITEM_CLASS}
											>
												<Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
												<span className="min-w-0 flex-1 truncate">{action.label}</span>
											</Command.Item>
										);
									})}
								</Command.Group>
							)}
						</Command.List>
						<div className="flex gap-4 border-t border-border px-3 py-2 text-xs text-subtlest">
							<span>&uarr;&darr; to navigate</span>
							<span>&crarr; to open</span>
							<span>esc to close</span>
						</div>
					</Command>
				</DialogPrimitive.Content>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}
