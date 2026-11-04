"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { explorerAddress, explorerTx } from "@/lib/chain";
import { fmtMon, fmtTokens, short, timeAgo } from "@/lib/format";
import { WINDOWS, type DiscoverCoin, type DiscoverEvent, type DiscoverResponse, type DiscoverWindow } from "@/lib/discover";
import { GAME_META } from "@/games";
import { Badge, Skeleton, buttonClasses, cn } from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/Segmented";
import { AddressAvatar, CoinAvatar } from "./Avatar";

type Sort = "trending" | "new" | "mcap";
type Board = "traders" | "creators";
type Panel = "coins" | "live" | "leaders";

const big = (v: string | null | undefined) => {
  try {
    return BigInt(v ?? "0");
  } catch {
    return 0n;
  }
};
const byBig = (pick: (c: DiscoverCoin) => string) => (a: DiscoverCoin, b: DiscoverCoin) => {
  const x = big(pick(a));
  const y = big(pick(b));
  return y > x ? 1 : y < x ? -1 : 0;
};

export function DiscoverView() {
  const [window, setWindow] = useState<DiscoverWindow>("24h");
  const [sort, setSort] = useState<Sort>("trending");
  const [board, setBoard] = useState<Board>("traders");
  const [panel, setPanel] = useState<Panel>("coins");
  const [q, setQ] = useState("");

  const query = useQuery({
    queryKey: ["discover", window],
    refetchInterval: 8000,
    placeholderData: (prev) => prev, // keep the old window visible while the new one loads
    queryFn: async (): Promise<DiscoverResponse> => {
      const res = await fetch(`/api/discover?window=${window}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail ?? json.error ?? "Could not load");
      return json;
    },
  });
  const data = query.data;

  const coins = useMemo(() => {
    const list = [...(data?.coins ?? [])];
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? list.filter((c) => [c.title, c.ticker, c.tokenName, c.token].some((s) => s.toLowerCase().includes(needle)))
      : list;
    if (sort === "new") return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (sort === "mcap") return filtered.sort(byBig((c) => c.marketCap));
    // trending: windowed volume, then number of trades, then newest
    return filtered.sort((a, b) => byBig((c) => c.volume)(a, b) || b.trades - a.trades || b.createdAt.localeCompare(a.createdAt));
  }, [data, q, sort]);

  return (
    <div className="space-y-5">
      {/* Title + stats + search */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold leading-none sm:text-4xl">Discover</h1>
          <p className="mt-1.5 text-sm text-ink/70">Every coin ships with a game. Find what&apos;s moving right now.</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <label className="relative flex min-w-0 flex-1 items-center sm:w-72 sm:flex-none">
            <span className="sr-only">Search coins</span>
            <Icon name="search" size={16} className="pointer-events-none absolute left-3 text-ink/50" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search coins, tickers, addresses"
              className="w-full rounded-xl border-[3px] border-ink bg-white py-2 pl-9 pr-3 text-sm font-medium shadow-[3px_3px_0_#141414] outline-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-grape/30"
            />
          </label>
          <Link href="/" className={buttonClasses({ variant: "primary", size: "sm" })}>
            <Icon name="spark" size={16} /> Create
          </Link>
        </div>
      </div>

      <TopTicker data={data} loading={query.isLoading} />

      {query.isError && !data ? (
        <div className="brut bg-white p-6 text-center">
          <p className="font-bold">Couldn&apos;t load Discover</p>
          <p className="mt-1 text-sm text-ink/70">{(query.error as Error).message}</p>
          <button className={buttonClasses({ size: "sm", className: "mt-3" })} onClick={() => query.refetch()}>
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* Phones and tablets: one panel at a time */}
          <div className="lg:hidden">
            <Segmented<Panel>
              label="Discover section"
              value={panel}
              onChange={setPanel}
              className="w-full [&>button]:flex-1"
              options={[
                { value: "coins", label: "Coins" },
                { value: "live", label: "Live" },
                { value: "leaders", label: "Leaders" },
              ]}
            />
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
            <Panel
              className={panel === "coins" ? "" : "hidden lg:flex"}
              icon="trendUp"
              title="Coins"
              controls={
                <Segmented<DiscoverWindow> size="xs" label="Time window" value={window} onChange={setWindow} options={WINDOWS.map((w) => ({ value: w, label: w }))} />
              }
              sub={
                <Segmented<Sort>
                  size="xs"
                  label="Sort coins"
                  value={sort}
                  onChange={setSort}
                  options={[
                    { value: "trending", label: "Trending" },
                    { value: "new", label: "New" },
                    { value: "mcap", label: "Market cap" },
                  ]}
                />
              }
            >
              {query.isLoading ? (
                <RowSkeletons />
              ) : coins.length === 0 ? (
                <Empty icon="gamepad" title={q ? "No coins match your search" : "No coins yet"} body={q ? "Try a ticker or part of the name." : "Create the first game."} />
              ) : (
                <ol className="divide-y-2 divide-ink/10">
                  {coins.map((c, i) => (
                    <CoinRow key={c.gameId} coin={c} rank={sort === "trending" ? i + 1 : undefined} window={window} />
                  ))}
                </ol>
              )}
            </Panel>

            <Panel
              className={panel === "live" ? "" : "hidden lg:flex"}
              icon="activity"
              title="Live activity"
              controls={<LiveDot />}
            >
              {query.isLoading ? <RowSkeletons /> : data && data.feed.length > 0 ? <Feed events={data.feed} /> : <Empty icon="activity" title="Nothing yet" body="Launches, buys and sells appear here live." />}
            </Panel>

            <Panel
              className={cn(panel === "leaders" ? "" : "hidden lg:flex", "lg:col-span-2 xl:col-span-1")}
              icon="trophy"
              title="Leaderboard"
              controls={
                <Segmented<Board>
                  size="xs"
                  label="Leaderboard"
                  value={board}
                  onChange={setBoard}
                  options={[
                    { value: "traders", label: "Traders" },
                    { value: "creators", label: "Creators" },
                  ]}
                />
              }
              sub={
                <p className="text-xs text-ink/60">
                  {board === "traders" ? `By MON traded · last ${window}` : "By creator fees earned · all time"}
                  {" · "}
                  <Link href="/leaderboard" className="font-bold text-ink underline">
                    Daily prize pool
                  </Link>
                </p>
              }
            >
              {query.isLoading ? <RowSkeletons /> : <Leaders data={data} board={board} />}
            </Panel>
          </div>
        </>
      )}
      {data && (
        <p className="text-center text-[11px] text-ink/50" aria-live="polite">
          Updated {timeAgo(data.updatedAt)} · refreshes every few seconds{query.isFetching ? " · refreshing" : ""}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- layout pieces

function Panel({ icon, title, controls, sub, className, children }: { icon: IconName; title: string; controls?: ReactNode; sub?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className={cn("brut flex min-w-0 flex-col overflow-hidden bg-white", className)}>
      <header className="space-y-2 border-b-[3px] border-ink bg-paper px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-extrabold">
            <Icon name={icon} size={18} />
            {title}
          </h2>
          {controls}
        </div>
        {sub}
      </header>
      {/* On desktop each column scrolls on its own, like a trading terminal. */}
      <div className="min-h-0 xl:max-h-[calc(100dvh-280px)] xl:overflow-y-auto lg:max-h-[640px] lg:overflow-y-auto">{children}</div>
    </section>
  );
}

function LiveDot() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-white px-2 py-0.5 text-xs font-bold">
      <span className="relative inline-flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-up opacity-60 motion-safe:animate-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-up" />
      </span>
      Live
    </span>
  );
}

function Empty({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <div className="px-4 py-12 text-center">
      <Icon name={icon} size={26} className="mx-auto text-ink/40" />
      <p className="mt-2 font-bold">{title}</p>
      <p className="text-sm text-ink/60">{body}</p>
    </div>
  );
}

function RowSkeletons() {
  return (
    <div className="space-y-3 p-3" role="status" aria-label="Loading">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-11 w-11 rounded-xl" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}

function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-ink/50">no data</span>;
  const up = value >= 0;
  const txt = Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(1)}k` : Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(1);
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-sm font-bold", up ? "text-up" : "text-hot-strong")}>
      <Icon name={up ? "trendUp" : "trendDown"} size={14} />
      {up ? "+" : ""}
      {txt}%
    </span>
  );
}

// ---------------------------------------------------------------- top ticker

function TopTicker({ data, loading }: { data?: DiscoverResponse; loading: boolean }) {
  const items = (data?.traders ?? []).slice(0, 12);
  if (loading) return <Skeleton className="h-12 w-full rounded-2xl" />;
  return (
    <div className="brut flex items-stretch overflow-hidden bg-ink text-white">
      <div className="flex shrink-0 items-center gap-1.5 border-r-2 border-white/15 bg-banana px-3 text-xs font-extrabold uppercase text-ink">
        <Icon name="trophy" size={14} /> Top {data?.window}
      </div>
      {items.length === 0 ? (
        <p className="flex items-center px-4 py-3 text-sm text-white/70">No trades in this window yet. The first trader tops the board.</p>
      ) : (
        <div className="ticker-mask relative min-w-0 flex-1 overflow-hidden">
          {/* Two copies so the loop is seamless; the copy is hidden from screen readers. */}
          <div className="ticker-track flex w-max gap-6 py-3 pl-4 hover:[animation-play-state:paused]">
            {[0, 1].map((copy) => (
              <ul key={copy} aria-hidden={copy === 1} className="flex gap-6">
                {items.map((t, i) => (
                  <li key={t.address + copy} className="flex items-center gap-2 whitespace-nowrap text-sm">
                    <span className="text-xs font-bold text-white/50">#{i + 1}</span>
                    <AddressAvatar address={t.address} size={20} className="border-white/40" />
                    <a href={explorerAddress(t.address)} target="_blank" rel="noreferrer" className="font-bold hover:underline" tabIndex={copy === 1 ? -1 : 0}>
                      {short(t.address)}
                    </a>
                    <span className="font-bold text-[#4ade80]">{fmtMon(big(t.volume), 4)} MON</span>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      )}
      {data && (
        <div className="hidden shrink-0 items-center gap-4 border-l-2 border-white/15 px-4 text-xs md:flex">
          <span>
            <b className="text-sm">{data.totals.coins}</b> coins
          </span>
          <span>
            <b className="text-sm">{fmtMon(big(data.totals.volume), 3)}</b> MON vol
          </span>
          <span>
            <b className="text-sm">{data.totals.traders}</b> traders
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- coins

function CoinRow({ coin: c, rank, window }: { coin: DiscoverCoin; rank?: number; window: DiscoverWindow }) {
  const meta = GAME_META[c.gameType];
  return (
    <li>
      <Link href={`/game/${c.gameId}`} className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-banana/30 focus-visible:bg-banana/30">
        {rank !== undefined && <span className="w-5 shrink-0 text-center text-xs font-bold text-ink/45">{rank}</span>}
        <CoinAvatar src={c.imageUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-extrabold group-hover:underline">{c.title}</span>
            {c.hot && <Badge tone="hot" className="shrink-0 px-1.5 text-[10px]">HOT</Badge>}
            {c.isNew && !c.hot && <Badge tone="mint" className="shrink-0 px-1.5 text-[10px]">NEW</Badge>}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-ink/65">
            <span className="font-bold text-ink">${c.ticker}</span>
            <span aria-hidden>·</span>
            <span className="truncate">{meta?.short ?? c.gameType}</span>
            <span aria-hidden>·</span>
            <span title="Bonding curve progress" className="inline-flex items-center gap-1">
              <span className="inline-block h-1.5 w-10 overflow-hidden rounded-full border border-ink/40 bg-paper">
                <span className="block h-full bg-hot" style={{ width: `${Math.min(100, Math.max(3, c.curvePct))}%` }} />
              </span>
              {c.curvePct.toFixed(1)}%
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-extrabold" title="Market cap at the current price (1B supply)">
            {fmtMon(big(c.marketCap), 3)} <span className="text-[10px] font-bold text-ink/60">MC</span>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Change value={c.change} />
          </div>
          <div className="text-[10px] text-ink/55">
            {c.trades > 0 ? `${fmtMon(big(c.volume), 4)} vol · ${c.trades} tx · ${window}` : `no trades · ${window}`}
          </div>
        </div>
      </Link>
    </li>
  );
}

// ---------------------------------------------------------------- live feed

const KIND: Record<DiscoverEvent["kind"], { label: string; cls: string; icon: IconName }> = {
  launch: { label: "Launched", cls: "bg-banana", icon: "spark" },
  buy: { label: "Bought", cls: "bg-mint", icon: "trendUp" },
  sell: { label: "Sold", cls: "bg-hot", icon: "trendDown" },
  settle: { label: "Paid out", cls: "bg-grape text-white", icon: "trophy" },
};

function Feed({ events }: { events: DiscoverEvent[] }) {
  return (
    <ol className="divide-y-2 divide-ink/10" aria-label="Recent activity">
      {events.map((e) => {
        const k = KIND[e.kind];
        return (
          <li key={e.id} className="flex gap-3 px-3 py-3">
            <div className="relative shrink-0">
              {e.actor ? <AddressAvatar address={e.actor} size={38} /> : <span className="inline-block h-[38px] w-[38px] rounded-full border-2 border-ink bg-grape" />}
              <span className={cn("absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border-2 border-ink", k.cls)}>
                <Icon name={k.icon} size={11} strokeWidth={3} />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug">
                {e.actor ? (
                  <a href={explorerAddress(e.actor)} target="_blank" rel="noreferrer" className="font-extrabold hover:underline">
                    {short(e.actor)}
                  </a>
                ) : (
                  <span className="font-extrabold">Prize pool</span>
                )}{" "}
                <span className="text-ink/70">{k.label.toLowerCase()}</span>{" "}
                {e.kind === "buy" || e.kind === "sell" ? (
                  <>
                    <b>{fmtTokens(big(e.tokensWhole))}</b>{" "}
                  </>
                ) : null}
                {e.game ? (
                  <Link href={`/game/${e.game.id}`} className="font-extrabold underline decoration-2 underline-offset-2" style={{ textDecorationColor: e.game.accent }}>
                    ${e.game.ticker}
                  </Link>
                ) : e.kind === "settle" ? (
                  <b>{fmtMon(big(e.value), 6)} MON</b>
                ) : null}
                {(e.kind === "buy" || e.kind === "sell") && (
                  <>
                    {" "}
                    <span className="text-ink/70">for</span> <b>{fmtMon(big(e.value), 5)} MON</b>
                  </>
                )}
              </p>
              <div className="mt-1 flex items-center gap-3 text-xs text-ink/55">
                <span>{timeAgo(e.createdAt)}</span>
                {e.txHash && (
                  <a href={explorerTx(e.txHash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-bold text-ink/70 hover:text-ink hover:underline">
                    tx <Icon name="external" size={11} />
                  </a>
                )}
              </div>
            </div>
            {e.game && (
              <Link href={`/game/${e.game.id}`} className="shrink-0" aria-label={`Open ${e.game.title}`}>
                <CoinAvatar src={e.game.imageUrl} size={38} />
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------- leaderboard

function Leaders({ data, board }: { data?: DiscoverResponse; board: Board }) {
  const { address } = useAccount();
  const me = address?.toLowerCase();
  const rows = board === "traders" ? data?.traders ?? [] : data?.creators ?? [];
  if (rows.length === 0)
    return (
      <Empty
        icon="trophy"
        title={board === "traders" ? "No traders in this window" : "No creators yet"}
        body={board === "traders" ? "Buy or sell any coin to get on the board." : "Launch a game to start earning 1% of every trade."}
      />
    );
  const rankCls = (i: number) => ["bg-banana", "bg-[#e5e7eb]", "bg-[#f4b183]"][i] ?? "bg-white";
  return (
    <>
    <ol className="divide-y-2 divide-ink/10">
      {board === "traders"
        ? (data?.traders ?? []).map((t, i) => (
            <li key={t.address} className={cn("flex items-center gap-3 px-3 py-2.5", me === t.address.toLowerCase() && "bg-banana/40")}>
              <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-ink text-xs font-black", rankCls(i))}>{i + 1}</span>
              <AddressAvatar address={t.address} size={32} />
              <div className="min-w-0 flex-1">
                <a href={explorerAddress(t.address)} target="_blank" rel="noreferrer" className="block truncate font-extrabold hover:underline">
                  {short(t.address)}
                  {me === t.address.toLowerCase() ? " (you)" : ""}
                </a>
                <div className="text-xs text-ink/60">
                  {t.trades} trades · {t.buys} buys · {t.sells} sells
                </div>
              </div>
              <div className="shrink-0 text-right text-sm font-extrabold text-up">{fmtMon(big(t.volume), 4)} MON</div>
            </li>
          ))
        : (data?.creators ?? []).map((c, i) => (
            <li key={c.address} className={cn("flex items-center gap-3 px-3 py-2.5", me === c.address.toLowerCase() && "bg-banana/40")}>
              <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-ink text-xs font-black", rankCls(i))}>{i + 1}</span>
              <AddressAvatar address={c.address} size={32} />
              <div className="min-w-0 flex-1">
                <a href={explorerAddress(c.address)} target="_blank" rel="noreferrer" className="block truncate font-extrabold hover:underline">
                  {short(c.address)}
                  {me === c.address.toLowerCase() ? " (you)" : ""}
                </a>
                <div className="flex items-center gap-1.5 text-xs text-ink/60">
                  {c.coins} coin{c.coins === 1 ? "" : "s"}
                  {c.topCoin && (
                    <>
                      <span aria-hidden>·</span>
                      <Link href={`/game/${c.topCoin.gameId}`} className="inline-flex items-center gap-1 font-bold text-ink hover:underline">
                        <CoinAvatar src={c.topCoin.imageUrl} size={16} className="rounded-md border" />${c.topCoin.ticker}
                      </Link>
                    </>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-extrabold text-up">{fmtMon(big(c.earned), 6)} MON</div>
                <div className="text-[10px] text-ink/55">earned</div>
              </div>
            </li>
          ))}
    </ol>
    {rows.length < 10 && (
      <div className="m-3 rounded-xl border-2 border-dashed border-ink/30 bg-paper p-3 text-sm">
        <p className="flex items-center gap-1.5 font-extrabold">
          <Icon name="coins" size={16} />
          {board === "traders" ? `${10 - rows.length} spot${10 - rows.length === 1 ? "" : "s"} left in today's top 10` : "Every coin pays its creator"}
        </p>
        <p className="mt-0.5 text-ink/65">
          {board === "traders"
            ? "1% of every trade funds a daily prize pool split between the top 10 traders by volume."
            : "Launch a game and earn 1% of every buy and sell of its coin, forever."}
        </p>
        <Link href={board === "traders" ? "/leaderboard" : "/"} className="mt-2 inline-flex items-center gap-1 font-bold underline">
          {board === "traders" ? "See the prize pool" : "Create a game"} <Icon name="arrowRight" size={14} />
        </Link>
      </div>
    )}
    </>
  );
}
