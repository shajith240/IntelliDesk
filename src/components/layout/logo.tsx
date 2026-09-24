import { cn } from "@/lib/utils";

interface LogoProps {
	className?: string;
	/** Hide the wordmark and show only the mark. */
	markOnly?: boolean;
}

export function Logo({ className, markOnly = false }: LogoProps) {
	return (
		<span className={cn("inline-flex items-center gap-2 text-foreground", className)}>
			<svg
				viewBox="0 0 24 24"
				className="h-6 w-6 shrink-0"
				aria-hidden="true"
				focusable="false"
			>
				<rect width="24" height="24" rx="5" className="fill-primary" />
				<path
					fillRule="evenodd"
					d="M7 7h2.5v10H7zM11.5 7H14a5 5 0 0 1 0 10h-2.5zm2.5 2.3v5.4a2.7 2.7 0 0 0 0-5.4z"
					className="fill-primary-foreground"
				/>
			</svg>
			{markOnly ? (
				<span className="sr-only">IntelliDesk</span>
			) : (
				<span className="text-[15px] font-semibold tracking-[-0.01em]">IntelliDesk</span>
			)}
		</span>
	);
}
