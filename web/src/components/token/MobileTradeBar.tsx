"use client";

import type { Address } from "viem";
import { Skeleton, buttonClasses, cn } from "@/components/ui";
import { fmtPrice } from "@/lib/format";
import { useInView } from "@/lib/hooks/useInView";
import { useTokenStats } from "@/lib/hooks/useToken";

/** Phone-only sticky bar with the live price and a jump to the trade panel; hides while the panel is on screen. */
export function MobileTradeBar({ token, ticker, targetId }: { token: Address; ticker: string; targetId: string }) {
  const stats = useTokenStats(token); // same query key as the panel, so no extra RPC calls
  // Hidden only while the panel fills the middle of the screen, so a sliver of it doesn't hide the bar.
  const panelVisible = useInView(targetId, "-35% 0px -35% 0px");
  return (
    <div
      aria-hidden={panelVisible || undefined}
      className={cn(
        "fixed inset-x-0 bottom-0 z-20 border-t-[3px] border-ink bg-banana px-4 py-2 lg:hidden",
        "motion-safe:transition-transform motion-safe:duration-200",
        panelVisible ? "pointer-events-none translate-y-full" : "translate-y-0",
      )}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <div className="min-w-0 text-sm">
          <div className="font-black">${ticker}</div>
          <div className="truncate text-xs">{stats.price !== undefined ? fmtPrice(stats.price) : <Skeleton className="h-3 w-24" />}</div>
        </div>
        <a href={`#${targetId}`} tabIndex={panelVisible ? -1 : undefined} className={buttonClasses({ variant: "primary", size: "md" })}>
          Trade ${ticker} ↓
        </a>
      </div>
    </div>
  );
}
