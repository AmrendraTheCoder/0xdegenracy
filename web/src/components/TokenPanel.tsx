"use client";

import { useState } from "react";
import type { Address } from "viem";
import { useAccount, useSendTransaction, useSwitchChain } from "wagmi";
import { FAUCET_URL, monadTestnet } from "@/lib/chain";
import type { GameConfig } from "@/lib/game-config";
import { fmtMon, fmtTokens } from "@/lib/format";
import { useMounted } from "@/lib/hooks/useMounted";
import { parseMon, useBuyQuote, useSellQuote, useTokenBalances, useTokenStats, useTradeGas } from "@/lib/hooks/useToken";
import { useTx } from "@/lib/useTx";
import { ErrorState, TabPanel, Tabs } from "./ui";
import { BuyForm } from "./token/BuyForm";
import { CurveProgress } from "./token/CurveProgress";
import { SellForm, type SellPct } from "./token/SellForm";
import { ShareButton } from "./token/ShareButton";
import { TokenHeader } from "./token/TokenHeader";
import { TokenStats } from "./token/TokenStats";
import { TradeButton } from "./token/TradeButton";
import { getTradeState, type TradeSide } from "./token/tradeState";

export type TokenPanelProps = {
  token: Address;
  config: GameConfig;
  imageUrl: string;
  /** Anchor id; the game's "buy" CTA and the mobile trade bar link here. */
  id?: string;
};

/**
 * Container: wires the token hooks to the presentational pieces in ./token.
 * All chain reads live in hooks (useTokenStats / useBuyQuote / useSellQuote / useTradeGas);
 * the button's enabled/disabled logic lives in the pure getTradeState().
 */
export function TokenPanel({ token, config, imageUrl, id = "buy" }: TokenPanelProps) {
  const mounted = useMounted();
  const { chainId, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const { run, busy } = useTx();

  const [side, setSide] = useState<TradeSide>("buy");
  const [amount, setAmount] = useState("0.01");
  const [pct, setPct] = useState<SellPct>(100);

  const stats = useTokenStats(token);
  const bal = useTokenBalances(token);
  const isBuy = side === "buy" || stats.legacy;
  const activeSide: TradeSide = isBuy ? "buy" : "sell";

  const buy = useBuyQuote(token, amount, stats.legacy, isBuy && stats.status === "ready" && !stats.soldOut);
  const sellAmount = ((bal.heldWhole ?? 0n) * BigInt(pct)) / 100n;
  const sell = useSellQuote(token, sellAmount, !isBuy && !stats.legacy);

  const insufficient = isBuy && buy.value !== null && bal.mon !== undefined && bal.mon < buy.value;
  const gas = useTradeGas({
    to: token,
    data: isBuy ? buy.data : sell.data,
    value: isBuy ? (buy.value ?? 0n) : 0n,
    enabled: isBuy ? !!buy.value && buy.tokensOut > 0n && !insufficient : sellAmount > 0n && sell.netOut > 0n,
  });

  const state = getTradeState({
    side: activeSide,
    ticker: config.ticker,
    mounted,
    isConnected,
    wrongChain: isConnected && chainId !== monadTestnet.id,
    busy,
    statsReady: stats.status === "ready",
    legacy: stats.legacy,
    soldOut: stats.soldOut,
    value: buy.value,
    tokensOut: buy.tokensOut,
    monBalance: bal.mon,
    heldWhole: bal.heldWhole,
    sellAmount,
    quoteLoading: isBuy ? buy.loading : sell.loading,
    gasLoading: gas.loading,
    gasError: gas.error,
    faucetUrl: FAUCET_URL,
  });

  async function trade() {
    if (!gas.limit || state.kind !== "ready") return;
    const res = await run({
      label: isBuy ? `Buying $${config.ticker}` : `Selling $${config.ticker}`,
      success: isBuy ? `Bought ~${fmtTokens(buy.tokensOut)} $${config.ticker}` : `Sold ${fmtTokens(sellAmount)} $${config.ticker} for ${fmtMon(sell.netOut)} MON`,
      record: true,
      send: () =>
        sendTransactionAsync({
          to: token,
          data: isBuy ? buy.data : sell.data,
          value: isBuy ? (buy.value ?? 0n) : 0n,
          gas: gas.limit,
          chainId: monadTestnet.id,
        }),
    });
    if (res.ok) {
      stats.refetch();
      bal.refetch();
    }
  }

  const showBag = mounted && isConnected && bal.heldWhole !== undefined;
  const headingId = `${id}-heading`;
  const tabs = "trade";

  return (
    <aside id={id} aria-labelledby={headingId} className="brut min-w-0 scroll-mt-24 space-y-4 bg-white p-4">
      <TokenHeader name={config.tokenName} ticker={config.ticker} imageUrl={imageUrl} accent={config.colors.accent} legacy={stats.legacy} headingId={headingId} />

      {stats.status === "error" ? (
        <ErrorState title="Can't reach the token contract" message="The Monad RPC didn't answer. Prices and trading are paused until it does." onRetry={stats.refetch} />
      ) : (
        <>
          <TokenStats loading={stats.status === "loading"} ticker={config.ticker} price={stats.price} sold={stats.sold} supply={stats.supply} heldWhole={showBag ? bal.heldWhole : undefined} />
          <CurveProgress progress={stats.progress} loading={stats.status === "loading"} soldOut={stats.soldOut} />
        </>
      )}

      <div className="space-y-3">
        <Tabs
          label="Trade direction"
          idPrefix={tabs}
          value={activeSide}
          onChange={setSide}
          items={[
            { id: "buy", label: "Buy", activeClassName: "bg-mint" },
            { id: "sell", label: "Sell", activeClassName: "bg-ink text-white", disabled: stats.legacy, disabledReason: "This early token was launched before sells existed." },
          ]}
        />
        {stats.legacy && <p className="text-xs text-ink/70">This early token is buy-only: it was launched before sells existed.</p>}
        <TabPanel idPrefix={tabs} id={activeSide} className="space-y-3">
          {isBuy ? (
            <BuyForm
              ticker={config.ticker}
              amount={amount}
              onAmountChange={setAmount}
              tokensOut={buy.tokensOut}
              quoteLoading={buy.loading}
              feeLabel={stats.legacy ? "1%" : "2%"}
              invalid={amount !== "" && parseMon(amount) === null}
              disabled={busy}
            />
          ) : (
            <SellForm ticker={config.ticker} pct={pct} onPctChange={setPct} heldWhole={bal.heldWhole} sellAmount={sellAmount} netOut={sell.netOut} quoteLoading={sell.loading} disabled={busy} />
          )}
          <TradeButton state={state} side={activeSide} onTrade={trade} onSwitchChain={() => switchChain({ chainId: monadTestnet.id })} reasonId={`${id}-reason`} />
        </TabPanel>
      </div>

      <ShareButton title={config.title} text={`Play ${config.title} and buy $${config.ticker}`} />
      <p className="text-xs leading-snug text-ink/70">
        Testnet only. Linear bonding curve: price rises with every buy and falls with every sell.
        {!stats.legacy && " 1% of each trade goes to the creator, 1% to the daily prize pool."}
      </p>
    </aside>
  );
}
