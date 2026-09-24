// Button with Jira-style variants (default, primary, subtle, danger, discovery, link), sizes, and a loading state.
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-colors duration-100 disabled:pointer-events-none disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				default: "bg-fill text-subtle hover:bg-fill-hover hover:text-foreground active:bg-fill-pressed",
				primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
				subtle: "bg-transparent text-subtle hover:bg-fill hover:text-foreground active:bg-fill-hover",
				danger: "bg-danger text-on-bold hover:bg-danger/90",
				discovery: "bg-discovery text-on-bold hover:bg-discovery/90",
				link: "text-primary underline-offset-4 hover:underline",
				destructive: "bg-danger text-on-bold hover:bg-danger/90",
				outline: "border border-border-bold bg-background text-foreground hover:bg-fill",
				secondary: "bg-fill text-subtle hover:bg-fill-hover hover:text-foreground active:bg-fill-pressed",
				ghost: "bg-transparent text-subtle hover:bg-fill hover:text-foreground active:bg-fill-hover",
			},
			size: {
				sm: "h-7 px-2 text-[13px]",
				md: "h-8 px-3",
				icon: "h-8 w-8 p-0",
				"icon-sm": "h-7 w-7 p-0",
				default: "h-8 px-3",
				lg: "h-10 px-4",
			},
		},
		compoundVariants: [
			{
				variant: "link",
				class: "h-auto px-0",
			},
		],
		defaultVariants: {
			variant: "default",
			size: "md",
		},
	},
)

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement>,
	VariantProps<typeof buttonVariants> {
	asChild?: boolean
	loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	({ className, variant, size, asChild = false, loading = false, disabled, children, type = "button", ...props }, ref) => {
		if (asChild) {
			return (
				<Slot
					className={cn(buttonVariants({ variant, size, className }))}
					ref={ref}
					aria-disabled={disabled || undefined}
					{...props}
				>
					{children}
				</Slot>
			)
		}

		return (
			<button
				{...props}
				className={cn(buttonVariants({ variant, size, className }))}
				ref={ref}
				disabled={loading || disabled}
				aria-busy={loading || undefined}
				type={type}
			>
				{loading && <Loader2 className="animate-spin" aria-hidden="true" />}
				{children}
			</button>
		)
	},
)
Button.displayName = "Button"

export { Button, buttonVariants }
