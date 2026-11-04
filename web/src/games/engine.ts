import type { GameConfig } from "@/lib/game-config";

// Shared canvas engine: loop, input (keyboard, touch, tilt, on-screen buttons), scaling, juice
// (particles, floating text, screen shake, sound), pause, best score and ready/over screens.
// Each game is a small factory that reads the same GameConfig. Logical canvas is 400x600 (portrait).

export const W = 400;
export const H = 600;

export type Dir = "up" | "down" | "left" | "right";

export type Input = {
  /** Edge-triggered: tap / click / Space / Enter / ↑ this frame. */
  tapped: boolean;
  /** Held: ↓ / S (runner duck). */
  duck: boolean;
  /** -1..1 from ← → / A D / on-screen buttons / device tilt. */
  axis: number;
  /** Logical x of the pointer while held, else null (drag to move). */
  pointerX: number | null;
  /** Edge-triggered: logical position of a tap this frame (whack-a-mole). */
  tap: { x: number; y: number } | null;
  /** Edge-triggered: arrow key / WASD / swipe / d-pad direction this frame (snake). */
  dir: Dir | null;
};

export type Sfx = "score" | "hit" | "jump" | "shoot" | "over" | "bonk" | "start";

export type GameApi = {
  cfg: GameConfig;
  shake(px: number): void;
  addScore(n: number): void;
  /** Ends the run. Pass the hero position for a death burst. */
  end(x?: number, y?: number): void;
  rand(min: number, max: number): number;
  drawHero(g: CanvasRenderingContext2D, x: number, y: number, r: number): void;
  label(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color?: string): void;
  /** Particle burst at (x, y). */
  burst(x: number, y: number, color: string, count?: number, speed?: number): void;
  /** Floating text that rises and fades ("+1"). */
  pop(x: number, y: number, text: string, color?: string): void;
  sfx(kind: Sfx): void;
  /** Rounded rectangle fill (and optional stroke). */
  rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string): void;
  /** Darken (pct < 0) or lighten (pct > 0) a hex color. */
  shade(hex: string, pct: number): string;
};

export type GameInstance = {
  update(dt: number, input: Input): void;
  draw(g: CanvasRenderingContext2D): void;
};

export type GameFactory = (api: GameApi) => GameInstance;

type Phase = "ready" | "playing" | "paused" | "over";

export type RunOptions = {
  canvas: HTMLCanvasElement;
  cfg: GameConfig;
  spriteUrl: string | null;
  factory: GameFactory;
  /** localStorage key for the best score (per game). */
  bestKey?: string;
  onGameOver?: (score: number, best: number) => void;
  onStart?: () => void;
  onPhase?: (phase: Phase) => void;
};

/** Lets on-screen buttons drive exactly the same handlers as the keyboard. */
export type GameController = {
  keyDown(code: string): void;
  keyUp(code: string): void;
  toggleMute(): boolean;
  isMuted(): boolean;
  destroy(): void;
};

// ---------------------------------------------------------------- helpers

export function shade(hex: string, pct: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(pct < 0 ? c * (1 + pct) : c + (255 - c) * pct)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** Circle vs axis-aligned rect collision. */
export function circleRect(cx: number, cy: number, r: number, x: number, y: number, w: number, h: number) {
  const nx = Math.max(x, Math.min(cx, x + w));
  const ny = Math.max(y, Math.min(cy, y + h));
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}

const safeStorage = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

// Tiny WebAudio synth: no asset downloads, starts only after a user gesture.
function createSynth() {
  let ctx: AudioContext | null = null;
  let muted = safeStorage.get("reachy:muted") === "1";
  const TONES: Record<Sfx, { f: number; to: number; d: number; type: OscillatorType; v: number }> = {
    score: { f: 660, to: 990, d: 0.09, type: "square", v: 0.05 },
    jump: { f: 330, to: 620, d: 0.12, type: "triangle", v: 0.08 },
    shoot: { f: 900, to: 300, d: 0.06, type: "square", v: 0.025 },
    hit: { f: 220, to: 90, d: 0.18, type: "sawtooth", v: 0.07 },
    bonk: { f: 520, to: 260, d: 0.1, type: "square", v: 0.06 },
    over: { f: 300, to: 60, d: 0.5, type: "sawtooth", v: 0.08 },
    start: { f: 440, to: 880, d: 0.15, type: "triangle", v: 0.06 },
  };
  return {
    unlock() {
      if (ctx || typeof AudioContext === "undefined") return;
      try {
        ctx = new AudioContext();
      } catch {}
    },
    play(kind: Sfx) {
      if (muted || !ctx) return;
      const t = TONES[kind];
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = t.type;
      osc.frequency.setValueAtTime(t.f, now);
      osc.frequency.exponentialRampToValueAtTime(t.to, now + t.d);
      gain.gain.setValueAtTime(t.v, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t.d);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + t.d + 0.02);
    },
    toggle() {
      muted = !muted;
      safeStorage.set("reachy:muted", muted ? "1" : "0");
      return muted;
    },
    isMuted: () => muted,
    close() {
      ctx?.close().catch(() => {});
    },
  };
}

