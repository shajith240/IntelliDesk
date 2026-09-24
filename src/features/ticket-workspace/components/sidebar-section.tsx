"use client";

// Collapsible group in the ticket sidebar (Jira "Details"-style disclosure).
import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarSectionProps {
	title: ReactNode;
	/** Shown next to the title, e.g. a count or an AI label. */
	adornment?: ReactNode;
	defaultOpen?: boolean;
	children: ReactNode;
}

export function SidebarSection({ title, adornment, defaultOpen = true, children }: SidebarSectionProps) {
	const [open, setOpen] = useState(defaultOpen);
	const contentId = useId();

	return (
		<section className="border-b border-border last:border-b-0">
			<button
				type="button"
				aria-expanded={open}
				aria-controls={contentId}
				onClick={() => setOpen((value) => !value)}
				className="flex h-11 w-full items-center gap-2 px-4 text-left transition-colors duration-100 hover:bg-fill"
			>
				<ChevronDown
					className={cn("h-4 w-4 shrink-0 text-subtle transition-transform duration-150", !open && "-rotate-90")}
					aria-hidden="true"
				/>
				<span className="text-sm font-semibold text-foreground">{title}</span>
				{adornment && <span className="ml-auto flex items-center">{adornment}</span>}
			</button>
			<div id={contentId} hidden={!open} className="px-4 pb-4">
				{children}
			</div>
		</section>
	);
}

/** Label/value row used inside sidebar sections. */
export function SidebarField({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="grid grid-cols-[104px_minmax(0,1fr)] items-start gap-3 py-1.5 text-sm">
			<dt className="pt-0.5 text-subtle">{label}</dt>
			<dd className="min-w-0 text-foreground">{children}</dd>
		</div>
	);
}
