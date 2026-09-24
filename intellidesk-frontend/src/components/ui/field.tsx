// Form field components: Label, Input, Textarea, and FieldMessage (hint, error, success).
import * as React from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn("text-xs font-semibold text-subtle", className)}
    {...props}
  />
));
Label.displayName = "Label";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid = false, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-8 w-full rounded-md border border-border-bold bg-background px-2 text-sm text-foreground placeholder:text-subtlest transition-colors duration-100 hover:bg-fill focus-visible:border-primary focus-visible:bg-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50",
        invalid &&
          "border-danger focus-visible:border-danger focus-visible:ring-danger",
        className
      )}
      aria-invalid={invalid}
      {...props}
    />
  )
);
Input.displayName = "Input";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid = false, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-md border border-border-bold bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-subtlest transition-colors duration-100 hover:bg-fill focus-visible:border-primary focus-visible:bg-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 min-h-[80px] leading-5 resize-y",
        invalid &&
          "border-danger focus-visible:border-danger focus-visible:ring-danger",
        className
      )}
      aria-invalid={invalid}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

type FieldMessageProps = React.HTMLAttributes<HTMLParagraphElement> & {
  id: string;
  tone?: "error" | "hint" | "success";
};

function FieldMessage({
  id,
  tone = "hint",
  children,
  className,
  ...props
}: FieldMessageProps) {
  const toneClass =
    tone === "error"
      ? "text-danger-text"
      : tone === "success"
        ? "text-success-text"
        : "text-subtlest";

  return (
    <p
      id={id}
      className={cn("mt-1 flex items-start gap-1 text-xs", toneClass, className)}
      {...props}
    >
      {tone === "error" && (
        <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      )}
      {tone === "success" && (
        <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      )}
      {children}
    </p>
  );
}

export { Label, Input, Textarea, FieldMessage };