// ---------------------------------------------------------------- engine

export function runGame(opts: RunOptions): GameController {
  const { canvas, cfg, factory } = opts;
  const g = canvas.getContext("2d")!;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * dpr;
  canvas.height = H * dpr;

  // Sprite: loads async; games draw a placeholder until ready. Never blocks start (<2s requirement).
  let sprite: HTMLImageElement | null = null;
  if (opts.spriteUrl) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => (sprite = img);
    img.src = opts.spriteUrl;
  }

  const synth = createSynth();
  const input: Input = { tapped: false, duck: false, axis: 0, pointerX: null, tap: null, dir: null };
  let swipeStart: { x: number; y: number } | null = null;
  const keys = new Set<string>();
  let tilt = 0;
  let phase: Phase = "ready";
  let score = 0;
  let best = Number(safeStorage.get(opts.bestKey ?? "") ?? 0) || 0;
  let newBest = false;
  let shakeAmt = 0;
  let flash = 0;
  let overAt = 0;
  let game: GameInstance;

  type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number };
  type Pop = { x: number; y: number; text: string; color: string; life: number };
  let particles: Particle[] = [];
  let pops: Pop[] = [];
  // Slow drifting background dots for depth.
  const dots = Array.from({ length: 26 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: 2 + Math.random() * 5, s: 6 + Math.random() * 14 }));
  const bgTop = shade(cfg.colors.bg, 0.12);
  const bgBottom = shade(cfg.colors.bg, -0.14);
  const dotColor = shade(cfg.colors.bg, -0.07);

  const setPhase = (p: Phase) => {
    phase = p;
    opts.onPhase?.(p);
  };

  const api: GameApi = {
    cfg,
    shake: (px) => (shakeAmt = Math.max(shakeAmt, px)),
    addScore: (n) => (score += n),
    end: (x, y) => {
      if (phase !== "playing") return;
      setPhase("over");
      overAt = performance.now();
      shakeAmt = 16;
      flash = 0.35;
      if (x !== undefined && y !== undefined) {
        api.burst(x, y, cfg.colors.accent, 34, 380);
        api.burst(x, y, cfg.colors.fg, 18, 260);
      }
      synth.play("over");
      const final = Math.floor(score);
      newBest = final > best;
      if (newBest) {
        best = final;
        if (opts.bestKey) safeStorage.set(opts.bestKey, String(best));
      }
      opts.onGameOver?.(final, best);
    },
    rand: (a, b) => a + Math.random() * (b - a),
    drawHero(ctx, x, y, r) {
      // Soft glow so the face pops on any background.
      ctx.save();
      ctx.shadowColor = cfg.colors.accent;
      ctx.shadowBlur = r * 0.6;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = cfg.colors.accent;
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.closePath();
      if (sprite) {
        ctx.clip();
        ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
        // subtle top highlight
        const hl = ctx.createLinearGradient(x, y - r, x, y + r);
        hl.addColorStop(0, "rgba(255,255,255,0.25)");
        hl.addColorStop(0.5, "rgba(255,255,255,0)");
        ctx.fillStyle = hl;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.restore();
      ctx.lineWidth = Math.max(2, r * 0.12);
      ctx.strokeStyle = cfg.colors.fg;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    },
    label(ctx, text, x, y, size, color = cfg.colors.fg) {
      ctx.fillStyle = color;
      ctx.font = `900 ${size}px ui-rounded, "Arial Black", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x, y);
    },
    burst(x, y, color, count = 14, speed = 220) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = speed * (0.35 + Math.random() * 0.65);
        const max = 0.35 + Math.random() * 0.45;
        particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: max, max, color, size: 2 + Math.random() * 4 });
      }
      if (particles.length > 400) particles = particles.slice(-400);
    },
    pop(x, y, text, color = cfg.colors.fg) {
      pops.push({ x, y, text, color, life: 0.7 });
      if (pops.length > 20) pops.shift();
    },
    sfx: (kind) => synth.play(kind),
    rrect(ctx, x, y, w, h, r, fill, stroke) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }
    },
    shade,
  };

  const reset = () => {
    score = 0;
    newBest = false;
    particles = [];
    pops = [];
    game = factory(api);
  };
  reset();

  // ---------------------------------------------------------------- input
  const rect = () => canvas.getBoundingClientRect();
  const toLogicalX = (clientX: number) => ((clientX - rect().left) / rect().width) * W;
  const toLogicalY = (clientY: number) => ((clientY - rect().top) / rect().height) * H;

  const start = () => {
    if (phase === "over" && performance.now() - overAt < 450) return false; // avoid accidental instant restart
    if (phase === "over") reset();
    if (phase === "ready" || phase === "over") {
      setPhase("playing");
      synth.play("start");
      opts.onStart?.();
    }
    return true;
  };
  const press = () => {
    synth.unlock();
    if (phase === "paused") return setPhase("playing");
    if (phase !== "playing" && !start()) return;
    input.tapped = true;
  };
  const togglePause = () => {
    if (phase === "playing") setPhase("paused");
    else if (phase === "paused") setPhase("playing");
  };
  const restart = () => {
    reset();
    setPhase("playing");
    synth.unlock();
    synth.play("start");
    opts.onStart?.();
  };

  const KEY_DIR: Record<string, Dir> = {
    ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
    ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
  };
  const ACTION = new Set(["Space", "Enter", "ArrowUp", "KeyW"]);

  const keyDown = (code: string) => {
    if (keys.has(code)) return; // ignore auto-repeat
    keys.add(code);
    if (code === "KeyP" || code === "Escape") return togglePause();
    if (code === "KeyR") return restart();
    if (code === "KeyM") return void synth.toggle();
    if (KEY_DIR[code]) input.dir = KEY_DIR[code];
    if (ACTION.has(code)) press();
    else if (phase !== "playing" && KEY_DIR[code]) press(); // any arrow starts the run
  };
  const keyUp = (code: string) => keys.delete(code);

  const onPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    const x = toLogicalX(e.clientX);
    const y = toLogicalY(e.clientY);
    input.pointerX = x;
    swipeStart = { x, y };
    const wasPlaying = phase === "playing";
    press();
    if (wasPlaying) input.tap = { x, y }; // the tap that starts a run is not a game tap
  };
  const onPointerMove = (e: PointerEvent) => {
    if (input.pointerX === null) return;
    const x = toLogicalX(e.clientX);
    const y = toLogicalY(e.clientY);
    input.pointerX = x;
    if (swipeStart) {
      const dx = x - swipeStart.x;
      const dy = y - swipeStart.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 28) {
        input.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
        swipeStart = { x, y };
      }
    }
  };
  const onPointerUp = () => {
    input.pointerX = null;
    swipeStart = null;
  };
  const GAME_KEYS = new Set(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
  const onKeyDown = (e: KeyboardEvent) => {
    // Don't steal keys from inputs (buy amount, prompt box).
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    keyDown(e.code);
  };
  const onKeyUp = (e: KeyboardEvent) => keyUp(e.code);
  const onTilt = (e: DeviceOrientationEvent) => {
    if (e.gamma != null) tilt = Math.max(-1, Math.min(1, e.gamma / 25));
  };
  const onBlur = () => {
    keys.clear();
    if (phase === "playing") setPhase("paused"); // auto-pause when switching tabs
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("deviceorientation", onTilt);
  window.addEventListener("blur", onBlur);

  // ---------------------------------------------------------------- loop
  let raf = 0;
  let last = performance.now();
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(1 / 30, (now - last) / 1000); // clamp so tab-switches don't teleport
    last = now;

    const right = keys.has("ArrowRight") || keys.has("KeyD");
    const left = keys.has("ArrowLeft") || keys.has("KeyA");
    const keyAxis = (right ? 1 : 0) - (left ? 1 : 0);
    input.axis = keyAxis || (Math.abs(tilt) > 0.12 ? tilt : 0);
    input.duck = keys.has("ArrowDown") || keys.has("KeyS");

    if (phase === "playing") game.update(dt, input);
    input.tapped = false;
    input.tap = null;
    input.dir = null;

    // effects keep animating on the game-over screen
    if (phase !== "paused") {
      for (const p of particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 520 * dt;
        p.vx *= 0.985;
        p.life -= dt;
      }
      particles = particles.filter((p) => p.life > 0);
      for (const t of pops) {
        t.y -= 60 * dt;
        t.life -= dt;
      }
      pops = pops.filter((t) => t.life > 0);
      for (const d of dots) d.y = (d.y + d.s * dt + H) % H;
    }

    // ---- draw
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, bgTop);
    grad.addColorStop(1, bgBottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    g.fillStyle = dotColor;
    for (const d of dots) {
      g.beginPath();
      g.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      g.fill();
    }

    if (shakeAmt > 0.3) {
      g.translate((Math.random() - 0.5) * shakeAmt, (Math.random() - 0.5) * shakeAmt);
      if (phase !== "paused") shakeAmt *= 0.88;
    }
    game.draw(g);

    for (const p of particles) {
      g.globalAlpha = Math.max(0, p.life / p.max);
      g.fillStyle = p.color;
      g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    g.globalAlpha = 1;
    for (const t of pops) {
      g.globalAlpha = Math.max(0, t.life / 0.7);
      api.label(g, t.text, t.x, t.y, 20, t.color);
    }
    g.globalAlpha = 1;

    // HUD (unshaken)
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.save();
    g.shadowColor = "rgba(0,0,0,0.25)";
    g.shadowOffsetY = 3;
    api.label(g, `${Math.floor(score)}`, W / 2, 56, 52);
    g.restore();
    api.label(g, cfg.scoreLabel.toUpperCase(), W / 2, 92, 14);
    if (best > 0) api.label(g, `BEST ${best}`, 50, 30, 13);
    if (synth.isMuted()) api.label(g, "🔇", W / 2 + 120, 30, 16);

    if (flash > 0) {
      g.fillStyle = `rgba(255,255,255,${flash})`;
      g.fillRect(0, 0, W, H);
      flash = Math.max(0, flash - dt * 1.5);
    }

    if (phase === "ready") overlay(cfg.title, "TAP · SPACE · ENTER TO PLAY", `$${cfg.ticker}`, "P pause · R restart · M mute");
    if (phase === "paused") overlay("PAUSED", "PRESS P OR TAP TO RESUME", `$${cfg.ticker}`, "R restart · M mute");
    if (phase === "over")
      overlay(cfg.gameOverText, `${Math.floor(score)} ${cfg.scoreLabel}${newBest ? " · NEW BEST!" : ""}`, `TAP OR SPACE TO RETRY · $${cfg.ticker}`, `BEST ${best}`);
  };

  function overlay(big: string, mid: string, small: string, hint: string) {
    g.save();
    g.shadowColor = "rgba(0,0,0,0.35)";
    g.shadowBlur = 24;
    g.shadowOffsetY = 8;
    api.rrect(g, 24, H / 2 - 130, W - 48, 250, 22, "rgba(20,20,20,0.82)");
    g.restore();
    api.label(g, big.toUpperCase(), W / 2, H / 2 - 64, fitSize(big, 40), "#ffffff");
    api.label(g, mid, W / 2, H / 2 - 6, fitSize(mid, 22), cfg.colors.accent);
    api.label(g, small, W / 2, H / 2 + 42, 15, "#ffffff");
    api.label(g, hint, W / 2, H / 2 + 82, 12, "rgba(255,255,255,0.6)");
  }
  function fitSize(text: string, max: number) {
    let size = max;
    g.font = `900 ${size}px ui-rounded, "Arial Black", system-ui, sans-serif`;
    const width = g.measureText(text.toUpperCase()).width;
    if (width > W - 70) size = Math.floor((size * (W - 70)) / width);
    return Math.max(12, size);
  }

  raf = requestAnimationFrame(frame);

  return {
    keyDown: (code) => {
      synth.unlock();
      keyDown(code);
    },
    keyUp,
    toggleMute: () => synth.toggle(),
    isMuted: () => synth.isMuted(),
    destroy() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("deviceorientation", onTilt);
      window.removeEventListener("blur", onBlur);
      synth.close();
    },
  };
}
