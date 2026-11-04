"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { useAccount } from "wagmi";
import type { GameConfig } from "@/lib/game-config";
import { COIN_BASE_PRICE, COIN_SUPPLY, type CoinData, type CoinHolder, type CoinTrade } from "@/lib/coin";
import type { DiscoverResponse } from "@/lib/discover";
import { explorerAddress, explorerTx } from "@/lib/chain";
import { fmtTokens, short, timeAgo } from "@/lib/format";
import { TRADE_EVENT } from "@/lib/useTx";
import { GAME_META } from "@/games";
import { TokenPanel } from "@/components/TokenPanel";
import { GamePlayer } from "@/components/GamePlayer";
import { MobileTradeBar } from "@/components/token/MobileTradeBar";
import { AddressLink, Badge, CopyButton, Skeleton, buttonClasses, cn } from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/Segmented";
import { AddressAvatar, CoinAvatar } from "@/components/discover/Avatar";
import { Feed } from "@/components/discover/DiscoverView";
import { CoinChart } from "./CoinChart";

const big = (v: string | null | undefined) => {
  try {
    return BigInt(v ?? "0");
  } catch {
    return 0n;
  }
};
/** MON value from wei. */
const mon = (wei: bigint | number) => Number(wei) / 1e18;
/** MON market cap for a price (wei per whole token). */
const mcap = (price: bigint | number) => (Number(price) * COIN_SUPPLY) / 1e18;
const fmtMonNum = (v: number, d = 4) => (v === 0 ? "0" : Math.abs(v) < 10 ** -d ? v.toExponential(2) : v.toLocaleString("en", { maximumFractionDigits: d }));

const STAT_WINDOWS = { "5m": 300_000, "1h": 3_600_000, "24h": 86_400_000 } as const;
type StatWindow = keyof typeof STAT_WINDOWS;

/**
 * `focus="chart"` (the /coin page): chart-first trading terminal.
 * `focus="game"` (the /game page): the game takes the left half of the screen; trading sits on the
 * right with everything else (chart, holders, trades, stats, live feed, about) one tab away.
 */
