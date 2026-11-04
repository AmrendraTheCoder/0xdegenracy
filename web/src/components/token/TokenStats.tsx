import { Stat, StatGrid } from "@/components/ui";
import { fmtMon, fmtTokens } from "@/lib/format";

export type TokenStatsProps = {
  loading: boolean;
  ticker: string;
  price?: bigint;
  sold?: bigint;
  supply?: bigint;
  /** Whole tokens held by the connected wallet; omit when not connected. */
  heldWhole?: bigint;
};

export function TokenStats({ loading, ticker, price, sold, supply, heldWhole }: TokenStatsProps) {
  return (
    <StatGrid>
      <Stat label="Price" loading={loading} value={price !== undefined && (Number(price) / 1e18).toExponential(3)} hint="MON per token" />
      <Stat label="Sold" loading={loading} value={sold !== undefined && fmtTokens(sold)} hint={supply !== undefined && `of ${fmtTokens(supply)}`} />
      {heldWhole !== undefined && (
        <Stat
          className="col-span-2"
          label="Your bag"
          value={`${fmtTokens(heldWhole)} $${ticker}`}
          hint={price !== undefined && heldWhole > 0n ? `≈ ${fmtMon(heldWhole * price)} MON at spot` : undefined}
        />
      )}
    </StatGrid>
  );
}
