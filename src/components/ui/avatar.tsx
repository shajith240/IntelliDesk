// Avatar circle with user initials or unassigned icon; color determined by hash of name.
import { User } from "lucide-react"
import { cn } from "@/lib/utils"

interface AvatarProps {
	name?: string | null
	size?: "xs" | "sm" | "md"
	className?: string
}

export function Avatar({ name, size = "sm", className }: AvatarProps) {
	const sizeClasses = {
		xs: "h-5 w-5 text-[9px]",
		sm: "h-6 w-6 text-[10px]",
		md: "h-8 w-8 text-xs",
	}

	const colorClasses = [
		"bg-info-subtle text-info-text",
		"bg-success-subtle text-success-text",
		"bg-discovery-subtle text-discovery-text",
		"bg-warning-subtle text-warning-text",
		"bg-danger-subtle text-danger-text",
		"bg-orange-subtle text-orange",
	]

	const isUnassigned = !name || !name.trim()

	if (isUnassigned) {
		const iconSize = size === "md" ? "h-4 w-4" : "h-3 w-3"
		return (
			<span
				role="img"
				aria-label="Unassigned"
				className={cn(
					"inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold border border-dashed border-border-bold text-subtlest",
					sizeClasses[size],
					className,
				)}
			>
				<User className={cn(iconSize, "shrink-0")} aria-hidden="true" />
			</span>
		)
	}

	const parts = name.trim().split(/[\s@._-]+/).filter(Boolean)
	let initials: string

	if (parts.length >= 2) {
		initials = (parts[0][0] + parts[1][0]).toUpperCase()
	} else if (parts.length === 1) {
		initials = parts[0].slice(0, 2).toUpperCase()
	} else {
		initials = "?"
	}

	const colorIndex = Array.from(name).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 6
	const colorClass = colorClasses[colorIndex]

	return (
		<span
			role="img"
			aria-label={name}
			className={cn(
				"inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold",
				sizeClasses[size],
				colorClass,
				className,
			)}
		>
			<span aria-hidden="true">{initials}</span>
		</span>
	)
}
