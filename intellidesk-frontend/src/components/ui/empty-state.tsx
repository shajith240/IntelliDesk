// Centered placeholder with icon, title, and description for empty content areas.
import * as React from "react";
import { cn } from "@/lib/utils";

type LucideIcon = React.ComponentType<{ className?: string }>;

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  size?: "sm" | "md";
  className?: string;
};

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = "md",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        size === "md" ? "gap-3 px-6 py-12" : "gap-2 px-4 py-8",
        className
      )}
    >
      {Icon && (
        <span
          className={cn(
            "flex items-center justify-center rounded-full bg-fill text-subtle",
            size === "md" ? "h-12 w-12" : "h-10 w-10"
          )}
          aria-hidden="true"
        >
          <Icon className="h-5 w-5" />
        </span>
      )}
      <p
        className={cn(
          "font-semibold text-foreground",
          size === "md" ? "text-base" : "text-sm"
        )}
      >
        {title}
      </p>
      {description && (
        <div className="max-w-sm text-sm text-subtle">{description}</div>
      )}
      {action && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {action}
        </div>
      )}
    </div>
  );
}

export { EmptyState };
