import { NextResponse } from "next/server";
import type { Address } from "viem";
import { getStore, type GameEvent, type GameRecord } from "@/lib/server/store";
import { publicClient } from "@/lib/server/chain";
import { gameTokenAbi } from "@/lib/abi";
import {
  WINDOWS,
  WINDOW_MS,
  type DiscoverCoin,
  type DiscoverCreator,
  type DiscoverEvent,
  type DiscoverResponse,
  type DiscoverTrader,
  type DiscoverWindow,
} from "@/lib/discover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE_PRICE = 100_000_000n; // GameTokenFactory.BASE_PRICE (wei per whole token)
const SUPPLY = 1_000_000_000n;
const NEW_MS = 6 * 3_600_000;

const big = (v: unknown) => {
  try {
    return BigInt(String(v ?? "0"));
  } catch {
    return 0n;
  }
};

/**
 * GET /api/discover?window=1h|4h|12h|24h
 * One round trip for the Discover page: live coins (on-chain price and curve progress, windowed
 * volume and price change from the verified trade log), the activity feed, and trader / creator
 * leaderboards. Cached at the edge for a few seconds; the page polls it.
 */
export async function GET(req: Request) {
  const w = new URL(req.url).searchParams.get("window");
  const window: DiscoverWindow = WINDOWS.includes(w as DiscoverWindow) ? (w as DiscoverWindow) : "24h";
  const now = Date.now();
  const since = now - WINDOW_MS[window];

  try {
    const store = getStore();
    const [games, events] = await Promise.all([
      store.list(200),
      store.listEvents({ kinds: ["launch", "buy", "sell", "settle"], limit: 3000 }).catch(() => [] as GameEvent[]),
    ]);
    const live = games.filter((g): g is GameRecord & { token_address: string } => !!g.token_address);
    const byToken = new Map(live.map((g) => [g.token_address.toLowerCase(), g]));
    const byId = new Map(live.map((g) => [g.id, g]));

    // On-chain: current price and curve progress for every coin in one multicall.
    const chain = live.length
      ? await publicClient().multicall({
          allowFailure: true,
          contracts: live.flatMap((g) => [
            { address: g.token_address as Address, abi: gameTokenAbi, functionName: "currentPrice" } as const,
            { address: g.token_address as Address, abi: gameTokenAbi, functionName: "sold" } as const,
          ]),
        })
      : [];

    // Trades oldest-first so "price at window start" is the last trade before it.
    const trades = events.filter((e) => e.kind === "buy" || e.kind === "sell").sort((a, b) => a.created_at.localeCompare(b.created_at));
    type Agg = { volume: bigint; trades: number; startPrice: bigint | null; lastTradeAt: number };
    const agg = new Map<string, Agg>();
    for (const t of trades) {
      const key = (t.token ?? "").toLowerCase();
      if (!byToken.has(key)) continue;
      const a = agg.get(key) ?? { volume: 0n, trades: 0, startPrice: null, lastTradeAt: 0 };
      const at = new Date(t.created_at).getTime();
      if (at < since) a.startPrice = big(t.data.newPrice);
      else {
        a.volume += big(t.data.value);
        a.trades++;
      }
      a.lastTradeAt = Math.max(a.lastTradeAt, at);
      agg.set(key, a);
    }

    const coins: DiscoverCoin[] = live.map((g, i) => {
      const price = chain[i * 2]?.status === "success" ? (chain[i * 2].result as bigint) : BASE_PRICE;
      const sold = chain[i * 2 + 1]?.status === "success" ? (chain[i * 2 + 1].result as bigint) : 0n;
      const a = agg.get(g.token_address.toLowerCase());
      const created = new Date(g.created_at).getTime();
      // Price at the start of the window: last trade before it, else the launch price if it launched
      // inside the window, else unknown (no trades ever recorded before the window).
      const start = a?.startPrice ?? (created >= since ? BASE_PRICE : a ? null : BASE_PRICE);
      const change = start && start > 0n ? (Number(price - start) / Number(start)) * 100 : null;
      return {
        gameId: g.id,
        title: g.config.title,
        ticker: g.config.ticker,
        tokenName: g.config.tokenName,
        imageUrl: g.image_url,
        gameType: g.config.gameType,
        token: g.token_address,
        createdAt: g.created_at,
        price: price.toString(),
        marketCap: (price * SUPPLY).toString(),
        sold: sold.toString(),
        curvePct: Number((sold * 10_000n) / SUPPLY) / 100,
        change,
        volume: (a?.volume ?? 0n).toString(),
        trades: a?.trades ?? 0,
        hot: false,
        isNew: now - created < NEW_MS,
      };
    });
    // HOT: the top 3 coins by windowed volume that actually traded.
    [...coins]
      .filter((c) => c.trades > 0)
      .sort((x, y) => (big(y.volume) > big(x.volume) ? 1 : big(y.volume) < big(x.volume) ? -1 : 0))
      .slice(0, 3)
      .forEach((c) => (c.hot = true));

    // Traders: volume per wallet inside the window.
    const traderMap = new Map<string, DiscoverTrader & { v: bigint }>();
    for (const t of trades) {
      if (!t.actor || new Date(t.created_at).getTime() < since) continue;
      const k = t.actor.toLowerCase();
      const r = traderMap.get(k) ?? { address: t.actor, volume: "0", trades: 0, buys: 0, sells: 0, lastAt: t.created_at, v: 0n };
      r.v += big(t.data.value);
      r.trades++;
      if (t.kind === "buy") r.buys++;
      else r.sells++;
      r.lastAt = t.created_at;
      traderMap.set(k, r);
    }
    const traders = [...traderMap.values()]
      .sort((a, b) => (b.v > a.v ? 1 : b.v < a.v ? -1 : b.trades - a.trades))
      .slice(0, 25)
      .map(({ v, ...r }) => ({ ...r, volume: v.toString() }));

    // Creators: half of every trade fee goes to the coin's creator (1% of the 2%), all time.
    const creatorMap = new Map<string, { address: string; coins: Set<string>; earned: bigint; volume: bigint; best: { id: string; v: bigint } | null }>();
    for (const g of live) {
      const k = g.creator.toLowerCase();
      const r = creatorMap.get(k) ?? { address: g.creator, coins: new Set(), earned: 0n, volume: 0n, best: null };
      r.coins.add(g.id);
      creatorMap.set(k, r);
    }
    for (const t of trades) {
      const g = byToken.get((t.token ?? "").toLowerCase());
      if (!g) continue;
      const r = creatorMap.get(g.creator.toLowerCase());
      if (!r) continue;
      const v = big(t.data.value);
      r.earned += big(t.data.fee) / 2n;
      r.volume += v;
      const coinVol = (r.best?.id === g.id ? r.best.v : 0n) + v;
      if (!r.best || coinVol > r.best.v) r.best = { id: g.id, v: coinVol };
    }
    const creators: DiscoverCreator[] = [...creatorMap.values()]
      .sort((a, b) => (b.earned > a.earned ? 1 : b.earned < a.earned ? -1 : b.coins.size - a.coins.size))
      .slice(0, 25)
      .map((r) => {
        const top = r.best ? byId.get(r.best.id) : live.find((g) => g.creator.toLowerCase() === r.address.toLowerCase());
        return {
          address: r.address,
          coins: r.coins.size,
          earned: r.earned.toString(),
          volume: r.volume.toString(),
          topCoin: top ? { gameId: top.id, ticker: top.config.ticker, imageUrl: top.image_url } : null,
        };
      });

    // Feed: newest first.
    const feed: DiscoverEvent[] = events.slice(0, 60).map((e) => {
      const g = (e.game_id && byId.get(e.game_id)) || (e.token ? byToken.get(e.token.toLowerCase()) : undefined);
      return {
        id: e.id,
        kind: e.kind as DiscoverEvent["kind"],
        createdAt: e.created_at,
        actor: e.actor,
        txHash: e.tx_hash,
        message: e.message,
        value: e.kind === "buy" || e.kind === "sell" ? String(e.data.value ?? "0") : e.kind === "settle" ? String(e.data.paid ?? "0") : null,
        tokensWhole: e.data.tokensWhole ? String(e.data.tokensWhole) : null,
        game: g ? { id: g.id, title: g.config.title, ticker: g.config.ticker, imageUrl: g.image_url, accent: g.config.colors.accent } : null,
      };
    });

    const windowVolume = coins.reduce((s, c) => s + big(c.volume), 0n);
    const body: DiscoverResponse = {
      window,
      updatedAt: new Date(now).toISOString(),
      coins,
      feed,
      traders,
      creators,
      totals: { coins: coins.length, volume: windowVolume.toString(), trades: coins.reduce((s, c) => s + c.trades, 0), traders: traderMap.size },
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=20" } });
  } catch (err) {
    return NextResponse.json({ error: "Could not load discover data", detail: (err as Error).message.slice(0, 200) }, { status: 502 });
  }
}
