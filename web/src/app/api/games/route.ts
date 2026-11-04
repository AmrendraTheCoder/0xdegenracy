import { NextResponse } from "next/server";
import { getStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/games?limit=24  ->  { games: GameRecord[] }  (live games only, newest first)
export async function GET(req: Request) {
  const limit = Math.min(50, Math.max(1, Number(new URL(req.url).searchParams.get("limit")) || 24));
  const games = await getStore().list(limit);
  return NextResponse.json({ games }, { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=30" } });
}
