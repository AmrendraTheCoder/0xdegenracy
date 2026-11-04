import { NextResponse } from "next/server";
import { getStore, type EventKind } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: EventKind[] = ["launch", "buy", "sell", "settle", "error"];

// GET /api/activity?limit=50&kind=error -> { events } newest first
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const kind = url.searchParams.get("kind") as EventKind | null;
  const events = await getStore().listEvents({ limit, kinds: kind && KINDS.includes(kind) ? [kind] : undefined });
  return NextResponse.json({ events }, { headers: { "Cache-Control": "no-store" } });
}
