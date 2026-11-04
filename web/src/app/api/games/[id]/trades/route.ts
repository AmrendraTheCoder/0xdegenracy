import { NextResponse } from "next/server";
import { getStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/games/:id/trades -> { trades } oldest first, for the price chart and trade list.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]{6,16}$/.test(id)) return NextResponse.json({ trades: [] });
  const trades = await getStore().listEvents({ gameId: id, kinds: ["buy", "sell"], limit: 500, ascending: true });
  return NextResponse.json({ trades }, { headers: { "Cache-Control": "no-store" } });
}
