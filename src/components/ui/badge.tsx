// Small rounded count badge (e.g. new tickets in the sidebar) with semantic color tones.
import { cn } from "@/lib/utils"

interface BadgeProps {
	tone?: "neutral" | "primary" | "danger" | "warning" | "success" | "info" | "discovery"
	className?: string
	children: React.ReactNode
}

export function Badge({ tone = "neutral", className, children }: BadgeProps) {
	const toneClasses = {
		neutral: "bg-fill text-subtle",
		primary: "bg-selected text-selected-foreground",
		danger: "bg-danger-subtle text-danger-text",
		warning: "bg-warning-subtle text-warning-text",
		success: "bg-success-subtle text-success-text",
		info: "bg-info-subtle text-info-text",
		discovery: "bg-discovery-subtle text-discovery-text",
	}

	return (
		<span
			className={cn(
				"inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular",
				toneClasses[tone],
				className,
			)}
		>
			{children}
		</span>
	)
}
