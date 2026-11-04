import { cn } from "./cn";

/** Placeholder block for content that is loading. Hidden from assistive tech: pair it with a live/status label. */
export function Skeleton({ className, width, height }: { className?: string; width?: number | string; height?: number | string }) {
  return (
    <span
      aria-hidden
      className={cn("block rounded-md bg-ink/10 motion-safe:animate-pulse", className)}
      style={{ width, height }}
    />
  );
}
