import { fmtTokens } from "@/lib/format";

export type TradeSide = "buy" | "sell";

/** What the trade button should do right now, and why when it can't. */
export type TradeState =
  | { kind: "loading"; label: string }
  | { kind: "connect" }
  | { kind: "switch" }
  | { kind: "busy" }
  | { kind: "blocked"; label: string; reason: string; help?: { href: string; label: string } }
  | { kind: "ready"; label: string };

export type TradeInputs = {
  side: TradeSide;
  ticker: string;
  mounted: boolean;
  isConnected: boolean;
  wrongChain: boolean;
  busy: boolean;
  statsReady: boolean;
  legacy: boolean;
  soldOut: boolean;
  /** Buy: parsed MON value (null when empty/invalid). */
  value: bigint | null;
  tokensOut: bigint;
  monBalance?: bigint;
  /** Sell: whole tokens held (undefined while loading). */
  heldWhole?: bigint;
  sellAmount: bigint;
  quoteLoading: boolean;
  gasLoading: boolean;
  gasError: Error | null;
  faucetUrl: string;
};

const firstLine = (e: Error) => ((e as { shortMessage?: string }).shortMessage ?? e.message).split("\n")[0].slice(0, 140);

/** Pure decision table for the trade button: every disabled state comes with a reason. */
export function getTradeState(i: TradeInputs): TradeState {
  const $ = `$${i.ticker}`;
  if (!i.mounted) return { kind: "loading", label: "Loading wallet…" };
  if (!i.isConnected) return { kind: "connect" };
  if (i.wrongChain) return { kind: "switch" };
  if (i.busy) return { kind: "busy" };
  if (!i.statsReady) return { kind: "loading", label: "Loading token…" };

  if (i.side === "buy") {
    if (i.soldOut) return { kind: "blocked", label: "Sold out", reason: `Every ${$} on the curve is sold. You can still sell.` };
    if (!i.value) return { kind: "blocked", label: "Enter an amount", reason: "Enter how much MON to spend, or pick a preset." };
    if (i.monBalance !== undefined && i.monBalance < i.value)
      return { kind: "blocked", label: "Not enough MON", reason: "Your wallet has less MON than this amount.", help: { href: i.faucetUrl, label: "Get testnet MON from the faucet" } };
    if (i.quoteLoading) return { kind: "loading", label: "Getting quote…" };
    if (i.tokensOut === 0n) return { kind: "blocked", label: "Amount too small", reason: "That buys less than one whole token. Try a bigger amount." };
  } else {
    if (i.legacy) return { kind: "blocked", label: "Selling unavailable", reason: "This early token was launched before sells existed." };
    if (i.heldWhole === undefined) return { kind: "loading", label: "Loading balance…" };
    if (i.heldWhole === 0n) return { kind: "blocked", label: `No ${$} to sell`, reason: `You don't hold any ${$} yet. Buy some first.` };
    if (i.sellAmount === 0n) return { kind: "blocked", label: "Amount too small", reason: "That rounds down to zero whole tokens. Pick a bigger share." };
    if (i.quoteLoading) return { kind: "loading", label: "Getting quote…" };
  }
  if (i.gasLoading) return { kind: "loading", label: "Estimating gas…" };
  if (i.gasError) return { kind: "blocked", label: "Can't send this trade", reason: firstLine(i.gasError) };
  return { kind: "ready", label: i.side === "buy" ? `Buy ${$}` : `Sell ${fmtTokens(i.sellAmount)} ${$}` };
}
