import { cn } from "./cn";

/** Branded loader: a flipping 0x coin over a sliding bar. Announces itself to assistive tech. */
export function Loader({ label = "Loading", className, fill = false }: { label?: string; className?: string; fill?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex flex-col items-center justify-center gap-4 text-center", fill && "min-h-[60dvh]", className)}
    >
      <div aria-hidden className="loader-coin grid h-16 w-16 place-items-center rounded-full border-[3px] border-ink bg-banana font-[family-name:var(--font-display)] text-xl font-black shadow-[4px_4px_0_var(--color-ink)]">
        <span className="text-hot-strong">0x</span>
      </div>
      <div className="loader-bar relative h-3 w-40 overflow-hidden rounded-full border-[3px] border-ink bg-white">
        <span className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-hot" />
      </div>
      <p className="text-sm font-bold">{label}…</p>
    </div>
  );
}
