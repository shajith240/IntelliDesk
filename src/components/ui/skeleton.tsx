// Placeholder shimmer box for loading states.
import { cn } from "@/lib/utils"

interface SkeletonProps {
	className?: string
}

export function Skeleton({ className }: SkeletonProps) {
	return <div aria-hidden="true" className={cn("skeleton", className)} />
}
