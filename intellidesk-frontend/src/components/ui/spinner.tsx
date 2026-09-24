// Animated loading spinner; typically shown inside buttons or as inline indicator.
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface SpinnerProps {
	size?: "sm" | "md" | "lg"
	label?: string
	className?: string
}

export function Spinner({ size = "md", label, className }: SpinnerProps) {
	const sizeClasses = {
		sm: "h-3.5 w-3.5",
		md: "h-4 w-4",
		lg: "h-6 w-6",
	}

	return (
		<span role="status" className={cn("inline-flex items-center", className)}>
			<Loader2 className={cn("animate-spin text-subtle", sizeClasses[size])} aria-hidden="true" />
			<span className="sr-only">{label ?? "Loading"}</span>
		</span>
	)
}
