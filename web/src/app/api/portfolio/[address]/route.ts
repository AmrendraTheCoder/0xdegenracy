import { NextResponse } from "next/server";
import { getAddress, isAddress, type Address } from "viem";
import { getStore, type GameEvent, type GameRecord } from "@/lib/server/store";
import { publicClient } from "@/lib/server/chain";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";
import { gameTokenAbi } from "@/lib/abi";
import type { GameType } from "@/lib/game-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ONE = 10n ** 18n;

export type PortfolioPosition = {
  gameId: string;
  title: string;
  ticker: string;
  tokenName: string;
  imageUrl: string;
  gameType: GameType;
  token: Address;
  /** v1 tokens have no sell(). */
  sellable: boolean;
  balanceWhole: string;
  /** wei per whole token */
  price: string;
  /** MON (wei) you would receive selling the whole balance now, after fees (v1: balance x price). */
  value: string;
  /** Average-cost basis of the tokens you still hold, from verified trades (wei, fees included). */
  costBasis: string;
  /** Tokens you hold that we have no purchase record for (bought before tracking, or received). */
  untrackedWhole: string;
  realizedPnl: string;
  totalSpent: string;
  totalReceived: string;
  boughtWhole: string;
  soldWhole: string;
  trades: number;
  lastTradeAt: string | null;
};

type Book = { tokens: bigint; cost: bigint; realized: bigint; spent: bigint; received: bigint; bought: bigint; sold: bigint; trades: number; last: string | null };

/** Average-cost accounting over this wallet's verified Bought/Sold events, oldest first. */
function buildBooks(events: GameEvent[]) {
  const books = new Map<string, Book>();
  for (const e of events) {
    if (!e.token) continue;
    const key = e.token.toLowerCase();
    const b = books.get(key) ?? { tokens: 0n, cost: 0n, realized: 0n, spent: 0n, received: 0n, bought: 0n, sold: 0n, trades: 0, last: null };
    const n = BigInt(String(e.data.tokensWhole ?? "0"));
    const value = BigInt(String(e.data.value ?? "0"));
    const fee = BigInt(String(e.data.fee ?? "0"));
    if (e.kind === "buy") {
      const paid = value + fee; // what left the wallet
      b.tokens += n;
      b.cost += paid;
      b.spent += paid;
      b.bought += n;
    } else if (e.kind === "sell") {
      const got = value - fee; // what arrived in the wallet
      const sellN = n > b.tokens ? b.tokens : n; // can't relieve cost for untracked tokens
      const relieved = b.tokens > 0n ? (b.cost * sellN) / b.tokens : 0n;
      b.tokens -= sellN;
      b.cost -= relieved;
      b.realized += got - relieved;
      b.received += got;
      b.sold += n;
    }
    b.trades++;
    b.last = e.created_at;
    books.set(key, b);
  }
  return books;
}

// GET /api/portfolio/:address -> { positions, updatedAt }
export async function GET(req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address: raw } = await params;
  if (!isAddress(raw)) return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  const rl = rateLimit(`portfolio:${clientIp(req)}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const owner = getAddress(raw);

  try {
    const store = getStore();
    const [games, events] = await Promise.all([
      store.list(500),
      store.listEvents({ actor: owner, kinds: ["buy", "sell"], limit: 5000, ascending: true }).catch(() => [] as GameEvent[]),
    ]);
    const live = games.filter((g): g is GameRecord & { token_address: string } => !!g.token_address);
    const client = publicClient();

    // Round 1: balance, price and a v2 probe (prizePool) for every token, in one multicall.
    const r1 = await client.multicall({
      allowFailure: true,
      contracts: live.flatMap((g) => [
        { address: g.token_address as Address, abi: gameTokenAbi, functionName: "balanceOf", args: [owner] } as const,
        { address: g.token_address as Address, abi: gameTokenAbi, functionName: "currentPrice" } as const,
        { address: g.token_address as Address, abi: gameTokenAbi, functionName: "prizePool" } as const,
      ]),
    });

    const books = buildBooks(events);
    const rows = live.map((g, i) => {
      const bal = r1[i * 3].status === "success" ? (r1[i * 3].result as bigint) : 0n;
      const price = r1[i * 3 + 1].status === "success" ? (r1[i * 3 + 1].result as bigint) : 0n;
      const sellable = r1[i * 3 + 2].status === "success";
      return { g, balanceWhole: bal / ONE, price, sellable, book: books.get(g.token_address.toLowerCase()) };
    });
    // Keep coins you hold now, plus ones you traded and fully exited (for realized P&L).
    const relevant = rows.filter((r) => r.balanceWhole > 0n || r.book);

    // Round 2: what selling the full balance would actually return (v2 only).
    const toQuote = relevant.filter((r) => r.sellable && r.balanceWhole > 0n);
    const r2 = toQuote.length
      ? await client.multicall({
          allowFailure: true,
          contracts: toQuote.map((r) => ({ address: r.g.token_address as Address, abi: gameTokenAbi, functionName: "quoteSell", args: [r.balanceWhole] }) as const),
        })
      : [];
    const quoted = new Map(toQuote.map((r, i) => [r.g.id, r2[i]?.status === "success" ? (r2[i].result as readonly [bigint, bigint, bigint])[2] : null]));

    const positions: PortfolioPosition[] = relevant.map(({ g, balanceWhole, price, sellable, book }) => {
      const tracked = book?.tokens ?? 0n;
      const heldTracked = tracked < balanceWhole ? tracked : balanceWhole;
      const costBasis = book && tracked > 0n ? (book.cost * heldTracked) / tracked : 0n;
      const value = quoted.get(g.id) ?? balanceWhole * price;
      return {
        gameId: g.id,
        title: g.config.title,
        ticker: g.config.ticker,
        tokenName: g.config.tokenName,
        imageUrl: g.image_url,
        gameType: g.config.gameType,
        token: getAddress(g.token_address),
        sellable,
        balanceWhole: balanceWhole.toString(),
        price: price.toString(),
        value: value.toString(),
        costBasis: costBasis.toString(),
        untrackedWhole: (balanceWhole > tracked ? balanceWhole - tracked : 0n).toString(),
        realizedPnl: (book?.realized ?? 0n).toString(),
        totalSpent: (book?.spent ?? 0n).toString(),
        totalReceived: (book?.received ?? 0n).toString(),
        boughtWhole: (book?.bought ?? 0n).toString(),
        soldWhole: (book?.sold ?? 0n).toString(),
        trades: book?.trades ?? 0,
        lastTradeAt: book?.last ?? null,
      };
    });
    // Biggest holdings first, closed positions last.
    positions.sort((a, b) => {
      const av = BigInt(a.value);
      const bv = BigInt(b.value);
      return av === bv ? 0 : av > bv ? -1 : 1;
    });
    return NextResponse.json({ positions, updatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: "Could not load portfolio", detail: (err as Error).message.slice(0, 200) }, { status: 502 });
  }
}
