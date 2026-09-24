import { cn } from "@/lib/utils";

/**
 * IntelliDesk's mark for machine-generated content: an "AI" monogram in a
 * rounded frame. Used instead of the generic sparkle so provenance reads as a
 * label, not decoration.
 */
export function AiMark({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.25}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
			className={cn("h-4 w-4 shrink-0", className)}
		>
			<rect x="1.25" y="1.25" width="13.5" height="13.5" rx="3" />
			<path d="M4.25 11 6.25 5l2 6M4.9 9.1h2.7" />
			<path d="M10.75 5v6M9.75 5h2M9.75 11h2" />
		</svg>
	);
}

interface AiLabelProps {
	/** Visible text, e.g. "AI draft", "AI suggestion". */
	children?: React.ReactNode;
	className?: string;
}

/** Provenance chip for AI output. Always pair AI content with this label. */
export function AiLabel({ children = "AI suggestion", className }: AiLabelProps) {
	return (
		<span
			className={cn(
				"inline-flex h-5 shrink-0 items-center gap-1 rounded-sm border border-discovery/30 bg-discovery-subtle pl-0.5 pr-1.5 text-[11px] font-semibold leading-none text-discovery-text",
				className,
			)}
		>
			<AiMark className="h-3.5 w-3.5" />
			{children}
		</span>
	);
}
