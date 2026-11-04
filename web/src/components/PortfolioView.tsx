"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { encodeFunctionData, type Address } from "viem";
import { useAccount, usePublicClient, useSendTransaction, useSwitchChain } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { gameTokenAbi } from "@/lib/abi";
import { explorerAddress, monadTestnet } from "@/lib/chain";
import { fmtMon, fmtPrice, fmtTokens, short, timeAgo } from "@/lib/format";
import { TRADE_EVENT, useTx } from "@/lib/useTx";
import { errorText, useToast } from "./Toaster";
import { GAME_META } from "@/games";
import type { PortfolioPosition } from "@/app/api/portfolio/[address]/route";

const SLIPPAGE_BPS = 500n;
const PCTS = [25, 50, 100] as const;

type Summary = { value: bigint; cost: bigint; unrealized: bigint; realized: bigint; held: number; costKnown: boolean };

function summarize(ps: PortfolioPosition[]): Summary {
  let value = 0n, cost = 0n, realized = 0n, held = 0, costKnown = true;
  for (const p of ps) {
    realized += BigInt(p.realizedPnl);
    if (BigInt(p.balanceWhole) === 0n) continue;
    held++;
    value += BigInt(p.value);
    cost += BigInt(p.costBasis);
    if (BigInt(p.untrackedWhole) > 0n) costKnown = false;
  }
  return { value, cost, unrealized: value - cost, realized, held, costKnown };
}

function Pnl({ wei, base }: { wei: bigint; base?: bigint }) {
  const pct = base && base > 0n ? Number((wei * 10_000n) / base) / 100 : null;
  const cls = wei > 0n ? "text-green-700" : wei < 0n ? "text-hot" : "";
  return (
    <span className={`font-black ${cls}`}>
      {wei > 0n ? "+" : wei < 0n ? "−" : ""}
      {fmtMon(wei < 0n ? -wei : wei)} MON{pct !== null && <span className="ml-1 text-xs">({pct > 0 ? "+" : ""}{pct.toFixed(1)}%)</span>}
    </span>
  );
}

