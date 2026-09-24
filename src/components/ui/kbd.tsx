// Keyboard shortcut indicator; displays key or key combination inline.
import { cn } from "@/lib/utils"

interface KbdProps {
	children: React.ReactNode
	className?: string
}

export function Kbd({ children, className }: KbdProps) {
	return (
		<kbd
			className={cn(
				"inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-border bg-fill px-1 font-mono text-[11px] font-medium text-subtle",
				className,
			)}
		>
			{children}
		</kbd>
	)
}
