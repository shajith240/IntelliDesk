// Inline alert or notice with icon, title, and content; tones (info, warning, error, success, discovery).
import {
  Info,
  AlertTriangle,
  XCircle,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AiMark } from "./ai-mark";

type Appearance =
  | "information"
  | "warning"
  | "error"
  | "success"
  | "discovery";

type SectionMessageProps = {
  appearance?: Appearance;
  title?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
};

function SectionMessage({
  appearance = "information",
  title,
  children,
  actions,
  className,
}: SectionMessageProps) {
  const config = {
    information: {
      bgClass: "bg-info-subtle",
      Icon: Info,
      iconClass: "text-info",
      role: undefined,
    },
    warning: {
      bgClass: "bg-warning-subtle",
      Icon: AlertTriangle,
      iconClass: "text-warning-text",
      role: undefined,
    },
    error: {
      bgClass: "bg-danger-subtle",
      Icon: XCircle,
      iconClass: "text-danger",
      role: "alert",
    },
    success: {
      bgClass: "bg-success-subtle",
      Icon: CheckCircle2,
      iconClass: "text-success",
      role: undefined,
    },
    discovery: {
      bgClass: "bg-discovery-subtle",
      Icon: null,
      iconClass: "text-discovery",
      role: undefined,
    },
  };

  const { bgClass, Icon, iconClass, role } = config[appearance];

  return (
    <div
      role={role}
      className={cn(
        "flex gap-3 rounded-md p-4",
        bgClass,
        className
      )}
    >
      {Icon ? (
        <Icon
          className={cn("mt-0.5 h-4 w-4 shrink-0", iconClass)}
          aria-hidden="true"
        />
      ) : (
        <AiMark className={cn("mt-0.5 h-4 w-4 shrink-0", iconClass)} />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="text-sm font-semibold text-foreground">{title}</p>}
        {children && <div className="text-sm text-foreground">{children}</div>}
        {actions && (
          <div className="flex flex-wrap gap-3 pt-1">{actions}</div>
        )}
      </div>
    </div>
  );
}

export { SectionMessage };
