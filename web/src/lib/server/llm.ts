import "server-only";
import { env } from "./env";
import { normalizeConfig, type GameConfig, type GameType } from "../game-config";

const SYSTEM = `You turn a one-line meme game idea into a JSON game config. Reply with ONE JSON object only, no prose.
Schema:
{"gameType":"flappy|runner|dodge","title":string<=40,"ticker":3-6 uppercase letters,"tokenName":string<=48,
"tagline":string<=80,"scoreLabel":string<=24,"gameOverText":string<=32,"obstacleLabel":string<=16,
"goodItemLabel":string<=16,"colors":{"bg":"#hex","fg":"#hex","accent":"#hex"},
"difficulty":{"speed":0.6-1.8,"gravity":0.6-1.6,"spawnRate":0.6-1.8}}
Pick gameType: flappy = flying/floating/bouncing ideas, runner = running/chasing/escaping, dodge = catching or avoiding falling things.
Tone: degen, funny, short. Bright flat colors with readable fg on bg.
Never use existing brands, trademarked characters, or real people's names.`;

/** Calls the OpenAI-compatible endpoint (OmniRoute). Falls back to an offline config on any failure. */
export async function generateConfig(input: {
  prompt: string;
  gameType?: GameType;
  ticker?: string;
}): Promise<{ config: GameConfig; source: "llm" | "fallback" }> {
  const overrides = { gameType: input.gameType, ticker: input.ticker };
  const e = env();
  if (!e.LLM_BASE_URL) return { config: heuristicConfig(input.prompt, overrides), source: "fallback" };

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    const res = await fetch(`${e.LLM_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        ...(e.LLM_API_KEY ? { Authorization: `Bearer ${e.LLM_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: e.LLM_MODEL,
        temperature: 0.9,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `Idea: ${input.prompt}${input.gameType ? `\nUse gameType: ${input.gameType}` : ""}`,
          },
        ],
      }),
    }).finally(() => clearTimeout(timer));
    if (!res.ok) throw new Error(`LLM ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? "";
    const json = JSON.parse(extractJson(text));
    return { config: normalizeConfig(json, overrides), source: "llm" };
  } catch (err) {
    console.warn("[llm] falling back:", (err as Error).message);
    return { config: heuristicConfig(input.prompt, overrides), source: "fallback" };
  }
}

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no json in response");
  return text.slice(start, end + 1);
}

const PALETTES = [
  { bg: "#ffe066", fg: "#222222", accent: "#ff6b6b" },
  { bg: "#a0e7e5", fg: "#1b1b3a", accent: "#ff5d8f" },
  { bg: "#c3f584", fg: "#16213e", accent: "#7b2cbf" },
  { bg: "#ffafcc", fg: "#2b2d42", accent: "#3a86ff" },
  { bg: "#2b2d42", fg: "#f8f9fa", accent: "#ffbe0b" },
];

/** Deterministic, offline config so demos never block on the LLM. */
export function heuristicConfig(prompt: string, overrides?: { gameType?: GameType; ticker?: string }): GameConfig {
  const p = prompt.toLowerCase();
  const gameType: GameType = /fly|flap|float|bounce|jump over|sky|bird/.test(p)
    ? "flappy"
    : /catch|dodge|fall|rain|drop|collect/.test(p)
      ? "dodge"
      : "runner";
  const words = prompt.replace(/[^a-zA-Z ]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  const hero = words[0] ?? "Degen";
  const STOP =
    /^(the|and|but|for|from|with|behind|into|over|under|through|away|runs?|running|chas(e|es|ing)|catch(es|ing)?|dodg(e|es|ing)|fall(s|ing)?|flap(s|ping)?|flying|jump(s|ing)?|avoid(s|ing)?|my|his|her|their|sea|lots|bunch)$/i;
  const thing = words.find((w, i) => i > 0 && !STOP.test(w)) ?? "coin";
  const hash = [...prompt].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1).toLowerCase();
  const title = `${cap(hero)} vs ${cap(thing)}`;
  return normalizeConfig(
    {
      gameType,
      title,
      ticker: (hero.slice(0, 3) + thing.slice(0, 2)).toUpperCase(),
      tokenName: `${cap(hero)} ${cap(thing)} Coin`,
      tagline: `${cap(hero)} will never catch the ${thing.toLowerCase()}.`,
      scoreLabel: gameType === "runner" ? "Meters" : `${cap(thing)}s`,
      gameOverText: "you got rugged",
      obstacleLabel: "rug",
      goodItemLabel: thing.toLowerCase(),
      colors: PALETTES[hash % PALETTES.length],
      difficulty: { speed: 1, gravity: 1, spawnRate: 1 },
    },
    overrides,
  );
}
