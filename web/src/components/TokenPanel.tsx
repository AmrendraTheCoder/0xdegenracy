"use client";

import { useMemo, useState } from "react";
import { encodeFunctionData, parseAbi, parseEther, type Address } from "viem";
import { useAccount, useBalance, useEstimateGas, useReadContract, useReadContracts, useSendTransaction, useSwitchChain } from "wagmi";
import { gameTokenAbi } from "@/lib/abi";
import { explorerAddress, explorerTx, FAUCET_URL, monadTestnet } from "@/lib/chain";
import type { GameConfig } from "@/lib/game-config";
import { fmtMon, fmtPrice, fmtTokens, short } from "@/lib/format";
import { useTx } from "@/lib/useTx";
import { useToast } from "./Toaster";

// Tokens from the first (buy-only) factory expose quote() instead of quoteBuy() and have no sell().
const legacyAbi = parseAbi(["function quote(uint256 valueWei) view returns (uint256 tokensWhole, uint256 spent, uint256 fee)"]);

const BUY_PRESETS = ["0.001", "0.01", "0.05"];
const SELL_PRESETS = [25, 50, 100];
const SLIPPAGE_BPS = 500n; // 5%: other trades can land between quote and inclusion

export function TokenPanel({ token, config, imageUrl, txHash }: { token: Address; config: GameConfig; imageUrl: string; txHash: string | null }) {
  const { address, chainId, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const { run, busy } = useTx();
  const { toast } = useToast();
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("0.01");
  const [sellPct, setSellPct] = useState(100);

  const base = { address: token, abi: gameTokenAbi, chainId: monadTestnet.id } as const;
  const stats = useReadContracts({
    contracts: [
      { ...base, functionName: "currentPrice" },
      { ...base, functionName: "sold" },
      { ...base, functionName: "TOTAL_SUPPLY_WHOLE" },
      { ...base, functionName: "prizePool" }, // fails on legacy tokens
    ],
    query: { refetchInterval: 4000 },
  });
  const price = stats.data?.[0].result as bigint | undefined;
  const sold = stats.data?.[1].result as bigint | undefined;
  const supply = stats.data?.[2].result as bigint | undefined;
  const legacy = stats.data ? stats.data[3].status === "failure" : false;

  const bal = useBalance({ address, chainId: monadTestnet.id, query: { enabled: !!address, refetchInterval: 6000 } });
  const balTok = useReadContract({ ...base, functionName: "balanceOf", args: [address ?? "0x0000000000000000000000000000000000000000"], query: { enabled: !!address, refetchInterval: 4000 } });
  const heldWhole = (balTok.data ?? 0n) / 10n ** 18n;

  // ---------------------------------------------------------------- buy
  const value = useMemo(() => {
    try {
      const v = parseEther(amount || "0");
      return v > 0n ? v : null;
    } catch {
      return null;
    }
  }, [amount]);
  const quoteNew = useReadContract({ ...base, functionName: "quoteBuy", args: [value ?? 0n], query: { enabled: !!value && !legacy } });
  const quoteOld = useReadContract({ address: token, abi: legacyAbi, functionName: "quote", args: [value ?? 0n], chainId: monadTestnet.id, query: { enabled: !!value && legacy } });
  const tokensOut = (legacy ? quoteOld.data?.[0] : quoteNew.data?.[0]) ?? 0n;
  const minOut = (tokensOut * (10_000n - SLIPPAGE_BPS)) / 10_000n;
  const buyData = useMemo(() => encodeFunctionData({ abi: gameTokenAbi, functionName: "buy", args: [minOut] }), [minOut]);

  // ---------------------------------------------------------------- sell
  const sellAmount = (heldWhole * BigInt(sellPct)) / 100n;
  const sellQuote = useReadContract({ ...base, functionName: "quoteSell", args: [sellAmount], query: { enabled: !legacy && sellAmount > 0n } });
  const netOut = sellQuote.data?.[2] ?? 0n;
  const minMon = (netOut * (10_000n - SLIPPAGE_BPS)) / 10_000n;
  const sellData = useMemo(() => encodeFunctionData({ abi: gameTokenAbi, functionName: "sell", args: [sellAmount, minMon] }), [sellAmount, minMon]);

  // Monad charges the full gas LIMIT, so estimate and add only 10% instead of letting the wallet guess high.
  const isBuy = tab === "buy";
  const gas = useEstimateGas({
    to: token,
    data: isBuy ? buyData : sellData,
    value: isBuy ? (value ?? 0n) : 0n,
    account: address,
    chainId: monadTestnet.id,
    query: { enabled: !!address && (isBuy ? !!value && tokensOut > 0n : sellAmount > 0n) },
  });

  async function trade() {
    if (!gas.data) return;
    const res = await run({
      label: isBuy ? `Buying $${config.ticker}` : `Selling $${config.ticker}`,
      success: isBuy ? `Bought ~${fmtTokens(tokensOut)} $${config.ticker}` : `Sold ${fmtTokens(sellAmount)} $${config.ticker} for ${fmtMon(netOut)} MON`,
      record: true,
      send: () =>
        sendTransactionAsync({
          to: token,
          data: isBuy ? buyData : sellData,
          value: isBuy ? (value ?? 0n) : 0n,
          gas: gas.data + gas.data / 10n,
          chainId: monadTestnet.id,
        }),
    });
    if (res.ok) {
      stats.refetch();
      balTok.refetch();
      bal.refetch();
    }
  }

  const wrongChain = isConnected && chainId !== monadTestnet.id;
  const insufficient = isBuy && bal.data && value ? bal.data.value < value : false;
  const progress = sold !== undefined && supply ? Number((sold * 10000n) / supply) / 100 : 0;
  const canTrade = !!gas.data && !busy && (isBuy ? !!value && tokensOut > 0n && !insufficient : sellAmount > 0n);

  return (
    <aside id="buy" className="brut space-y-4 bg-white p-4">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" className="h-16 w-16 rounded-full border-[3px] border-ink object-cover" />
        <div className="min-w-0">
          <div className="truncate font-[family-name:var(--font-display)] text-xl font-black">{config.tokenName}</div>
          <div className="font-bold" style={{ color: config.colors.accent }}>${config.ticker}</div>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="opacity-70">Price</dt>
        <dd className="text-right font-bold">{price !== undefined ? fmtPrice(price) : "…"}</dd>
        <dt className="opacity-70">Sold</dt>
        <dd className="text-right font-bold">{sold !== undefined ? `${fmtTokens(sold)} (${progress}%)` : "…"}</dd>
        <dt className="opacity-70">Contract</dt>
        <dd className="text-right">
          <a className="font-bold underline" href={explorerAddress(token)} target="_blank" rel="noreferrer">{short(token)}</a>
        </dd>
        {txHash && (
          <>
            <dt className="opacity-70">Launch tx</dt>
            <dd className="text-right">
              <a className="font-bold underline" href={explorerTx(txHash)} target="_blank" rel="noreferrer">{short(txHash)}</a>
            </dd>
          </>
        )}
      </dl>
      <div className="h-3 overflow-hidden rounded-full border-2 border-ink" title="Bonding curve progress">
        <div className="h-full bg-hot" style={{ width: `${Math.max(1, progress)}%` }} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(["buy", "sell"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            disabled={t === "sell" && legacy}
            title={t === "sell" && legacy ? "This early token was launched before sells existed" : undefined}
            className={`brut-btn py-2 text-lg uppercase ${tab === t ? (t === "buy" ? "bg-mint" : "bg-hot text-white") : "bg-white"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {isBuy ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            {BUY_PRESETS.map((p) => (
              <button key={p} onClick={() => setAmount(p)} className={`brut-btn flex-1 py-1 text-sm ${amount === p ? "bg-banana" : "bg-white"}`}>
                {p}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} className="brut w-full bg-paper px-3 py-2 font-bold outline-none" aria-label="Amount in MON" />
            <span className="font-bold">MON</span>
          </div>
          <p className="text-sm">≈ <b>{fmtTokens(tokensOut)}</b> ${config.ticker} <span className="opacity-60">({legacy ? "1%" : "2%"} fee incl.)</span></p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            {SELL_PRESETS.map((p) => (
              <button key={p} onClick={() => setSellPct(p)} className={`brut-btn flex-1 py-1 text-sm ${sellPct === p ? "bg-banana" : "bg-white"}`}>
                {p}%
              </button>
            ))}
          </div>
          <p className="text-sm">
            Sell <b>{fmtTokens(sellAmount)}</b> of {fmtTokens(heldWhole)} ${config.ticker} → ≈ <b>{fmtMon(netOut)}</b> MON <span className="opacity-60">(2% fee incl.)</span>
          </p>
        </div>
      )}

      {!isConnected ? (
        <p className="rounded-lg bg-paper p-2 text-center text-sm font-bold">Connect a wallet (top right) to trade</p>
      ) : wrongChain ? (
        <button className="brut-btn w-full bg-hot py-3 text-white" onClick={() => switchChain({ chainId: monadTestnet.id })}>Switch to Monad testnet</button>
      ) : (
        <button className={`brut-btn w-full py-3 text-xl ${isBuy ? "bg-hot text-white" : "bg-ink text-white"}`} disabled={!canTrade} onClick={trade}>
          {busy ? "Confirming…" : insufficient ? "Not enough MON" : !isBuy && heldWhole === 0n ? `No $${config.ticker} to sell` : `${isBuy ? "BUY" : "SELL"} $${config.ticker}`}
        </button>
      )}
      {insufficient && (
        <a href={FAUCET_URL} target="_blank" rel="noreferrer" className="block text-center text-xs underline">Get testnet MON from the faucet</a>
      )}
      {gas.error && (isBuy ? tokensOut > 0n : sellAmount > 0n) && (
        <p className="text-center text-xs text-hot">{gas.error.message.split("\n")[0].slice(0, 140)}</p>
      )}
      {heldWhole > 0n && <p className="text-center text-xs">You hold {fmtTokens(heldWhole)} ${config.ticker}</p>}

      <button
        className="brut-btn w-full bg-mint py-2"
        onClick={async () => {
          const url = window.location.href.split("?")[0];
          if (navigator.share) await navigator.share({ title: config.title, text: `Play ${config.title} and buy $${config.ticker}`, url }).catch(() => {});
          else {
            await navigator.clipboard.writeText(url);
            toast({ kind: "success", title: "Link copied", description: url });
          }
        }}
      >
        Share
      </button>
      <p className="text-[11px] leading-tight opacity-60">
        Testnet only. Linear bonding curve: price rises with every buy and falls with every sell.
        {!legacy && " 1% of each trade goes to the creator, 1% to the daily prize pool."}
      </p>
    </aside>
  );
}
