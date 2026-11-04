import { NextResponse } from "next/server";
import { GenerateRequest, type GameConfig } from "@/lib/game-config";
import { generateConfig } from "@/lib/server/llm";
import { generateGameCode, signGameCode } from "@/lib/server/codegen";
import { logError } from "@/lib/server/log";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 90; // config + code generation on local inference can be slow

export type GenerateResponse = {
  config: GameConfig;
  source: "llm" | "fallback";
  /** "preset": one of the 7 hand-built games. "custom": the AI wrote the game's code (sandboxed). */
  mode: "preset" | "custom";
  /** Why a requested custom game became a preset, when it did. */
  note?: string;
};

// POST /api/generate  { prompt, gameType?, ticker? }  ->  GenerateResponse
// 1) The model turns the idea into a config and either picks a preset or marks it "custom".
// 2) For custom ideas it then writes the game code, which is checked and signed here. If that fails,
//    the game falls back to the closest preset so creating never dead-ends.
export async function POST(req: Request) {
  const rl = rateLimit(`gen:${clientIp(req)}`, 20, 10 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": `${rl.retryAfter}` } });

  const body = GenerateRequest.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Prompt must be 3-280 characters" }, { status: 400 });

  const { config, source } = await generateConfig(body.data);
  const toPreset = (note: string): GenerateResponse => ({
    config: { ...config, gameType: config.fallbackType ?? "runner", code: undefined, codeSig: undefined },
    source,
    mode: "preset",
    note,
  });

  if (config.gameType !== "custom") return NextResponse.json({ config, source, mode: "preset" } satisfies GenerateResponse);
  if (source === "fallback") {
    return NextResponse.json(toPreset("The AI isn't connected right now, so this uses the closest preset game."));
  }
  try {
    const code = await generateGameCode(body.data.prompt, config);
    return NextResponse.json({ config: { ...config, code, codeSig: signGameCode(code) }, source, mode: "custom" } satisfies GenerateResponse);
  } catch (err) {
    await logError("generate/custom-code", err, { data: { prompt: body.data.prompt.slice(0, 120) } });
    return NextResponse.json(toPreset("The AI couldn't build a working custom game for this idea, so it uses the closest preset."));
  }
}
