// Five-segment confidence meter; bands (high/moderate/low/very low) paired with color and text.
import { cn } from "@/lib/utils";

interface ConfidenceMeterProps {
	/** 0–100, or null when the model reported nothing. */
	value: number | null;
	/** Show the percentage next to the segments. */
	showValue?: boolean;
	size?: "sm" | "md";
	className?: string;
}

const STEPS = 5;

/** Score bands. Color is paired with the number and the fill length, never used alone. */
export function confidenceBand(value: number): { fill: string; text: string; label: string; summary: string } {
	if (value >= 85) return { fill: "bg-success", text: "text-success-text", label: "high", summary: "High confidence" };
	if (value >= 70)
		return { fill: "bg-info", text: "text-info-text", label: "moderate", summary: "Moderate confidence — spot-check" };
	if (value >= 50)
		return {
			fill: "bg-warning",
			text: "text-warning-text",
			label: "low, review recommended",
			summary: "Low confidence — review carefully",
		};
	return {
		fill: "bg-danger",
		text: "text-danger-text",
		label: "very low, review required",
		summary: "Very low confidence — verify everything",
	};
}

/**
 * Five-segment meter filled in proportion to the score: 90% fills four and a half
 * segments, 95% four and three quarters.
 */
export function ConfidenceMeter({ value, showValue = true, size = "sm", className }: ConfidenceMeterProps) {
	if (value === null) {
		return <span className={cn("text-xs text-subtlest", className)}>—</span>;
	}
	const clamped = Math.max(0, Math.min(100, value));
	const perStep = 100 / STEPS;
	const tone = confidenceBand(clamped);

	return (
		<span
			role="meter"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={clamped}
			aria-label={`AI confidence ${clamped}%, ${tone.label}`}
			className={cn("inline-flex items-center gap-1.5", className)}
		>
			<span className="flex items-center gap-[2px]" aria-hidden="true">
				{Array.from({ length: STEPS }, (_, i) => {
					const portion = Math.max(0, Math.min(1, (clamped - i * perStep) / perStep));
					return (
						<span
							key={i}
							className={cn(
								"relative overflow-hidden rounded-[1px] bg-fill-hover",
								size === "sm" ? "h-2.5 w-1.5" : "h-3.5 w-2",
							)}
						>
							{portion > 0 && (
								<span
									className={cn("absolute inset-y-0 left-0", tone.fill)}
									style={{ width: `${portion * 100}%` }}
								/>
							)}
						</span>
					);
				})}
			</span>
			{showValue && (
				<span
					aria-hidden="true"
					className={cn("font-mono tabular", size === "sm" ? "text-xs" : "text-sm font-medium", tone.text)}
				>
					{clamped}%
				</span>
			)}
		</span>
	);
}
