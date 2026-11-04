import { z } from "zod";

// The LLM contract. The model may only return this JSON; everything is validated, clamped and
// defaulted here so a junk response can never break a game page.

export const GAME_TYPES = ["flappy", "runner", "dodge", "whack", "snake", "breakout", "shooter"] as const;
export type GameType = (typeof GAME_TYPES)[number];

const HEX = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;

export type GameConfig = {
  gameType: GameType;
  title: string;
  ticker: string;
  tokenName: string;
  tagline: string;
  scoreLabel: string;
  gameOverText: string;
  obstacleLabel: string;
  goodItemLabel: string;
  colors: { bg: string; fg: string; accent: string };
  difficulty: { speed: number; gravity: number; spawnRate: number };
};

export const DEFAULT_CONFIG: GameConfig = {
  gameType: "runner",
  title: "Degen Dash",
  ticker: "DEGEN",
  tokenName: "Degen Dash Coin",
  tagline: "It only goes up. Probably.",
  scoreLabel: "Score",
  gameOverText: "you got rugged",
  obstacleLabel: "rug",
  goodItemLabel: "coin",
  colors: { bg: "#ffe066", fg: "#222222", accent: "#ff6b6b" },
  difficulty: { speed: 1, gravity: 1, spawnRate: 1 },
};

// Strip control chars and angle brackets, collapse whitespace, cap length.
export function cleanText(v: unknown, max: number, fallback: string): string {
  if (typeof v !== "string") return fallback;
  const s = v
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return s || fallback;
}

export function cleanTicker(v: unknown, fallback = DEFAULT_CONFIG.ticker): string {
  const s = typeof v === "string" ? v.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6) : "";
  return s.length >= 3 ? s : fallback;
}

const clamp = (v: unknown, lo: number, hi: number, d: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

const color = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v : d);

/** Loose input shape: anything may be missing or wrong. */
const Loose = z.record(z.unknown());

/** Normalise any object into a safe GameConfig. Never throws. */
export function normalizeConfig(raw: unknown, overrides?: { gameType?: GameType; ticker?: string }): GameConfig {
  const parsed = Loose.safeParse(raw);
  const r: Record<string, unknown> = parsed.success ? parsed.data : {};
  const c = (Loose.safeParse(r.colors).data ?? {}) as Record<string, unknown>;
  const d = (Loose.safeParse(r.difficulty).data ?? {}) as Record<string, unknown>;
  const D = DEFAULT_CONFIG;

  const gameType =
    overrides?.gameType ?? (GAME_TYPES.includes(r.gameType as GameType) ? (r.gameType as GameType) : D.gameType);
  const title = cleanText(r.title, 40, D.title);
  return {
    gameType,
    title,
    ticker: overrides?.ticker ? cleanTicker(overrides.ticker, cleanTicker(r.ticker)) : cleanTicker(r.ticker),
    tokenName: cleanText(r.tokenName, 48, `${title} Coin`.slice(0, 48)),
    tagline: cleanText(r.tagline, 80, D.tagline),
    scoreLabel: cleanText(r.scoreLabel, 24, D.scoreLabel),
    gameOverText: cleanText(r.gameOverText, 32, D.gameOverText),
    obstacleLabel: cleanText(r.obstacleLabel, 16, D.obstacleLabel),
    goodItemLabel: cleanText(r.goodItemLabel, 16, D.goodItemLabel),
    colors: { bg: color(c.bg, D.colors.bg), fg: color(c.fg, D.colors.fg), accent: color(c.accent, D.colors.accent) },
    difficulty: {
      speed: clamp(d.speed, 0.6, 1.8, 1),
      gravity: clamp(d.gravity, 0.6, 1.6, 1),
      spawnRate: clamp(d.spawnRate, 0.6, 1.8, 1),
    },
  };
}

export const GenerateRequest = z.object({
  prompt: z.string().trim().min(3).max(280),
  gameType: z.enum(GAME_TYPES).optional(),
  ticker: z.string().max(12).optional(),
});
