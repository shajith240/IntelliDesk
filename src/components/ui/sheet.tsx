"use client";

// Slide-over panel from the edge; side-positioned variant of dialog.
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  side?: "left" | "right";
  title: string;
  hideTitle?: boolean;
  description?: string;
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(
  (
    {
      side = "right",
      title,
      hideTitle = false,
      description,
      className,
      children,
      ...contentProps
    },
    ref
  ) => {
    const sideClass =
      side === "right"
        ? "anim-sheet-right right-0 w-full border-l border-border sm:max-w-md"
        : "anim-sheet-left left-0 w-72 max-w-[85vw] border-r border-border";

    return (
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="anim-overlay fixed inset-0 z-50 bg-blanket" />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            "fixed inset-y-0 z-50 flex flex-col bg-overlay shadow-overlay focus:outline-none",
            sideClass,
            className
          )}
          {...contentProps}
        >
          {hideTitle ? (
            <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          ) : (
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
              <DialogPrimitive.Title className="text-base font-semibold text-foreground">
                {title}
              </DialogPrimitive.Title>
              <SheetClose asChild>
                <Button
                  variant="subtle"
                  size="icon-sm"
                  aria-label="Close"
                >
                  <X aria-hidden="true" />
                </Button>
              </SheetClose>
            </div>
          )}
          {!description && (
            <DialogPrimitive.Description className="sr-only" />
          )}
          {description && (
            <DialogPrimitive.Description className="sr-only">
              {description}
            </DialogPrimitive.Description>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    );
  }
);

SheetContent.displayName = "SheetContent";

export { Sheet, SheetTrigger, SheetClose, SheetContent };
