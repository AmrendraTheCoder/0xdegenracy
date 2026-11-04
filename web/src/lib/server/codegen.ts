import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";
import { MAX_GAME_CODE, type GameConfig } from "../game-config";

/**
 * AI game code generation. The model writes ONE function, `createGame(api)`, in the same shape our
 * preset games use. The code never runs on our server or in our page: it runs in a sandboxed iframe
 * with an opaque origin and a no-network CSP (see lib/customGameHtml.ts). This file only produces,
 * checks and signs the source.
 */

const CONTRACT = `You write tiny HTML5 canvas arcade games as ONE JavaScript function. Output only a single \`\`\`js code block.

The function must be exactly:
function createGame(api) {
  // set up state here
  return {
    update(dt, input) { /* advance the game by dt seconds */ },
    draw(g) { /* draw one frame with the 2D context g */ },
  };
}

The runtime (already provided, do not write it) clears the screen, runs the loop, shows the start and
game-over screens and draws the score. You get:
- api.W = 400, api.H = 600 (logical canvas size; portrait).
- api.cfg: { title, scoreLabel, obstacleLabel, goodItemLabel, colors: { bg, fg, accent }, difficulty: { speed, gravity, spawnRate } }.
- api.drawHero(g, x, y, r): draws the PLAYER'S FACE as a circle of radius r. The player character MUST be drawn with this.
- api.addScore(n), api.end() (call when the player loses), api.rand(min, max), api.shake(px),
  api.label(g, text, x, y, size, color) (centered bold text), api.hearts(g, x, y, lives, max) (lives display, right-aligned at x),
  api.burst(x, y, color, count) (particles), api.circleRect(cx, cy, r, x, y, w, h) -> boolean.
- input each frame: { tapped (tap/click/Space/Enter/Up this frame), tap: {x, y} | null, dir: "up"|"down"|"left"|"right"|null (this frame),
  axis: -1..1 (held left/right), duck (held down), pointerX: number | null (finger/mouse x while held), keys: Set of held KeyboardEvent.code }.

Rules:
- Plain modern JavaScript, no imports, no DOM, no network, no timers, no Math.random seeding tricks; use dt for all motion.
- Keep it under 220 lines. Make it playable in 5 seconds: simple rules, clear goal, it gets harder over time.
- The player must be able to lose (call api.end()). Award points with api.addScore().
- Draw the background details yourself if needed, using api.cfg.colors. Use api.cfg.obstacleLabel / goodItemLabel for things.
- Support both keyboard (input.axis / input.dir / input.tapped) and touch (input.pointerX / input.tap) where it makes sense.`;

const EXAMPLE = `\`\`\`js
function createGame(api) {
  const { W, H } = api;
  const c = api.cfg.colors;
  const hero = { x: W / 2, y: H - 80, r: 26 };
  let rocks = [];
  let t = 0;
  let spawn = 0.8;
  return {
    update(dt, input) {
      t += dt;
      if (input.pointerX !== null) hero.x += (input.pointerX - hero.x) * Math.min(1, dt * 12);
      else hero.x += input.axis * 380 * dt;
      hero.x = Math.max(hero.r, Math.min(W - hero.r, hero.x));
      spawn -= dt;
      if (spawn <= 0) {
        rocks.push({ x: api.rand(20, W - 20), y: -20, r: api.rand(12, 22), v: 180 + t * 8 });
        spawn = Math.max(0.25, 0.8 - t / 60);
      }
      for (const r of rocks) {
        r.y += r.v * dt;
        if (Math.hypot(r.x - hero.x, r.y - hero.y) < r.r + hero.r - 4) { api.burst(hero.x, hero.y, c.accent, 30); api.end(); }
      }
      const before = rocks.length;
      rocks = rocks.filter((r) => r.y < H + 30);
      api.addScore(before - rocks.length);
    },
    draw(g) {
      g.fillStyle = c.fg;
      for (const r of rocks) { g.beginPath(); g.arc(r.x, r.y, r.r, 0, Math.PI * 2); g.fill(); }
      api.drawHero(g, hero.x, hero.y, hero.r);
    },
  };
}
\`\`\``;

/** Things AI game code has no business doing. The sandbox blocks them anyway; we reject early so broken or
 *  manipulated output never ships. */
