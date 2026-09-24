"use client"

// Tag-like label for ticket statuses, relationships, language, tiers; supports color tones.
import { cn } from "@/lib/utils"
import { STATUS_META } from "@/lib/ticket-meta"
import type { TicketStatus } from "@/types"

interface LozengeProps {
	appearance?: "default" | "inprogress" | "success" | "removed" | "moved" | "new" | "discovery"
	bold?: boolean
	className?: string
	children: React.ReactNode
}

export function Lozenge({
	appearance = "default",
	bold = false,
	className,
	children,
}: LozengeProps) {
	const appearanceClasses = {
		default: bold ? "bg-subtle text-on-bold" : "bg-fill text-subtle",
		inprogress: bold ? "bg-info text-on-bold" : "bg-info-subtle text-info-text",
		success: bold ? "bg-success text-on-bold" : "bg-success-subtle text-success-text",
		removed: bold ? "bg-danger text-on-bold" : "bg-danger-subtle text-danger-text",
		moved: "bg-warning-subtle text-warning-text",
		new: bold ? "bg-discovery text-on-bold" : "bg-discovery-subtle text-discovery-text",
		discovery: bold ? "bg-discovery text-on-bold" : "bg-discovery-subtle text-discovery-text",
	}

	return (
		<span
			className={cn(
				"inline-flex h-5 max-w-[200px] items-center rounded-sm px-1 text-[11px] font-bold uppercase leading-none tracking-[0.02em] whitespace-nowrap",
				appearanceClasses[appearance],
				className,
			)}
		>
			<span className="truncate">{children}</span>
		</span>
	)
}

interface StatusLozengeProps {
	status: TicketStatus
	className?: string
}

export function StatusLozenge({ status, className }: StatusLozengeProps) {
	const appearance = STATUS_META[status].appearance
	return (
		<Lozenge appearance={appearance} className={className}>
			{status}
		</Lozenge>
	)
}
