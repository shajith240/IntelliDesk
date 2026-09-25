// Navigation configuration: main app sections with keyboard shortcut hints and per-role visibility.
import {
	BarChart3,
	BookOpen,
	Inbox,
	LayoutDashboard,
	MailWarning,
	ShieldAlert,
	Settings,
	UserCheck,
	type LucideIcon,
} from "lucide-react";
import type { UserRole } from "@/types";

export interface NavItem {
	href: string;
	label: string;
	icon: LucideIcon;
	shortcut: string;
	/** Roles that see this item in navigation and may open its page. */
	roles: UserRole[];
}

export interface NavGroup {
	label: string;
	items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
	{
		label: "Operations",
		items: [
			{
				href: "/dashboard",
				label: "Command Center",
				icon: LayoutDashboard,
				shortcut: "G D",
				roles: ["admin", "viewer"],
			},
			{
				href: "/dashboard/review",
				label: "Needs Review",
				icon: ShieldAlert,
				shortcut: "G R",
				roles: ["admin", "viewer"],
			},
			{
				href: "/dashboard/queue",
				label: "Incoming Queue",
				icon: Inbox,
				shortcut: "G I",
				roles: ["admin", "viewer"],
			},
			{
				href: "/dashboard/my-work",
				label: "My Work",
				icon: UserCheck,
				shortcut: "G M",
				roles: ["admin", "agent"],
			},
		],
	},
	{
		label: "Insights",
		items: [
			{
				href: "/dashboard/analytics",
				label: "Analytics",
				icon: BarChart3,
				shortcut: "G A",
				roles: ["admin", "viewer"],
			},
		],
	},
	{
		label: "Resources",
		items: [
			{
				href: "/dashboard/knowledge-base",
				label: "Knowledge Base",
				icon: BookOpen,
				shortcut: "G K",
				roles: ["admin", "agent", "viewer"],
			},
		],
	},
	{
		label: "Admin",
		items: [
			{
				href: "/dashboard/settings",
				label: "Settings",
				icon: Settings,
				shortcut: "G S",
				roles: ["admin"],
			},
			{
				href: "/dashboard/spam",
				label: "Spam",
				icon: MailWarning,
				shortcut: "G J",
				roles: ["admin"],
			},
		],
	},
];

export function isNavActive(pathname: string, href: string): boolean {
	if (href === "/dashboard") return pathname === "/dashboard";
	return pathname === href || pathname.startsWith(`${href}/`);
}
