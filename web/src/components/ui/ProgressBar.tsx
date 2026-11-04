import { cn } from "./cn";

export type ProgressBarProps = {
  /** 0–100. */
  value: number;
  label: string;
  /** Spoken value, e.g. "12.5% of tokens sold". */
  valueText?: string;
  className?: string;
};

export function ProgressBar({ value, label, valueText, className }: ProgressBarProps) {
  const v = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100) / 100}
      aria-valuetext={valueText}
      className={cn("h-4 overflow-hidden rounded-full border-2 border-ink bg-paper", className)}
    >
      <div className="h-full border-r-2 border-ink bg-hot motion-safe:transition-[width] motion-safe:duration-500" style={{ width: `${Math.max(v > 0 ? 2 : 0, v)}%` }} />
    </div>
  );
}
