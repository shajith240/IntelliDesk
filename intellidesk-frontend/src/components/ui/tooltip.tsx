"use client";

// Hover tooltip showing optional keyboard shortcut; managed with delay and positioning.
import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

const TooltipProvider = TooltipPrimitive.Provider;

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  shortcut?: string;
}

const Tooltip = React.forwardRef<HTMLButtonElement, TooltipProps>(
  ({ content, children, side = "top", shortcut }, ref) => (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild ref={ref}>
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={6}
          side={side}
          className="anim-pop z-50 max-w-xs rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-overlay"
        >
          {content}
          {shortcut && (
            <span className="ml-2 font-mono opacity-70">{shortcut}</span>
          )}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
);

Tooltip.displayName = "Tooltip";

export { TooltipProvider, Tooltip };
