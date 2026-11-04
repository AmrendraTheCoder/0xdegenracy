import { NextResponse } from "next/server";
import { getStore } from "@/lib/server/store";

export const runtime = "nodejs";

// GET /api/games/:id  ->  GameRecord. Also the token's on-chain configURI.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]{6,16}$/.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const game = await getStore().get(id);
  if (!game) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { error: _omit, ...publicGame } = game;
  return NextResponse.json(publicGame, {
    headers: { "Cache-Control": game.status === "live" ? "public, s-maxage=300" : "no-store" },
  });
}