const FORBIDDEN: [RegExp, string][] = [
  [/\b(fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|navigator\.sendBeacon)\b/, "network access"],
  [/\bimport\s*\(|^\s*import\s|\brequire\s*\(/m, "imports"],
  [/\beval\s*\(|\bnew\s+Function\b|\bFunction\s*\(/, "dynamic code"],
  // Bare globals only (not property names like `brick.top` or `node.parent`).
  [/(?<![\w.$])(document|window|top|parent|opener|globalThis)\s*[.[]/, "page access"],
  [/\b(postMessage|localStorage|sessionStorage|indexedDB)\b/, "messaging or storage access"],
  [/\b(setTimeout|setInterval|requestAnimationFrame)\s*\(/, "timers (use dt)"],
  [/\bwhile\s*\(\s*(true|1)\s*\)|\bfor\s*\(\s*;\s*;\s*\)/, "unbounded loops"],
];

export type CodeCheck = { ok: true; code: string } | { ok: false; reason: string };

/** Static checks plus a syntax check. Compiling with `new Function` only parses the source; it is never called here. */
export function checkGameCode(raw: string): CodeCheck {
  const code = raw.trim();
  if (!code) return { ok: false, reason: "empty response" };
  if (code.length > MAX_GAME_CODE) return { ok: false, reason: `code too long (${code.length} chars)` };
  if (!/function\s+createGame\s*\(\s*api\s*\)/.test(code)) return { ok: false, reason: "missing function createGame(api)" };
  if (!/\bapi\.drawHero\s*\(/.test(code)) return { ok: false, reason: "never draws the player's face (api.drawHero)" };
  if (!/\bapi\.end\s*\(/.test(code)) return { ok: false, reason: "the player can never lose (no api.end())" };
  for (const [re, why] of FORBIDDEN) if (re.test(code)) return { ok: false, reason: `uses ${why}` };
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function(`"use strict";\n${code}\nreturn typeof createGame;`);
  } catch (e) {
    return { ok: false, reason: `syntax error: ${(e as Error).message}` };
  }
  return { ok: true, code };
}

function extractCode(text: string): string {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const fenced = cleaned.match(/```(?:js|javascript|ts)?\s*\n([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : cleaned;
  const start = body.indexOf("function createGame");
  return start >= 0 ? body.slice(start) : body;
}

async function chatOnce(messages: { role: string; content: string }[], deadline: number): Promise<string> {
  const e = env();
  const res = await fetch(`${e.LLM_BASE_URL!.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())),
    headers: { "Content-Type": "application/json", ...(e.LLM_API_KEY ? { Authorization: `Bearer ${e.LLM_API_KEY}` } : {}) },
    body: JSON.stringify({ model: e.LLM_MODEL, temperature: 0.5, max_tokens: 3500, stream: false, messages }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

/**
 * Asks the model for a game, checks it, and gives the model one chance to fix a failed check.
 * Throws with a short reason if no valid game comes back in time.
 */
export async function generateGameCode(idea: string, cfg: GameConfig): Promise<string> {
  if (!env().LLM_BASE_URL) throw new Error("AI code generation needs LLM_BASE_URL (OmniRoute) configured");
  const deadline = Date.now() + 50_000;
  const brief = `Game idea: ${idea}
Title: ${cfg.title}. Things to avoid are called "${cfg.obstacleLabel}", things to collect "${cfg.goodItemLabel}", score unit "${cfg.scoreLabel}".
Colors: bg ${cfg.colors.bg}, fg ${cfg.colors.fg}, accent ${cfg.colors.accent}. Difficulty speed ${cfg.difficulty.speed}.`;
  const messages = [
    { role: "system", content: CONTRACT },
    { role: "user", content: "Example idea: dodge falling rocks." },
    { role: "assistant", content: EXAMPLE },
    { role: "user", content: brief },
  ];
  let reason = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await chatOnce(messages, deadline);
    const check = checkGameCode(extractCode(text));
    if (check.ok) return check.code;
    reason = check.reason;
    messages.push({ role: "assistant", content: text.slice(0, 6000) }, { role: "user", content: `That code was rejected: ${reason}. Return the full corrected function in one \`\`\`js block.` });
  }
  throw new Error(`AI game code rejected: ${reason}`);
}

// ---------------------------------------------------------------- signing

let fallbackKey: Buffer | null = null;
function signingKey(): Buffer {
  const e = env();
  const secret = process.env.CODE_SIGNING_SECRET || (e.PLATFORM_PRIVATE_KEY ? `platform:${e.PLATFORM_PRIVATE_KEY}` : e.SUPABASE_SECRET_KEY);
  // One-way derivation, so the platform key itself never doubles as a MAC key.
  if (secret) return createHash("sha256").update(`0xdegenracy/game-code/v1/${secret}`).digest();
  return (fallbackKey ??= randomBytes(32)); // dev without secrets: valid for this process only
}

/** HMAC over the exact code bytes. Launch only accepts custom code carrying a valid signature. */
export function signGameCode(code: string): string {
  return createHmac("sha256", signingKey()).update(code).digest("hex");
}

export function verifyGameCode(code: string, sig: string | undefined): boolean {
  if (!sig || !/^[0-9a-f]{64}$/.test(sig)) return false;
  const expected = Buffer.from(signGameCode(code), "hex");
  const given = Buffer.from(sig, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}