export function PortfolioView() {
  const { address, chainId, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const q = useQuery({
    queryKey: ["portfolio", address],
    enabled: !!address,
    refetchInterval: 15_000,
    queryFn: async (): Promise<{ positions: PortfolioPosition[]; updatedAt: string }> => {
      const res = await fetch(`/api/portfolio/${address}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail ?? json.error ?? "Could not load portfolio");
      return json;
    },
  });
  // Refresh right after any trade made anywhere in the app.
  const { refetch } = q;
  useEffect(() => {
    const on = () => refetch();
    window.addEventListener(TRADE_EVENT, on);
    return () => window.removeEventListener(TRADE_EVENT, on);
  }, [refetch]);

  const positions = q.data?.positions ?? [];
  const held = positions.filter((p) => BigInt(p.balanceWhole) > 0n);
  const closed = positions.filter((p) => BigInt(p.balanceWhole) === 0n);
  const s = useMemo(() => summarize(positions), [positions]);

  if (!mounted) return <Skeleton />;
  if (!isConnected || !address)
    return (
      <Notice title="Connect your wallet" body="Your portfolio shows every Reachy coin you hold, what you paid, what it's worth now, and lets you sell." />
    );
  if (chainId !== monadTestnet.id)
    return (
      <Notice title="Wrong network" body="Reachy runs on Monad testnet.">
        <button className="brut-btn mt-3 bg-hot px-4 py-2 text-white" onClick={() => switchChain({ chainId: monadTestnet.id })}>Switch to Monad testnet</button>
      </Notice>
    );
  if (q.isLoading) return <Skeleton />;
  if (q.isError)
    return (
      <Notice title="Couldn't load your portfolio" body={(q.error as Error).message}>
        <button className="brut-btn mt-3 bg-white px-4 py-2" onClick={() => q.refetch()}>Retry</button>
      </Notice>
    );

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-4" aria-label="Portfolio summary">
        <Stat label="Value now" value={`${fmtMon(s.value)} MON`} hint="if you sold everything now, after fees" />
        <Stat label="Cost basis" value={`${fmtMon(s.cost)} MON`} hint={s.costKnown ? "what you paid, incl. fees" : "some coins have no purchase record"} />
        <Stat label="Unrealized P&L" value={<Pnl wei={s.unrealized} base={s.cost} />} />
        <Stat label="Realized P&L" value={<Pnl wei={s.realized} />} hint="from coins you sold" />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs opacity-70">
        <span>
          Wallet <a className="underline" href={explorerAddress(address)} target="_blank" rel="noreferrer">{short(address)}</a> · {s.held} coin{s.held === 1 ? "" : "s"} held
        </span>
        <span>
          {q.isFetching ? "Refreshing…" : q.data ? `Updated ${timeAgo(q.data.updatedAt)}` : ""}{" "}
          <button className="ml-2 underline" onClick={() => q.refetch()}>Refresh</button>
        </span>
      </div>

      {held.length === 0 ? (
        <Notice title="No coins yet" body="Buy any game's coin and it shows up here with its cost and live value.">
          <Link href="/" className="brut-btn mt-3 inline-block bg-hot px-4 py-2 text-white">Browse games</Link>
        </Notice>
      ) : (
        <section aria-label="Holdings" className="space-y-3">
          {held.map((p) => (
            <PositionRow key={p.token} p={p} owner={address} onDone={() => q.refetch()} />
          ))}
        </section>
      )}

      {closed.length > 0 && (
        <section aria-label="Closed positions">
          <h2 className="mb-2 font-[family-name:var(--font-display)] text-xl font-black">Closed positions</h2>
          <ul className="brut divide-y divide-ink/10 bg-white text-sm">
            {closed.map((p) => (
              <li key={p.token} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <Link href={`/game/${p.gameId}`} className="font-bold underline">${p.ticker}</Link>
                <span className="opacity-70">{fmtTokens(BigInt(p.boughtWhole))} bought · {fmtTokens(BigInt(p.soldWhole))} sold</span>
                <Pnl wei={BigInt(p.realizedPnl)} base={BigInt(p.totalSpent)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-[11px] leading-tight opacity-60">
        Cost basis uses average cost over trades made through Reachy (each one verified on-chain). Coins bought before tracking existed, or
        received by transfer, count toward value but not cost. Values are what selling returns right now on the bonding curve, after the 2% fee.
      </p>
    </div>
  );
}

function PositionRow({ p, owner, onDone }: { p: PortfolioPosition; owner: Address; onDone: () => void }) {
  const client = usePublicClient({ chainId: monadTestnet.id });
  const { sendTransactionAsync } = useSendTransaction();
  const { run, busy } = useTx();
  const { toast } = useToast();
  const [pending, setPending] = useState<number | null>(null);

  const balance = BigInt(p.balanceWhole);
  const value = BigInt(p.value);
  const cost = BigInt(p.costBasis);
  const untracked = BigInt(p.untrackedWhole);
  const meta = GAME_META[p.gameType] ?? GAME_META.runner;
  const avgCost = balance - untracked > 0n && cost > 0n ? cost / (balance - untracked) : 0n;

  async function sell(pct: number) {
    if (!client) return;
    const amount = (balance * BigInt(pct)) / 100n;
    if (amount === 0n) return;
    setPending(pct);
    try {
      // Re-quote right before sending: the price may have moved since the page loaded.
      const [, , net] = await client.readContract({ address: p.token, abi: gameTokenAbi, functionName: "quoteSell", args: [amount] });
      const minMon = (net * (10_000n - SLIPPAGE_BPS)) / 10_000n;
      const data = encodeFunctionData({ abi: gameTokenAbi, functionName: "sell", args: [amount, minMon] });
      // Monad charges the full gas LIMIT, so keep it tight.
      const est = await client.estimateGas({ account: owner, to: p.token, data });
      const res = await run({
        label: `Selling ${pct}% of $${p.ticker}`,
        success: `Sold ${fmtTokens(amount)} $${p.ticker} for ~${fmtMon(net)} MON`,
        record: true,
        send: () => sendTransactionAsync({ to: p.token, data, gas: est + est / 10n, chainId: monadTestnet.id }),
      });
      if (res.ok) onDone();
    } catch (err) {
      // run() reports wallet/tx errors itself; this catches quote or gas-estimate failures before it.
      toast({ kind: "error", title: `Can't sell $${p.ticker} right now`, description: errorText(err) });
    } finally {
      setPending(null);
    }
  }

  return (
    <article className="brut grid gap-3 bg-white p-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="flex min-w-0 items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-full border-[3px] border-ink object-cover" loading="lazy" />
        <div className="min-w-0">
          <Link href={`/game/${p.gameId}`} className="block truncate font-[family-name:var(--font-display)] text-lg font-black hover:underline">
            ${p.ticker} <span className="text-sm font-bold opacity-60">{p.tokenName}</span>
          </Link>
          <div className="text-xs opacity-70">
            {meta.emoji} {p.title} · {p.trades} trade{p.trades === 1 ? "" : "s"}
            {p.lastTradeAt ? ` · last ${timeAgo(p.lastTradeAt)}` : ""}
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4 sm:text-right">
        <div>
          <dt className="text-xs opacity-60">Holding</dt>
          <dd className="font-bold">{fmtTokens(balance)}</dd>
        </div>
        <div>
          <dt className="text-xs opacity-60">Value now</dt>
          <dd className="font-bold">{fmtMon(value)} MON</dd>
        </div>
        <div>
          <dt className="text-xs opacity-60">Cost{avgCost > 0n ? ` · avg ${fmtPrice(avgCost)}` : ""}</dt>
          <dd className="font-bold">{cost > 0n ? `${fmtMon(cost)} MON` : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs opacity-60">P&L</dt>
          <dd>{cost > 0n ? <Pnl wei={value - cost} base={cost} /> : <span className="text-xs opacity-60">no record</span>}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        {p.sellable ? (
          <>
            <span className="text-xs font-bold opacity-60">Sell</span>
            {PCTS.map((pct) => (
              <button
                key={pct}
                className={`brut-btn px-3 py-1.5 text-sm ${pct === 100 ? "bg-ink text-white" : "bg-white"}`}
                disabled={busy || (balance * BigInt(pct)) / 100n === 0n}
                onClick={() => sell(pct)}
                aria-label={`Sell ${pct}% of ${p.ticker}`}
              >
                {pending === pct ? "Selling…" : `${pct}%`}
              </button>
            ))}
          </>
        ) : (
          <span className="text-xs opacity-70">Launched before sells existed: this coin is buy-only.</span>
        )}
        <Link href={`/game/${p.gameId}`} className="ml-auto text-sm font-bold underline">Play & trade →</Link>
      </div>
      {untracked > 0n && (
        <p className="text-[11px] opacity-60 sm:col-span-2">{fmtTokens(untracked)} of these have no purchase record (bought before tracking), so their cost isn&apos;t counted.</p>
      )}
    </article>
  );
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="brut bg-white p-4">
      <div className="text-xs font-bold uppercase opacity-60">{label}</div>
      <div className="mt-1 text-lg">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] opacity-60">{hint}</div>}
    </div>
  );
}

function Notice({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <section className="brut bg-white p-6 text-center">
      <h2 className="font-[family-name:var(--font-display)] text-2xl font-black">{title}</h2>
      <p className="mt-1 text-sm opacity-80">{body}</p>
      {children}
    </section>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading portfolio">
      <div className="grid gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="brut h-20 animate-pulse bg-white/70" />
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="brut h-28 animate-pulse bg-white/70" />
      ))}
    </div>
  );
}
