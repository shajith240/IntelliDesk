// Priority indicator: each level has its own shape (double chevron, chevron, equals, chevron down) so color is never the only cue.
import { ChevronsUp, ChevronUp, Equal, ChevronDown, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { PRIORITY_META } from "@/lib/ticket-meta"
import type { Severity } from "@/types"

interface PriorityIconProps {
	severity: Severity
	showLabel?: boolean
	className?: string
}

export function PriorityIcon({ severity, showLabel = false, className }: PriorityIconProps) {
	const label = PRIORITY_META[severity].label

	const iconMap: Record<Severity, { icon: LucideIcon; color: string }> = {
		P1: { icon: ChevronsUp, color: "text-priority-highest" },
		P2: { icon: ChevronUp, color: "text-priority-high" },
		P3: { icon: Equal, color: "text-priority-medium" },
		P4: { icon: ChevronDown, color: "text-priority-low" },
	}

	const { icon: IconComponent, color } = iconMap[severity]

	return (
		<span
			className={cn("inline-flex items-center gap-1.5", className)}
			title={`Priority: ${label}`}
		>
			<IconComponent className={cn(color, "h-4 w-4 shrink-0")} strokeWidth={2.5} aria-hidden="true" />
			{showLabel ? (
				<span className="text-sm text-foreground">{label}</span>
			) : (
				<span className="sr-only">Priority: {label}</span>
			)}
		</span>
	)
}
