"use client";

import { PresetGroup, Skeleton } from "@/components/ui";
import { fmtMon, fmtTokens } from "@/lib/format";

export const SELL_PRESETS = [25, 50, 100] as const;
export type SellPct = (typeof SELL_PRESETS)[number];

export type SellFormProps = {
  ticker: string;
  pct: SellPct;
  onPctChange: (p: SellPct) => void;
  heldWhole?: bigint;
  sellAmount: bigint;
  netOut: bigint;
  quoteLoading: boolean;
  disabled?: boolean;
};

export function SellForm({ ticker, pct, onPctChange, heldWhole, sellAmount, netOut, quoteLoading, disabled }: SellFormProps) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-black" aria-hidden>Share of your bag</p>
      <PresetGroup label="Share of your bag to sell" presets={SELL_PRESETS.map((p) => ({ label: `${p}%`, value: p }))} value={pct} onSelect={onPctChange} disabled={disabled} />
      <p className="text-sm" aria-live="polite" aria-atomic="true">
        Sell <b>{fmtTokens(sellAmount)}</b>
        {heldWhole !== undefined && <> of {fmtTokens(heldWhole)}</>} ${ticker} for ≈{" "}
        {quoteLoading ? <Skeleton className="inline-block h-3.5 w-14 align-middle" /> : <b>{fmtMon(netOut)}</b>} MON{" "}
        <span className="whitespace-nowrap text-ink/70">(2% fee incl., 5% slippage)</span>
      </p>
    </div>
  );
}
