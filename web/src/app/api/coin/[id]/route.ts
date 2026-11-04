import { NextResponse } from "next/server";
import { getAddress, isAddress, type Address } from "viem";
import { getStore } from "@/lib/server/store";
import { publicClient } from "@/lib/server/chain";
import { gameTokenAbi } from "@/lib/abi";
import { COIN_BASE_PRICE, type CoinData, type CoinHolder, type CoinTrade } from "@/lib/coin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const big = (v: unknown) => {
  try {
    return BigInt(String(v ?? "0"));
  } catch {
    return 0n;
  }
};
const ONE = 10n ** 18n;

/**
 * GET /api/coin/:id — everything the coin trading page needs in one round trip:
 * the game record, live curve state (multicall), every verified trade (for the chart and stats),
 * and holders (balances read on-chain for every wallet that ever traded it, plus the creator,
 * with average-cost basis and P&L from the trade log).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]{6,16}$/.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const store = getStore();
    const game = await store.get(id);
    if (!game || game.status !== "live" || !game.token_address) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const token = game.token_address as Address;
    const events = await store.listEvents({ gameId: id, kinds: ["buy", "sell"], limit: 5000, ascending: true }).catch(() => []);

    const trades: CoinTrade[] = events
      .filter((e) => e.actor && e.tx_hash)
      .map((e) => ({
        id: e.id,
        kind: e.kind as "buy" | "sell",
        at: new Date(e.created_at).getTime(),
        actor: getAddress(e.actor!),
        tokensWhole: String(e.data.tokensWhole ?? "0"),
        value: String(e.data.value ?? "0"),
        fee: String(e.data.fee ?? "0"),
        newPrice: String(e.data.newPrice ?? "0"),
        txHash: e.tx_hash!,
      }));

    // Every wallet that ever traded this coin, plus the creator.
    const candidates = [...new Set([...trades.map((t) => t.actor), ...(isAddress(game.creator) ? [getAddress(game.creator)] : [])])];

    const client = publicClient();
    const base = { address: token, abi: gameTokenAbi } as const;
    const [chainRes, balances] = await Promise.all([
      client.multicall({
        allowFailure: true,
        contracts: [
          { ...base, functionName: "currentPrice" },
          { ...base, functionName: "sold" },
          { ...base, functionName: "reserve" }, // v2 only
          { ...base, functionName: "pendingCreatorFees" },
          { ...base, functionName: "prizePool" }, // v2 only
        ],
      }),
      candidates.length
        ? client.multicall({ allowFailure: true, contracts: candidates.map((a) => ({ ...base, functionName: "balanceOf", args: [a] }) as const) })
        : Promise.resolve([]),
    ]);
    const ok = <T,>(i: number) => (chainRes[i]?.status === "success" ? (chainRes[i].result as T) : null);
    const price = ok<bigint>(0) ?? BigInt(COIN_BASE_PRICE);
    const sold = ok<bigint>(1) ?? 0n;
    const reserve = ok<bigint>(2);
    const pending = ok<bigint>(3) ?? 0n;
    const pool = ok<string>(4);

    // Average-cost books per wallet from the verified trades.
    type Book = { held: bigint; cost: bigint; realized: bigint; trades: number };
    const books = new Map<string, Book>();
    for (const t of trades) {
      const b = books.get(t.actor) ?? { held: 0n, cost: 0n, realized: 0n, trades: 0 };
      const n = big(t.tokensWhole);
      if (t.kind === "buy") {
        b.held += n;
        b.cost += big(t.value) + big(t.fee);
      } else {
        const sellN = n > b.held ? b.held : n;
        const relieved = b.held > 0n ? (b.cost * sellN) / b.held : 0n;
        b.held -= sellN;
        b.cost -= relieved;
        b.realized += big(t.value) - big(t.fee) - relieved;
      }
      b.trades++;
      books.set(t.actor, b);
    }

    const creatorLc = game.creator.toLowerCase();
    const holders: CoinHolder[] = candidates
      .map((addr, i) => {
        const bal = balances[i]?.status === "success" ? (balances[i].result as bigint) / ONE : 0n;
        const b = books.get(addr);
        const trackedHeld = b ? (b.held < bal ? b.held : bal) : 0n;
        const costBasis = b && b.held > 0n ? (b.cost * trackedHeld) / b.held : 0n;
        const value = bal * price;
        return {
          address: addr,
          balanceWhole: bal.toString(),
          pct: Number((bal * 1_000_000n) / 1_000_000_000n) / 10_000,
          value: value.toString(),
          costBasis: costBasis.toString(),
          avgEntryPrice: trackedHeld > 0n ? (costBasis / trackedHeld).toString() : null,
          pnl: b ? (value - costBasis + b.realized).toString() : null,
          isCreator: addr.toLowerCase() === creatorLc,
          tracked: !!b,
        };
      })
      .filter((h) => big(h.balanceWhole) > 0n)
      .sort((a, b) => (big(b.balanceWhole) > big(a.balanceWhole) ? 1 : -1));

    const athPrice = trades.reduce((m, t) => (big(t.newPrice) > m ? big(t.newPrice) : m), price > BigInt(COIN_BASE_PRICE) ? price : BigInt(COIN_BASE_PRICE));

    const body: CoinData = {
      game: {
        id: game.id,
        title: game.config.title,
        ticker: game.config.ticker,
        tokenName: game.config.tokenName,
        tagline: game.config.tagline,
        prompt: game.prompt,
        imageUrl: game.image_url,
        gameType: game.config.gameType,
        colors: game.config.colors,
        createdAt: game.created_at,
        creator: game.creator,
        launchTx: game.tx_hash,
        token,
      },
      chain: {
        price: price.toString(),
        sold: sold.toString(),
        reserve: reserve?.toString() ?? null,
        pendingCreatorFees: pending.toString(),
        prizePool: pool,
        legacy: pool === null,
      },
      trades,
      holders,
      athPrice: athPrice.toString(),
      updatedAt: new Date().toISOString(),
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=4, stale-while-revalidate=15" } });
  } catch (err) {
    return NextResponse.json({ error: "Could not load coin", detail: (err as Error).message.slice(0, 200) }, { status: 502 });
  }
}
