"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { useReadContract } from "wagmi";
import { gameTokenAbi } from "@/lib/abi";
import { explorerTx, monadTestnet } from "@/lib/chain";
import { fmtMon, fmtPrice, fmtTokens, short, timeAgo } from "@/lib/format";
import { TRADE_EVENT } from "@/lib/useTx";

type Trade = {
  id: string;
  created_at: string;
  kind: "buy" | "sell";
  tx_hash: string;
  actor: string;
  data: { tokensWhole: string; value: string; newPrice: string };
};

const BASE_PRICE = 1e8; // GameTokenFactory.BASE_PRICE

/** Price-over-time step chart from verified trades, plus the latest trades as on-chain proof. */
export function PriceChart({ gameId, launchedAt, accent, token }: { gameId: string; launchedAt: string; accent: string; token: Address }) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loaded, setLoaded] = useState(false);
  // The live on-chain price anchors "now", so the chart is right even for trades made before logging existed.
  const live = useReadContract({ address: token, abi: gameTokenAbi, functionName: "currentPrice", chainId: monadTestnet.id, query: { refetchInterval: 5000 } });

  const load = useCallback(async () => {
    const res = await fetch(`/api/games/${gameId}/trades`, { cache: "no-store" }).catch(() => null);
    if (res?.ok) setTrades((await res.json()).trades);
    setLoaded(true);
  }, [gameId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    window.addEventListener(TRADE_EVENT, load);
    return () => {
      clearInterval(t);
      window.removeEventListener(TRADE_EVENT, load);
    };
  }, [load]);

  // Points: launch at base price, then the price after each trade.
  const pts = [
    { t: new Date(launchedAt).getTime(), p: BASE_PRICE },
    ...trades.map((tr) => ({ t: new Date(tr.created_at).getTime(), p: Number(tr.data.newPrice) })),
    { t: Date.now(), p: live.data !== undefined ? Number(live.data) : trades.length ? Number(trades.at(-1)!.data.newPrice) : BASE_PRICE },
  ];
  const W = 320;
  const H = 120;
  const pad = 6;
  const t0 = pts[0].t;
  const t1 = Math.max(pts.at(-1)!.t, t0 + 1);
  const pMin = Math.min(...pts.map((p) => p.p));
  const pMax = Math.max(...pts.map((p) => p.p));
  const span = pMax - pMin || pMax * 0.05 || 1;
  const x = (t: number) => pad + ((t - t0) / (t1 - t0)) * (W - 2 * pad);
  const y = (p: number) => H - pad - ((p - (pMin - span * 0.1)) / (span * 1.2)) * (H - 2 * pad);
  // Step line: price holds until the next trade.
  let d = `M ${x(pts[0].t)} ${y(pts[0].p)}`;
  for (let i = 1; i < pts.length; i++) d += ` H ${x(pts[i].t)} V ${y(pts[i].p)}`;
  const last = pts.at(-1)!.p;
  const change = ((last - BASE_PRICE) / BASE_PRICE) * 100;

  return (
    <section className="brut bg-white p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-black">Price</h2>
        <div className="text-right text-sm">
          <b>{fmtPrice(last)}</b>{" "}
          <span className={change >= 0 ? "text-green-700" : "text-hot"}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-32 w-full" role="img" aria-label="Price over time">
        <path d={`${d} V ${H - pad} H ${x(pts[0].t)} Z`} fill={accent} opacity={0.15} />
        <path d={d} fill="none" stroke={accent} strokeWidth={3} strokeLinejoin="round" />
        {trades.map((tr) => (
          <circle key={tr.id} cx={x(new Date(tr.created_at).getTime())} cy={y(Number(tr.data.newPrice))} r={3.5} fill={tr.kind === "buy" ? "#16a34a" : "#ff6b6b"} stroke="#141414" strokeWidth={1} />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] opacity-60">
        <span>launch</span>
        <span>{trades.length} trades</span>
        <span>now</span>
      </div>

      <h3 className="mt-3 text-sm font-black">Recent trades</h3>
      {!loaded ? (
        <p className="text-xs opacity-60">Loading…</p>
      ) : trades.length === 0 ? (
        <p className="text-xs opacity-60">No trades yet. Be first.</p>
      ) : (
        <ul className="mt-1 divide-y divide-ink/10 text-xs">
          {trades.slice(-8).reverse().map((tr) => (
            <li key={tr.id} className="flex items-center justify-between gap-2 py-1">
              <span className={`font-black ${tr.kind === "buy" ? "text-green-700" : "text-hot"}`}>{tr.kind.toUpperCase()}</span>
              <span>{fmtTokens(BigInt(tr.data.tokensWhole))} · {fmtMon(BigInt(tr.data.value))} MON</span>
              <span className="opacity-60">{short(tr.actor)}</span>
              <a className="underline" href={explorerTx(tr.tx_hash)} target="_blank" rel="noreferrer">{timeAgo(tr.created_at)} ↗</a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
