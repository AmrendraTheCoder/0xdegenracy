"use client";

import { ConnectButton } from "@/components/ConnectButton";
import { Button, Skeleton } from "@/components/ui";
import type { TradeSide, TradeState } from "./tradeState";

export type TradeButtonProps = {
  state: TradeState;
  side: TradeSide;
  onTrade: () => void;
  onSwitchChain: () => void;
  /** id of the element that explains a blocked state (linked via aria-describedby). */
  reasonId: string;
};

/** The primary action plus a visible explanation whenever it can't be used. */
export function TradeButton({ state, side, onTrade, onSwitchChain, reasonId }: TradeButtonProps) {
  if (state.kind === "connect")
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-ink bg-paper p-3 text-center text-sm">
        <p className="font-bold">Connect a wallet to trade.</p>
        <ConnectButton />
      </div>
    );
  if (state.kind === "switch")
    return (
      <div className="space-y-2">
        <Button variant="primary" size="lg" block onClick={onSwitchChain}>Switch to Monad testnet</Button>
        <p className="text-center text-xs">Your wallet is on another network.</p>
      </div>
    );

  const variant = side === "buy" ? "primary" : "sell";
  const blocked = state.kind === "blocked";
  return (
    <div className="space-y-2">
      <Button
        variant={variant}
        size="lg"
        block
        className="text-xl uppercase"
        loading={state.kind === "busy" || state.kind === "loading"}
        disabled={state.kind !== "ready"}
        aria-describedby={blocked ? reasonId : undefined}
        onClick={onTrade}
      >
        {state.kind === "busy" ? "Confirm in wallet…" : state.label}
      </Button>
      <div id={reasonId} aria-live="polite" className="min-h-4 text-center text-xs">
        {blocked && (
          <>
            <span className={state.label === "Can't send this trade" ? "font-bold text-hot-strong" : undefined}>{state.reason}</span>
            {state.help && (
              <>
                {" "}
                <a href={state.help.href} target="_blank" rel="noreferrer" className="font-bold underline">
                  {state.help.label}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function TradeButtonSkeleton() {
  return <Skeleton className="h-14 w-full rounded-xl" />;
}
