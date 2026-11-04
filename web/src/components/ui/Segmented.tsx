"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "./cn";

export type SegmentedOption<T extends string> = { value: T; label: ReactNode };

/**
 * Compact segmented control (WAI-ARIA radiogroup): one option selected, ←/→ move the selection,
 * Home/End jump to the ends. Used for time windows, sort modes and the mobile panel switcher.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "sm",
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  /** Accessible name, e.g. "Time window". */
  label: string;
  size?: "xs" | "sm";
  className?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const idx = Math.max(0, options.findIndex((o) => o.value === value));

  function onKeyDown(e: KeyboardEvent) {
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % options.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + options.length) % options.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = options.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("inline-flex rounded-xl border-2 border-ink bg-paper p-0.5", className)}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-[9px] font-bold transition-colors",
              size === "xs" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
              on ? "bg-ink text-white" : "text-ink/70 hover:bg-ink/10 hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
