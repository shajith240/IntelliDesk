// Page header with breadcrumbs, title, description, and action buttons.
import type { ReactNode } from "react";
import Link from "next/link";

export interface PageHeaderBreadcrumb {
	label: string;
	href?: string;
}

export interface PageHeaderProps {
	breadcrumbs?: PageHeaderBreadcrumb[];
	title: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	meta?: ReactNode;
}

export function PageHeader({ breadcrumbs, title, description, actions, meta }: PageHeaderProps) {
	return (
		<div className="flex flex-col gap-3 px-4 pb-4 pt-5 sm:px-6 md:flex-row md:items-end md:justify-between">
			<div className="min-w-0">
				{breadcrumbs && breadcrumbs.length > 0 && (
					<nav aria-label="Breadcrumb">
						<ol className="mb-1 flex flex-wrap items-center gap-1 text-sm text-subtle">
							{breadcrumbs.map((crumb, index) => (
								<li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
									{index > 0 && (
										<span aria-hidden="true" className="text-subtlest">
											/
										</span>
									)}
									{crumb.href ? (
										<Link href={crumb.href} className="hover:underline">
											{crumb.label}
										</Link>
									) : (
										<span aria-current="page">{crumb.label}</span>
									)}
								</li>
							))}
						</ol>
					</nav>
				)}
				<h1 className="text-2xl font-semibold tracking-[-0.01em] text-foreground">{title}</h1>
				{description && <p className="mt-1 max-w-2xl text-sm text-subtle">{description}</p>}
				{meta && (
					<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-subtlest">{meta}</div>
				)}
			</div>
			{actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
		</div>
	);
}
