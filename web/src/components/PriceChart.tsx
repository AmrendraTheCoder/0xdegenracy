"use client";

import { useId } from "react";
import type { Address } from "viem";
import { fmtMon, fmtPrice, fmtTokens, short, timeAgo } from "@/lib/format";
import { useLivePrice, useTrades, type Trade } from "@/lib/hooks/useToken";
import { explorerTx } from "@/lib/chain";
import { Card, ErrorState, Notice, Skeleton, cn } from "./ui";
import { Icon } from "./ui/Icon";

const BASE_PRICE = 1e8; // GameTokenFactory.BASE_PRICE

export type PriceChartProps = { gameId: string; launchedAt: string; accent: string; token: Address };

/** Price-over-time step chart from verified trades, plus the latest trades as on-chain proof. */
export function PriceChart({ gameId, launchedAt, accent, token }: PriceChartProps) {
  const { trades, status, retry } = useTrades(gameId);
  // The live on-chain price anchors "now", so the chart is right even for trades made before logging existed.
  const live = useLivePrice(token);
  const last = live !== undefined ? Number(live) : trades.length ? Number(trades.at(-1)!.data.newPrice) : BASE_PRICE;
  const change = ((last - BASE_PRICE) / BASE_PRICE) * 100;
  const up = change >= 0;

  return (
    <Card
      id="price"
      title="Price"
      action={
        <p className="text-right text-sm" aria-live="polite">
          <b>{fmtPrice(last)}</b>{" "}
          <span className={cn("font-bold", up ? "text-up" : "text-hot-strong")}>
            <Icon name={up ? "trendUp" : "trendDown"} size={15} className="mr-0.5 inline align-[-2px]" /> {up ? "+" : ""}
            {change.toFixed(2)}%<span className="sr-only"> since launch</span>
          </span>
        </p>
      }
    >
      {status === "loading" ? (
        <Skeleton className="h-36 w-full" />
      ) : trades.length === 0 ? (
        // Without recorded trades there is no history to draw; a flat line that jumps at the end would mislead.
        <div className="grid h-36 place-items-center rounded-xl border-2 border-dashed border-ink/25 bg-paper/60 px-4 text-center">
          <div>
            <Icon name="activity" size={22} className="mx-auto text-ink/50" />
            <p className="mt-1 text-sm font-bold">Price history starts with the first recorded trade</p>
            <p className="text-xs text-ink/60">Current price {fmtPrice(last)}</p>
          </div>
        </div>
      ) : (
        <StepChart trades={trades} launchedAt={launchedAt} last={last} accent={accent} />
      )}

      <h3 className="mt-4 text-sm font-black">Recent trades</h3>
      <div className="mt-1">
        {status === "loading" ? (
          <div className="space-y-2 py-1" aria-label="Loading trades" role="status">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-4 w-full" />)}
          </div>
        ) : status === "error" ? (
          <ErrorState title="Couldn't load trades" message="The chart may be out of date." onRetry={retry} />
        ) : trades.length === 0 ? (
          <Notice title="No trades yet">Be the first to buy. Price starts at {fmtPrice(BASE_PRICE)}.</Notice>
        ) : (
          <RecentTrades trades={trades.slice(-8).reverse()} />
        )}
      </div>
    </Card>
  );
}

function StepChart({ trades, launchedAt, last, accent }: { trades: Trade[]; launchedAt: string; last: number; accent: string }) {
  const titleId = useId();
  const descId = useId();
  // Points: launch at base price, then the price after each trade, then "now" at the live price.
  const pts = [
    { t: new Date(launchedAt).getTime(), p: BASE_PRICE },
    ...trades.map((tr) => ({ t: new Date(tr.created_at).getTime(), p: Number(tr.data.newPrice) })),
    { t: Date.now(), p: last },
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
  const buys = trades.filter((t) => t.kind === "buy").length;

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-36 w-full" preserveAspectRatio="none" role="img" aria-labelledby={`${titleId} ${descId}`}>
        <title id={titleId}>Price over time</title>
        <desc id={descId}>
          {`Started at ${fmtPrice(BASE_PRICE)} at launch, now ${fmtPrice(last)} after ${trades.length} trades (${buys} buys, ${trades.length - buys} sells).`}
        </desc>
        <path d={`${d} V ${H - pad} H ${x(pts[0].t)} Z`} fill={accent} opacity={0.15} />
        <path d={d} fill="none" stroke={accent} strokeWidth={3} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={d} fill="none" stroke="#141414" strokeWidth={1} strokeLinejoin="round" opacity={0.5} vectorEffect="non-scaling-stroke" />
        {trades.map((tr) => (
          <circle key={tr.id} cx={x(new Date(tr.created_at).getTime())} cy={y(Number(tr.data.newPrice))} r={3.5} fill={tr.kind === "buy" ? "#15803d" : "#ff6b6b"} stroke="#141414" strokeWidth={1} />
        ))}
      </svg>
      <figcaption className="mt-1 flex justify-between text-[11px] text-ink/70">
        <span>launch</span>
        <span>
          {trades.length} trade{trades.length === 1 ? "" : "s"} · <span className="inline-flex items-center gap-1 text-up"><i className="inline-block h-2 w-2 rounded-full bg-up" />buy</span>{" "}
          <span className="inline-flex items-center gap-1 text-hot-strong"><i className="inline-block h-2 w-2 rounded-full bg-hot" />sell</span>
        </span>
        <span>now</span>
      </figcaption>
    </figure>
  );
}

function RecentTrades({ trades }: { trades: Trade[] }) {
  return (
    <ul className="divide-y divide-ink/10 text-xs">
      {trades.map((tr) => (
        <li key={tr.id} className="grid grid-cols-[3rem_1fr_auto] items-center gap-2 py-1.5 sm:grid-cols-[3rem_1fr_auto_auto]">
          <span className={cn("font-black", tr.kind === "buy" ? "text-up" : "text-hot-strong")}>{tr.kind.toUpperCase()}</span>
          <span className="truncate">
            {fmtTokens(BigInt(tr.data.tokensWhole))} · {fmtMon(BigInt(tr.data.value))} MON
          </span>
          <span className="hidden font-mono text-ink/70 sm:inline">{short(tr.actor)}</span>
          <a className="font-bold underline" href={explorerTx(tr.tx_hash)} target="_blank" rel="noreferrer">
            {timeAgo(tr.created_at)}
            <Icon name="external" size={11} className="ml-0.5 inline" />
            <span className="sr-only"> view {tr.kind} transaction on explorer (opens in a new tab)</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
