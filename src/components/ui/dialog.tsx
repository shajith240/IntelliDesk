"use client";

// Modal dialog with title, description, close button, and optional footer.
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  title: string;
  description?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  hideClose?: boolean;
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(
  (
    {
      title,
      description,
      size = "md",
      children,
      className,
      hideClose = false,
      ...contentProps
    },
    ref
  ) => {
    const sizeClass = {
      sm: "max-w-[400px]",
      md: "max-w-[600px]",
      lg: "max-w-[800px]",
    }[size];

    return (
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="anim-overlay fixed inset-0 z-50 bg-blanket" />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            "anim-dialog fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-64px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-overlay shadow-overlay focus:outline-none",
            sizeClass,
            className
          )}
          {...contentProps}
        >
          <div className="px-6 pb-2 pt-5 pr-12">
            <DialogPrimitive.Title className="text-xl font-semibold text-foreground">
              {title}
            </DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="mt-1 text-sm text-subtle">
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
          {!description && (
            <DialogPrimitive.Description className="sr-only" />
          )}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-2">
            {children}
          </div>
          {!hideClose && (
            <DialogPrimitive.Close asChild>
              <Button
                variant="subtle"
                size="icon-sm"
                aria-label="Close"
                className="absolute right-3 top-3"
              >
                <X aria-hidden="true" />
              </Button>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    );
  }
);

DialogContent.displayName = "DialogContent";

interface DialogFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

const DialogFooter = React.forwardRef<HTMLDivElement, DialogFooterProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex flex-col-reverse gap-2 px-6 pb-5 pt-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
);

DialogFooter.displayName = "DialogFooter";

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogFooter };
