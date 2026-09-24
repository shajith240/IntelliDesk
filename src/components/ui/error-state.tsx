// Error placeholder with alert icon, message, and optional retry button.
import { AlertTriangle, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

type ErrorStateProps = {
  title?: string;
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
  size?: "sm" | "md";
};

function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  retrying = false,
  className,
  size = "md",
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center text-center",
        size === "md" ? "gap-3 px-6 py-12" : "gap-2 px-4 py-8",
        className
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-full bg-danger-subtle text-danger",
          size === "md" ? "h-12 w-12" : "h-10 w-10"
        )}
        aria-hidden="true"
      >
        <AlertTriangle className="h-5 w-5" />
      </span>
      <p
        className={cn(
          "font-semibold text-foreground",
          size === "md" ? "text-base" : "text-sm"
        )}
      >
        {title}
      </p>
      <p className="max-w-md text-sm text-subtle">{message}</p>
      {onRetry && (
        <Button
          variant="default"
          onClick={onRetry}
          loading={retrying}
          className="mt-1"
        >
          <RotateCw aria-hidden="true" />
          Try again
        </Button>
      )}
    </div>
  );
}

export { ErrorState };
