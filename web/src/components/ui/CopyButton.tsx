"use client";

import { useEffect, useState } from "react";
import { cn } from "./cn";

/** Copies `value` to the clipboard and confirms visually and via a polite live region. */
export function CopyButton({ value, label = "Copy", className }: { value: string; /** Accessible name, e.g. "Copy token address". */ label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState("idle"), 1600);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={() => navigator.clipboard?.writeText(value).then(() => setState("copied"), () => setState("failed"))}
        className={cn(
          "inline-grid h-7 w-7 shrink-0 place-items-center rounded-md border-2 border-ink bg-white text-xs font-black hover:bg-banana",
          className,
        )}
      >
        <span aria-hidden>{state === "copied" ? "✓" : state === "failed" ? "!" : "⧉"}</span>
      </button>
      <span role="status" className="sr-only">
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : ""}
      </span>
    </>
  );
}
