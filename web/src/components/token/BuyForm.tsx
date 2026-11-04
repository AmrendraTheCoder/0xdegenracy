"use client";

import { NumberInput, Skeleton } from "@/components/ui";
import { fmtTokens } from "@/lib/format";

export const BUY_PRESETS = ["0.001", "0.01", "0.05", "0.1"];

export type BuyFormProps = {
  ticker: string;
  amount: string;
  onAmountChange: (v: string) => void;
  tokensOut: bigint;
  quoteLoading: boolean;
  /** Total fee shown to the user, e.g. "2%". */
  feeLabel: string;
  invalid?: boolean;
  disabled?: boolean;
};

export function BuyForm({ ticker, amount, onAmountChange, tokensOut, quoteLoading, feeLabel, invalid, disabled }: BuyFormProps) {
  return (
    <div className="space-y-2">
      <NumberInput
        label="Amount to spend"
        unit="MON"
        value={amount}
        onChange={onAmountChange}
        presets={BUY_PRESETS.map((p) => ({ label: p, value: p }))}
        error={invalid ? "Enter a number above 0." : undefined}
        disabled={disabled}
      />
      <p className="text-sm" aria-live="polite" aria-atomic="true">
        You get ≈ {quoteLoading ? <Skeleton className="inline-block h-3.5 w-14 align-middle" /> : <b>{fmtTokens(tokensOut)}</b>} ${ticker}{" "}
        <span className="whitespace-nowrap text-ink/70">({feeLabel} fee incl., 5% slippage)</span>
      </p>
    </div>
  );
}
