"use client";

// Dismissable notifications in a persistent aria-live region; announced to screen readers.
import * as React from "react";
import {
  CheckCircle2,
  XCircle,
  Info,
  AlertTriangle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

type ToastTone = "success" | "error" | "info" | "warning";

interface ToastOptions {
  tone: ToastTone;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: string;
}

interface ToastContextType {
  toast(opts: ToastOptions): string;
  dismiss(id: string): void;
}

const ToastContext = React.createContext<ToastContextType | undefined>(
  undefined
);

const useToast = (): ToastContextType => {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
};

let toastIdCounter = 0;

const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const [politeMessage, setPoliteMessage] = React.useState("");
  const [assertiveMessage, setAssertiveMessage] = React.useState("");

  const toast = React.useCallback((opts: ToastOptions): string => {
    const id = `toast-${++toastIdCounter}`;
    const newItem: ToastItem = { ...opts, id };

    setItems((prev) => {
      const updated = [newItem, ...prev];
      if (updated.length > 4) {
        updated.pop();
      }
      return updated;
    });

    const message = opts.description
      ? `${opts.title}. ${opts.description}`
      : opts.title;

    if (opts.tone === "error") {
      setAssertiveMessage(message);
    } else {
      setPoliteMessage(message);
    }

    return id;
  }, []);

  const dismiss = React.useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const value = React.useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {politeMessage}
      </div>
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {assertiveMessage}
      </div>
      <section
        aria-label="Notifications"
        className="pointer-events-none fixed bottom-4 left-4 z-[60] flex w-[calc(100vw-32px)] flex-col gap-2 sm:w-[400px]"
      >
        {items.map((item) => (
          <ToastCard
            key={item.id}
            item={item}
            onDismiss={() => dismiss(item.id)}
          />
        ))}
      </section>
    </ToastContext.Provider>
  );
};

interface ToastCardProps {
  item: ToastItem;
  onDismiss: () => void;
}

const ToastCard = ({ item, onDismiss }: ToastCardProps) => {
  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const paused = hovered || focused;

  const duration =
    item.durationMs !== undefined
      ? item.durationMs
      : item.tone === "error"
        ? null
        : item.tone === "warning"
          ? 8000
          : 5000;

  // Restarts the full duration after a pause; long enough to read and act.
  React.useEffect(() => {
    if (duration === null || paused) return;
    const timeoutId = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timeoutId);
  }, [duration, paused, onDismiss]);

  const handleEscape = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onDismiss();
    }
  };

  const toneConfig: Record<
    ToastTone,
    { icon: React.ReactNode; iconColor: string }
  > = {
    success: {
      icon: <CheckCircle2 aria-hidden="true" />,
      iconColor: "text-success",
    },
    error: {
      icon: <XCircle aria-hidden="true" />,
      iconColor: "text-danger",
    },
    info: {
      icon: <Info aria-hidden="true" />,
      iconColor: "text-info",
    },
    warning: {
      icon: <AlertTriangle aria-hidden="true" />,
      iconColor: "text-warning-text",
    },
  };

  const { icon, iconColor } = toneConfig[item.tone];
  const action = item.action;

  return (
    <div
      className="anim-toast pointer-events-auto flex gap-3 rounded-lg border border-border bg-overlay p-4 shadow-overlay"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
      onKeyDown={handleEscape}
    >
      <div className={cn("mt-0.5 h-5 w-5 shrink-0", iconColor)}>{icon}</div>
      <div className="flex-1">
        <div className="text-sm font-semibold text-foreground">
          {item.title}
        </div>
        {item.description && (
          <div className="mt-0.5 text-sm text-subtle">{item.description}</div>
        )}
        {action && (
          <Button
            variant="link"
            size="sm"
            className="mt-1"
            onClick={() => {
              action.onClick();
              onDismiss();
            }}
          >
            {action.label}
          </Button>
        )}
      </div>
      <Button
        variant="subtle"
        size="icon-sm"
        aria-label="Dismiss notification"
        onClick={onDismiss}
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  );
};

export { ToastProvider, useToast };
