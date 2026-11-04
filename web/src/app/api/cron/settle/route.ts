import { NextResponse } from "next/server";
import { formatEther } from "viem";
import { env } from "@/lib/server/env";
import { prizePoolAddress, publicClient, settleDay } from "@/lib/server/chain";
import { logError, logEvent } from "@/lib/server/log";
import { prizePoolAbi } from "@/lib/abi";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/cron/settle — run daily by Vercel Cron (vercel.json) just after 00:00 UTC.
// Settles yesterday's prize pool from the platform wallet. Settlement is permissionless on-chain, so
// this is a convenience: anyone can also press "Settle" on /leaderboard.
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const client = publicClient();
    const pool = await prizePoolAddress();
    const today = await client.readContract({ address: pool, abi: prizePoolAbi, functionName: "currentDay" });
    const day = today - 1n;
    const [settled, amount, top] = await Promise.all([
      client.readContract({ address: pool, abi: prizePoolAbi, functionName: "settled", args: [day] }),
      client.readContract({ address: pool, abi: prizePoolAbi, functionName: "poolOf", args: [day] }),
      client.readContract({ address: pool, abi: prizePoolAbi, functionName: "getTop", args: [day] }),
    ]);
    const winners = top.filter((t) => t.user !== "0x0000000000000000000000000000000000000000").length;
    if (settled) return NextResponse.json({ day: day.toString(), status: "already settled" });
    if (amount === 0n && winners === 0) return NextResponse.json({ day: day.toString(), status: "nothing to settle" });

    const { txHash, settled: s } = await settleDay(day);
    await logEvent({
      id: `${txHash}:settle`,
      kind: "settle",
      game_id: null,
      token: pool,
      tx_hash: txHash,
      actor: null,
      message: `Settled day ${day}: ${formatEther(s?.paid ?? 0n)} MON paid to ${winners} traders`,
      data: { day: day.toString(), pool: amount.toString(), paid: (s?.paid ?? 0n).toString(), rolledOver: (s?.rolledOver ?? 0n).toString() },
    });
    return NextResponse.json({ day: day.toString(), status: "settled", txHash });
  } catch (err) {
    await logError("cron/settle", err);
    return NextResponse.json({ error: "settle failed", detail: (err as Error).message.slice(0, 200) }, { status: 502 });
  }
}