export function CoinView({ id, config, token, imageUrl, focus = "chart" }: { id: string; config: GameConfig; token: Address; imageUrl: string; focus?: "chart" | "game" }) {
  const q = useQuery({
    queryKey: ["coin", id],
    refetchInterval: 6000,
    queryFn: async (): Promise<CoinData> => {
      const res = await fetch(`/api/coin/${id}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail ?? json.error ?? "Could not load coin");
      return json;
    },
  });
  const { refetch } = q;
  // Refresh right after a trade made from the panel on this page.
  useEffect(() => {
    const on = () => setTimeout(() => refetch(), 1200);
    window.addEventListener(TRADE_EVENT, on);
    return () => window.removeEventListener(TRADE_EVENT, on);
  }, [refetch]);

  const d = q.data;

  if (focus === "game") {
    return (
      <div className="terminal-bleed -mt-6 flex flex-col gap-3 px-3 pb-24 pt-3 sm:-mt-8 lg:h-[calc(100dvh-var(--site-header-h))] lg:pb-3">
        <div className="shrink-0">
          <CoinHeader data={d} config={config} imageUrl={imageUrl} token={token} id={id} hidePlay />
        </div>
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
          {/* Left half: the game, as big as the space allows */}
          <section aria-label="Play" className="terminal-hero min-w-0">
            <GamePlayer config={config} imageUrl={imageUrl} gameId={id} tradeHref="#trade" />
          </section>
          {/* Right half: trade + everything else behind tabs */}
          <div className="terminal-col-lg min-w-0 space-y-3 xl:grid xl:h-full xl:min-h-0 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-3 xl:space-y-0">
            <div className="terminal-col-xl min-w-0 xl:order-2">
              <TokenPanel token={token} config={config} imageUrl={imageUrl} id="trade" />
            </div>
            <div className="terminal-col-xl min-w-0 xl:order-1">
              <MoreTabs data={d} accent={config.colors.accent} />
            </div>
          </div>
        </div>
        <MobileTradeBar token={token} ticker={config.ticker} targetId="trade" />
      </div>
    );
  }

  /*
   * Terminal layout. On desktop the whole view is one screen: full browser width, exactly the
   * viewport height under the site header, and every column scrolls on its own (no page scroll).
   * Phones get a normal stacked page: game, chart, trade, stats, details, feed.
   */
  return (
    <div className="terminal-bleed -mt-6 flex flex-col gap-3 px-3 pb-24 pt-3 sm:-mt-8 lg:h-[calc(100dvh-var(--site-header-h))] lg:pb-3">
      <div className="shrink-0">
        <CoinHeader data={d} config={config} imageUrl={imageUrl} token={token} id={id} />
      </div>

      {q.isError && !d && (
        <div className="brut shrink-0 bg-white p-3 text-sm">
          Couldn&apos;t load live data: {(q.error as Error).message}{" "}
          <button className="font-bold underline" onClick={() => q.refetch()}>
            Retry
          </button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(210px,250px)_minmax(0,1fr)_340px] 2xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        {/* Left: live activity across the site (wide screens only; it moves to the bottom elsewhere) */}
        <aside className="hidden min-h-0 xl:block">
          <LivePanel fill />
        </aside>

        {/* Centre: game + chart side by side, details below */}
        <div className="terminal-col min-w-0 space-y-3">
          <div className="terminal-stage flex flex-col gap-3 xl:flex-row">
            <section aria-label="Play" className="terminal-game min-w-0 shrink-0 xl:w-auto">
              <GamePlayer config={config} imageUrl={imageUrl} gameId={id} tradeHref="#trade" />
            </section>
            <section aria-label="Chart" className="brut min-w-0 flex-1 overflow-hidden bg-white lg:h-[var(--stage-h)]">
              {d ? (
                <CoinChart trades={d.trades} createdAt={d.game.createdAt} accent={config.colors.accent} fill />
              ) : (
                <Skeleton className="m-3 h-[calc(100%-24px)] min-h-64" />
              )}
            </section>
          </div>
          <BottomTabs data={d} />
        </div>

        {/* Right: trade, stats, pool, creator */}
        <div className="terminal-col min-w-0 space-y-3">
          <TokenPanel token={token} config={config} imageUrl={imageUrl} id="trade" />
          <StatsCard data={d} />
          <PoolCard data={d} />
          <CreatorCard data={d} />
          {/* Below xl the feed has no column of its own; it lives at the end of this one so it never
              takes height away from the terminal. */}
          <div className="xl:hidden">
            <LivePanel />
          </div>
        </div>
      </div>

      <MobileTradeBar token={token} ticker={config.ticker} targetId="trade" />
    </div>
  );
}

// ---------------------------------------------------------------- header

function CoinHeader({ data: d, config, imageUrl, token, id, hidePlay }: { data?: CoinData; config: GameConfig; imageUrl: string; token: Address; id: string; hidePlay?: boolean }) {
  const price = big(d?.chain.price ?? String(COIN_BASE_PRICE));
  const day = Date.now() - 86_400_000;
  const vol24 = (d?.trades ?? []).filter((t) => t.at >= day).reduce((s, t) => s + big(t.value), 0n);
  const meta = GAME_META[config.gameType as keyof typeof GAME_META];
  return (
    <header className="brut flex flex-col gap-4 bg-white p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <CoinAvatar src={imageUrl} size={64} className="rounded-2xl border-[3px]" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-extrabold leading-tight sm:text-3xl">${config.ticker}</h1>
            <span className="truncate text-lg font-bold text-ink/70">{config.tokenName}</span>
            {d?.chain.legacy && <Badge tone="white">v1 · buy-only</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/70">
            {meta && <Badge tone="mint">{meta.label}</Badge>}
            <span className="inline-flex items-center gap-1 font-mono">
              {short(token)} <CopyButton value={token} label="Copy token address" />
            </span>
            {d && (
              <span className="inline-flex items-center gap-1">
                <AddressAvatar address={d.game.creator} size={16} /> by{" "}
                <a href={explorerAddress(d.game.creator)} target="_blank" rel="noreferrer" className="font-bold hover:underline">
                  {short(d.game.creator)}
                </a>
              </span>
            )}
            {d && <span>{timeAgo(d.game.createdAt)}</span>}
            <a href={explorerAddress(token)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold hover:underline">
              Explorer <Icon name="external" size={12} />
            </a>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <HeadStat label="Market cap" value={`${fmtMonNum(mcap(price))} MON`} big />
        <HeadStat label="24h vol" value={d ? `${fmtMonNum(mon(vol24))} MON` : null} />
        <HeadStat label="Holders" value={d ? String(d.holders.length) : null} />
        <HeadStat label="ATH" value={d ? `${fmtMonNum(mcap(big(d.athPrice)))} MON` : null} />
        {hidePlay ? (
          <Link href={`/coin/${id}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
            <Icon name="trendUp" size={16} /> Full chart
          </Link>
        ) : (
          <Link href={`/game/${id}`} className={buttonClasses({ variant: "primary", size: "sm" })}>
            <Icon name="gamepad" size={16} /> Play
          </Link>
        )}
      </div>
    </header>
  );
}

function HeadStat({ label, value, big: isBig }: { label: string; value: string | null; big?: boolean }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase text-ink/55">{label}</div>
      {value === null ? <Skeleton className="mt-1 h-5 w-20" /> : <div className={cn("font-extrabold", isBig ? "text-2xl" : "text-base")}>{value}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- stats

function StatsCard({ data: d }: { data?: CoinData }) {
  const [w, setW] = useState<StatWindow>("24h");
  const s = useMemo(() => {
    if (!d) return null;
    const since = Date.now() - STAT_WINDOWS[w];
    const inW = d.trades.filter((t) => t.at >= since);
    const before = d.trades.filter((t) => t.at < since);
    const created = new Date(d.game.createdAt).getTime();
    const startPrice = before.length ? Number(before[before.length - 1].newPrice) : created >= since || d.trades.length ? COIN_BASE_PRICE : Number(d.chain.price);
    const now = Number(d.chain.price);
    const buys = inW.filter((t) => t.kind === "buy");
    const sells = inW.filter((t) => t.kind === "sell");
    const sum = (ts: CoinTrade[]) => ts.reduce((a, t) => a + mon(big(t.value)), 0);
    return {
      change: startPrice > 0 ? ((now - startPrice) / startPrice) * 100 : 0,
      volume: sum(inW),
      buys: buys.length,
      sells: sells.length,
      buyVol: sum(buys),
      sellVol: sum(sells),
      buyers: new Set(buys.map((t) => t.actor)).size,
      sellers: new Set(sells.map((t) => t.actor)).size,
    };
  }, [d, w]);

  return (
    <Card title="Stats" icon="activity" action={<Segmented<StatWindow> size="xs" label="Stats window" value={w} onChange={setW} options={(Object.keys(STAT_WINDOWS) as StatWindow[]).map((k) => ({ value: k, label: k }))} />}>
      {!s ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-ink/65">Price change</span>
            <span className={cn("inline-flex items-center gap-1 rounded-full border-2 border-ink px-2 py-0.5 text-xs font-black", s.change >= 0 ? "bg-mint" : "bg-hot")}>
              <Icon name={s.change >= 0 ? "trendUp" : "trendDown"} size={12} />
              {s.change >= 0 ? "+" : ""}
              {s.change.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink/65">Volume</span>
            <b>{fmtMonNum(s.volume)} MON</b>
          </div>
          <Split left={`${s.buys} buys`} right={`${s.sells} sells`} a={s.buys} b={s.sells} />
          <Split left={`${fmtMonNum(s.buyVol)} buy vol`} right={`${fmtMonNum(s.sellVol)} sell vol`} a={s.buyVol} b={s.sellVol} />
          <Split left={`${s.buyers} buyers`} right={`${s.sellers} sellers`} a={s.buyers} b={s.sellers} />
        </div>
      )}
    </Card>
  );
}

function Split({ left, right, a, b }: { left: string; right: string; a: number; b: number }) {
  const total = a + b;
  const pa = total === 0 ? 50 : (a / total) * 100;
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="font-bold text-up">{left}</span>
        <span className="font-bold text-hot-strong">{right}</span>
      </div>
      <div className="mt-1 flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${left} versus ${right}`}>
        <span className={cn("rounded-full", total ? "bg-[#22c55e]" : "bg-ink/15")} style={{ width: `${pa}%` }} />
        <span className={cn("rounded-full", total ? "bg-[#ef4444]" : "bg-ink/15")} style={{ width: `${100 - pa}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- pool + creator

function PoolCard({ data: d }: { data?: CoinData }) {
  const sold = big(d?.chain.sold);
  const pct = Number((sold * 10_000n) / BigInt(COIN_SUPPLY)) / 100;
  return (
    <Card title="Pool" icon="coins">
      {!d ? (
        <Skeleton className="h-20 w-full" />
      ) : (
        <dl className="space-y-2.5 text-sm">
          <Row label="Paired with">MON (bonding curve)</Row>
          <Row label="Curve reserve">{d.chain.reserve ? `${fmtMonNum(mon(big(d.chain.reserve)))} MON` : "not tracked on v1"}</Row>
          <Row label="Sold on curve">
            {fmtTokens(sold)} / 1B
          </Row>
          <div>
            <div className="mb-1 flex justify-between text-xs text-ink/65">
              <span>Bonding curve progress</span>
              <b className="text-ink">{pct.toFixed(2)}%</b>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full border-2 border-ink bg-paper" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Bonding curve progress">
              <div className="h-full bg-hot" style={{ width: `${Math.max(1, pct)}%` }} />
            </div>
          </div>
          <p className="text-[11px] leading-snug text-ink/55">Linear curve: price rises with every buy and falls with every sell. The reserve always covers selling every coin back.</p>
        </dl>
      )}
    </Card>
  );
}

function CreatorCard({ data: d }: { data?: CoinData }) {
  return (
    <Card title="Creator rewards" icon="trophy">
      {!d ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <dl className="space-y-2.5 text-sm">
          <Row label="Creator">
            <a href={explorerAddress(d.game.creator)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-bold hover:underline">
              <AddressAvatar address={d.game.creator} size={18} />
              {short(d.game.creator)}
            </a>
          </Row>
          <Row label="Trading fee">{d.chain.legacy ? "1% (v1)" : "2%"}</Row>
          <Row label="To creator">1% of every trade</Row>
          {!d.chain.legacy && (
            <Row label="To prize pool">
              <Link href="/leaderboard" className="font-bold underline">
                1% · daily top 10
              </Link>
            </Row>
          )}
          {big(d.chain.pendingCreatorFees) > 0n && <Row label="Unclaimed">{fmtMonNum(mon(big(d.chain.pendingCreatorFees)), 6)} MON</Row>}
        </dl>
      )}
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink/65">{label}</dt>
      <dd className="text-right font-bold">{children}</dd>
    </div>
  );
}

function Card({ title, icon, action, children }: { title: string; icon: IconName; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="brut bg-white">
      <header className="flex items-center justify-between gap-2 border-b-2 border-ink/10 px-4 py-2.5">
        <h2 className="flex items-center gap-1.5 text-base font-extrabold">
          <Icon name={icon} size={16} />
          {title}
        </h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------- "more" tabs (game-focused layout)

type More = "chart" | "holders" | "trades" | "stats" | "live" | "about";

/** On the game page everything except the game and the trade panel lives behind these tabs. */
function MoreTabs({ data: d, accent }: { data?: CoinData; accent: string }) {
  const [tab, setTab] = useState<More>("chart");
  return (
    <section aria-label="Coin details" className="brut flex min-h-0 flex-col overflow-hidden bg-white xl:h-full">
      <div className="shrink-0 border-b-2 border-ink/10 px-2 py-2">
        <Segmented<More>
          size="xs"
          label="Show"
          value={tab}
          onChange={setTab}
          className="flex w-full flex-wrap [&>button]:flex-1"
          options={[
            { value: "chart", label: "Chart" },
            { value: "holders", label: <>Holders{d ? <span className="ml-1 opacity-60">{d.holders.length}</span> : null}</> },
            { value: "trades", label: <>Trades{d ? <span className="ml-1 opacity-60">{d.trades.length}</span> : null}</> },
            { value: "stats", label: "Stats" },
            { value: "live", label: "Live" },
            { value: "about", label: "About" },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!d && tab !== "live" ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        ) : tab === "chart" ? (
          <CoinChart trades={d!.trades} createdAt={d!.game.createdAt} accent={accent} height={340} />
        ) : tab === "holders" ? (
          <Holders holders={d!.holders} />
        ) : tab === "trades" ? (
          <Trades trades={d!.trades} />
        ) : tab === "stats" ? (
          <div className="space-y-3 p-3">
            <StatsCard data={d} />
            <PoolCard data={d} />
            <CreatorCard data={d} />
          </div>
        ) : tab === "live" ? (
          <LivePanel />
        ) : (
          <About data={d!} />
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- holders / trades / about

type Tab = "holders" | "trades" | "about";
type HolderFilter = "all" | "profit" | "loss";

function BottomTabs({ data: d }: { data?: CoinData }) {
  const [tab, setTab] = useState<Tab>("holders");
  return (
    <section aria-label="Coin details" className="brut overflow-hidden bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b-2 border-ink/10 px-3 py-2.5">
        <Segmented<Tab>
          label="Details"
          value={tab}
          onChange={setTab}
          options={[
            { value: "holders", label: <>Holders{d ? <span className="ml-1 opacity-60">{d.holders.length}</span> : null}</> },
            { value: "trades", label: <>Trades{d ? <span className="ml-1 opacity-60">{d.trades.length}</span> : null}</> },
            { value: "about", label: "About" },
          ]}
        />
      </div>
      {!d ? (
        <div className="space-y-2 p-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : tab === "holders" ? (
        <Holders holders={d.holders} />
      ) : tab === "trades" ? (
        <Trades trades={d.trades} />
      ) : (
        <About data={d} />
      )}
    </section>
  );
}

function Holders({ holders }: { holders: CoinHolder[] }) {
  const { address } = useAccount();
  const me = address?.toLowerCase();
  const [filter, setFilter] = useState<HolderFilter>("all");
  const [q, setQ] = useState("");
  const rows = holders.filter((h) => {
    if (q && !h.address.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === "profit") return h.pnl !== null && big(h.pnl) > 0n;
    if (filter === "loss") return h.pnl !== null && big(h.pnl) < 0n;
    return true;
  });
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <Segmented<HolderFilter>
          size="xs"
          label="Filter holders"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "profit", label: "In profit" },
            { value: "loss", label: "At a loss" },
          ]}
        />
        <label className="relative">
          <span className="sr-only">Search holder or wallet</span>
          <Icon name="search" size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/50" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search wallet" className="w-44 rounded-lg border-2 border-ink bg-paper py-1 pl-8 pr-2 text-xs outline-none focus-visible:ring-4 focus-visible:ring-grape/30" />
        </label>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink/60">{holders.length === 0 ? "No holders yet." : "No holders match."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="text-left text-[11px] uppercase text-ink/55">
              <tr className="border-b-2 border-ink/10">
                <th className="px-3 py-2 font-bold">Holder</th>
                <th className="px-3 py-2 text-right font-bold">Held</th>
                <th className="px-3 py-2 text-right font-bold">% supply</th>
                <th className="px-3 py-2 text-right font-bold">Value</th>
                <th className="px-3 py-2 text-right font-bold">Avg entry MC</th>
                <th className="px-3 py-2 text-right font-bold">Profit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => {
                const pnl = h.pnl === null ? null : mon(big(h.pnl));
                return (
                  <tr key={h.address} className={cn("border-b border-ink/10 last:border-0", me === h.address.toLowerCase() && "bg-banana/40")}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <AddressAvatar address={h.address} size={26} />
                        <a href={explorerAddress(h.address)} target="_blank" rel="noreferrer" className="font-bold hover:underline">
                          {short(h.address)}
                        </a>
                        {h.isCreator && <Badge tone="banana" className="px-1.5 text-[10px]">DEV</Badge>}
                        {me === h.address.toLowerCase() && <Badge tone="ink" className="px-1.5 text-[10px]">YOU</Badge>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-bold">{fmtTokens(big(h.balanceWhole))}</td>
                    <td className="px-3 py-2 text-right text-ink/70">{h.pct.toFixed(2)}%</td>
                    <td className="px-3 py-2 text-right font-bold">{fmtMonNum(mon(big(h.value)))}</td>
                    <td className="px-3 py-2 text-right text-ink/70">{h.avgEntryPrice ? fmtMonNum(mcap(big(h.avgEntryPrice))) : "—"}</td>
                    <td className={cn("px-3 py-2 text-right font-bold", pnl === null ? "text-ink/45" : pnl >= 0 ? "text-up" : "text-hot-strong")}>
                      {pnl === null ? "no record" : `${pnl >= 0 ? "+" : "−"}${fmtMonNum(Math.abs(pnl), 5)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="px-3 pb-3 pt-1 text-[11px] text-ink/50">Values in MON at the spot price. Holders are every wallet that traded this coin (balances read on-chain), plus the creator.</p>
    </div>
  );
}

function Trades({ trades }: { trades: CoinTrade[] }) {
  const rows = [...trades].reverse().slice(0, 200);
  if (rows.length === 0) return <p className="px-4 py-8 text-center text-sm text-ink/60">No trades yet. Be first.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] text-sm">
        <thead className="text-left text-[11px] uppercase text-ink/55">
          <tr className="border-b-2 border-ink/10">
            <th className="px-3 py-2 font-bold">Time</th>
            <th className="px-3 py-2 font-bold">Type</th>
            <th className="px-3 py-2 font-bold">Wallet</th>
            <th className="px-3 py-2 text-right font-bold">Tokens</th>
            <th className="px-3 py-2 text-right font-bold">MON</th>
            <th className="px-3 py-2 text-right font-bold">MC after</th>
            <th className="px-3 py-2 text-right font-bold">Tx</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="border-b border-ink/10 last:border-0">
              <td className="px-3 py-2 text-ink/70">{timeAgo(new Date(t.at).toISOString())}</td>
              <td className="px-3 py-2">
                <span className={cn("rounded-md border-2 border-ink px-1.5 py-px text-[11px] font-black uppercase", t.kind === "buy" ? "bg-mint" : "bg-hot")}>{t.kind}</span>
              </td>
              <td className="px-3 py-2">
                <a href={explorerAddress(t.actor)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-bold hover:underline">
                  <AddressAvatar address={t.actor} size={18} />
                  {short(t.actor)}
                </a>
              </td>
              <td className="px-3 py-2 text-right font-bold">{fmtTokens(big(t.tokensWhole))}</td>
              <td className={cn("px-3 py-2 text-right font-bold", t.kind === "buy" ? "text-up" : "text-hot-strong")}>{fmtMonNum(mon(big(t.value)), 5)}</td>
              <td className="px-3 py-2 text-right text-ink/70">{fmtMonNum(mcap(big(t.newPrice)))}</td>
              <td className="px-3 py-2 text-right">
                <a href={explorerTx(t.txHash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-bold text-ink/70 hover:text-ink" aria-label="View transaction">
                  <Icon name="external" size={13} />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function About({ data: d }: { data: CoinData }) {
  return (
    <div className="space-y-4 p-4 text-sm">
      <p className="text-base">{d.game.tagline}</p>
      {d.game.prompt && (
        <div>
          <div className="text-[11px] font-bold uppercase text-ink/55">The idea</div>
          <p className="mt-0.5">&ldquo;{d.game.prompt}&rdquo;</p>
        </div>
      )}
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <Row label="Game">{GAME_META[d.game.gameType as keyof typeof GAME_META]?.label ?? d.game.gameType}</Row>
        <Row label="Launched">{new Date(d.game.createdAt).toLocaleString()}</Row>
        <Row label="Token">
          <AddressLink value={d.game.token} copy />
        </Row>
        {d.game.launchTx && (
          <Row label="Launch tx">
            <AddressLink value={d.game.launchTx} kind="tx" />
          </Row>
        )}
      </dl>
      <Link href={`/game/${d.game.id}`} className={buttonClasses({ variant: "primary", size: "sm" })}>
        <Icon name="gamepad" size={16} /> Play {d.game.title}
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------- live feed (site-wide)

function LivePanel({ fill = false }: { fill?: boolean }) {
  const q = useQuery({
    queryKey: ["discover", "24h"],
    refetchInterval: 8000,
    queryFn: async (): Promise<DiscoverResponse> => {
      const res = await fetch(`/api/discover?window=24h`, { cache: "no-store" });
      if (!res.ok) throw new Error("feed unavailable");
      return res.json();
    },
  });
  return (
    <section aria-label="Live activity" className={cn("brut flex flex-col overflow-hidden bg-white", fill && "h-full")}>
      <header className="flex items-center justify-between border-b-2 border-ink/10 px-3 py-2.5">
        <h2 className="flex items-center gap-1.5 text-base font-extrabold">
          <Icon name="activity" size={16} /> Live
        </h2>
        <Link href="/discover" className="text-xs font-bold underline">
          Discover
        </Link>
      </header>
      <div className={cn("overflow-y-auto", fill ? "min-h-0 flex-1" : "max-h-[70vh]")}>
        {q.data ? <Feed events={q.data.feed.slice(0, 30)} /> : <div className="space-y-2 p-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>}
      </div>
    </section>
  );
}
