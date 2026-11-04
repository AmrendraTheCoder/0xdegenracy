import type { ReactNode } from "react";
import { cn } from "./cn";

export type BadgeTone = "banana" | "mint" | "hot" | "ink" | "white";
const TONE: Record<BadgeTone, string> = {
  banana: "bg-banana text-ink",
  mint: "bg-mint text-ink",
  hot: "bg-hot text-ink",
  ink: "bg-ink text-white",
  white: "bg-white text-ink",
};

export function Badge({ tone = "white", className, children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border-2 border-ink px-2 py-0.5 text-xs font-black leading-none", TONE[tone], className)}>
      {children}
    </span>
  );
}
