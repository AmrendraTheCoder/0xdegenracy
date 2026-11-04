import { NextResponse } from "next/server";
import { formatEther, isHash } from "viem";
import { getStore } from "@/lib/server/store";
import { tradesFromTx } from "@/lib/server/chain";
import { logError, logEvent } from "@/lib/server/log";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

const fmtTokens = (n: bigint) => Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 }).format(Number(n));

// POST /api/trades { txHash } -> { trades }
// The browser reports a trade it just made. We trust nothing it says except the hash: the receipt is
// read from the chain, and only Bought/Sold events from tokens our factory deployed are recorded.
export async function POST(req: Request) {
  const rl = rateLimit(`trades:${clientIp(req)}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const body = (await req.json().catch(() => null)) as { txHash?: string } | null;
  if (!body?.txHash || !isHash(body.txHash)) return NextResponse.json({ error: "txHash required" }, { status: 400 });

  try {
    const trades = await tradesFromTx(body.txHash);
    const store = getStore();
    for (const t of trades) {
      const game = await store.getByToken(t.token);
      const ticker = game?.config.ticker ?? "TOKEN";
      await logEvent({
        id: t.id,
        kind: t.kind,
        game_id: game?.id ?? null,
        token: t.token,
        tx_hash: t.txHash,
        actor: t.trader,
        created_at: new Date(t.timestamp * 1000).toISOString(),
        message: `${t.kind === "buy" ? "Bought" : "Sold"} ${fmtTokens(t.tokensWhole)} $${ticker} for ${formatEther(t.value)} MON`,
        data: {
          tokensWhole: t.tokensWhole.toString(),
          value: t.value.toString(),
          fee: t.fee.toString(),
          newPrice: t.newPrice.toString(),
          blockNumber: t.blockNumber.toString(),
        },
      });
    }
    return NextResponse.json({ trades: trades.map((t) => ({ id: t.id, kind: t.kind, newPrice: t.newPrice.toString() })) });
  } catch (err) {
    await logError("trades/record", err, { data: { txHash: body.txHash } });
    return NextResponse.json({ error: "Could not record trade", detail: (err as Error).message.slice(0, 200) }, { status: 502 });
  }
}
