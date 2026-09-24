// Navigation configuration: main app sections with keyboard shortcut hints and admin restrictions.
import {
	BarChart3,
	BookOpen,
	Inbox,
	LayoutDashboard,
	Settings,
	UserCheck,
	type LucideIcon,
} from "lucide-react";

export interface NavItem {
	href: string;
	label: string;
	icon: LucideIcon;
	shortcut: string;
	adminOnly?: boolean;
}

export interface NavGroup {
	label: string;
	items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
	{
		label: "Operations",
		items: [
			{ href: "/dashboard", label: "Command Center", icon: LayoutDashboard, shortcut: "G D" },
			{ href: "/dashboard/queue", label: "Incoming Queue", icon: Inbox, shortcut: "G I" },
			{ href: "/dashboard/my-work", label: "My Work", icon: UserCheck, shortcut: "G M" },
		],
	},
	{
		label: "Insights",
		items: [{ href: "/dashboard/analytics", label: "Analytics", icon: BarChart3, shortcut: "G A" }],
	},
	{
		label: "Resources",
		items: [{ href: "/dashboard/knowledge-base", label: "Knowledge Base", icon: BookOpen, shortcut: "G K" }],
	},
	{
		label: "Admin",
		items: [
			{ href: "/dashboard/settings", label: "Settings", icon: Settings, shortcut: "G S", adminOnly: true },
		],
	},
];

export function isNavActive(pathname: string, href: string): boolean {
	if (href === "/dashboard") return pathname === "/dashboard";
	return pathname === href || pathname.startsWith(`${href}/`);
}
