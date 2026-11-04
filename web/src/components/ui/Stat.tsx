import type { ReactNode } from "react";
import { Skeleton } from "./Skeleton";
import { cn } from "./cn";

/** A `<dl>` grid of stats. */
export function StatGrid({ className, children }: { className?: string; children: ReactNode }) {
  return <dl className={cn("grid grid-cols-2 gap-2", className)}>{children}</dl>;
}

export type StatProps = {
  label: ReactNode;
  value: ReactNode;
  /** Small secondary line under the value. */
  hint?: ReactNode;
  loading?: boolean;
  className?: string;
};

export function Stat({ label, value, hint, loading, className }: StatProps) {
  return (
    <div className={cn("min-w-0 rounded-lg border-2 border-ink bg-paper px-3 py-2", className)}>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-ink/70">{label}</dt>
      <dd className="mt-0.5 truncate font-[family-name:var(--font-display)] text-base font-black">
        {loading ? (
          <>
            <Skeleton className="mt-1 h-5 w-20" />
            <span className="sr-only">Loading</span>
          </>
        ) : (
          value
        )}
      </dd>
      {hint && !loading && <dd className="truncate text-xs text-ink/70">{hint}</dd>}
    </div>
  );
}
