import { NextResponse } from "next/server";
import { GenerateRequest } from "@/lib/game-config";
import { generateConfig } from "@/lib/server/llm";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60; // local inference can be slow

// POST /api/generate  { prompt, gameType?, ticker? }  ->  { config, source }
export async function POST(req: Request) {
  const rl = rateLimit(`gen:${clientIp(req)}`, 20, 10 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": `${rl.retryAfter}` } });

  const body = GenerateRequest.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Prompt must be 3-280 characters" }, { status: 400 });

  const result = await generateConfig(body.data);
  return NextResponse.json(result);
}
