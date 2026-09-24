// Bordered, raised container with an optional header, used for page sections.
import * as React from "react";
import { cn } from "@/lib/utils";

type PanelElement = HTMLElement;
type PanelProps = React.HTMLAttributes<PanelElement> & {
  as?: "section" | "div" | "aside";
};

function Panel({
  as: Component = "section",
  className,
  children,
  ...rest
}: PanelProps) {
  return React.createElement(
    Component,
    {
      className: cn("rounded-lg border border-border bg-raised", className),
      ...rest,
    },
    children
  );
}

type PanelHeaderProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  headingLevel?: 2 | 3;
  id?: string;
};

function PanelHeader({
  title,
  description,
  actions,
  icon,
  headingLevel = 2,
  id,
}: PanelHeaderProps) {
  const HeadingComponent = headingLevel === 3 ? "h3" : "h2";

  return (
    <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-3">
      <div className="flex min-w-0 items-start gap-2">
        {icon && (
          <span
            className="mt-0.5 text-subtle [&_svg]:h-4 [&_svg]:w-4"
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <HeadingComponent
            id={id}
            className="text-sm font-semibold text-foreground"
          >
            {title}
          </HeadingComponent>
          {description && (
            <p className="mt-0.5 text-xs text-subtlest">{description}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      )}
    </div>
  );
}

type PanelBodyProps = React.HTMLAttributes<HTMLDivElement>;

function PanelBody({ className, children }: PanelBodyProps) {
  return <div className={cn("px-4 pb-4", className)}>{children}</div>;
}

export { Panel, PanelHeader, PanelBody };
