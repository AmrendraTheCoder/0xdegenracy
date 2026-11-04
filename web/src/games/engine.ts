import type { GameConfig } from "@/lib/game-config";

// Shared canvas engine: loop, input, scaling, shake, score, ready/over screens.
// Each game is a small factory that reads the same GameConfig. Logical canvas is 400x600 (portrait).

export const W = 400;
export const H = 600;

export type Input = {
  /** Edge-triggered: tap / click / space / up this frame. */
  tapped: boolean;
  /** Held: down arrow / S (runner duck). */
  duck: boolean;
  /** -1..1 from arrow keys / A-D / device tilt. */
  axis: number;
  /** Logical x of the pointer while held, else null (dodge drag). */
  pointerX: number | null;
  /** Edge-triggered: logical position of a tap this frame (whack-a-mole). */
  tap: { x: number; y: number } | null;
  /** Edge-triggered: arrow key / WASD / swipe direction this frame (snake). */
  dir: Dir | null;
};

export type Dir = "up" | "down" | "left" | "right";

export type GameApi = {
  cfg: GameConfig;
  shake(px: number): void;
  addScore(n: number): void;
  end(): void;
  rand(min: number, max: number): number;
  drawHero(g: CanvasRenderingContext2D, x: number, y: number, r: number): void;
  label(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color?: string): void;
};

export type GameInstance = {
  update(dt: number, input: Input): void;
  draw(g: CanvasRenderingContext2D): void;
};

export type GameFactory = (api: GameApi) => GameInstance;

type Phase = "ready" | "playing" | "over";

export type RunOptions = {
  canvas: HTMLCanvasElement;
  cfg: GameConfig;
  spriteUrl: string | null;
  factory: GameFactory;
  onGameOver?: (score: number) => void;
  onStart?: () => void;
};

export function runGame(opts: RunOptions): () => void {
  const { canvas, cfg, factory } = opts;
  const g = canvas.getContext("2d")!;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * dpr;
  canvas.height = H * dpr;

  // Sprite: loads async; game draws a placeholder until ready. Never blocks start (<2s requirement).
  let sprite: HTMLImageElement | null = null;
  if (opts.spriteUrl) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => (sprite = img);
    img.src = opts.spriteUrl;
  }

  const input: Input = { tapped: false, duck: false, axis: 0, pointerX: null, tap: null, dir: null };
  let swipeStart: { x: number; y: number } | null = null;
  const keys = new Set<string>();
  let tilt = 0;
  let phase: Phase = "ready";
  let score = 0;
  let shakeAmt = 0;
  let overAt = 0;
  let game: GameInstance;

  const api: GameApi = {
    cfg,
    shake: (px) => (shakeAmt = Math.max(shakeAmt, px)),
    addScore: (n) => (score += n),
    end: () => {
      if (phase !== "playing") return;
      phase = "over";
      overAt = performance.now();
      shakeAmt = 14;
      opts.onGameOver?.(Math.floor(score));
    },
    rand: (a, b) => a + Math.random() * (b - a),
    drawHero(ctx, x, y, r) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = cfg.colors.accent;
      ctx.fill();
      if (sprite) {
        ctx.clip();
        ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
      }
      ctx.restore();
      ctx.lineWidth = 3;
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
  };

  const reset = () => {
    score = 0;
    game = factory(api);
  };
  reset();

  // ---------------------------------------------------------------- input
  const toLogicalX = (clientX: number) => {
    const rect = canvas.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * W;
  };
  const toLogicalY = (clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return ((clientY - rect.top) / rect.height) * H;
  };
  const press = () => {
    if (phase === "ready") {
      phase = "playing";
      opts.onStart?.();
    } else if (phase === "over") {
      if (performance.now() - overAt < 450) return; // avoid accidental instant restart
      reset();
      phase = "playing";
      opts.onStart?.();
    }
    input.tapped = true;
  };
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
    // Swipe: emit a direction once the finger has moved far enough, then re-anchor.
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
  const KEY_DIR: Record<string, Dir> = {
    ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
    ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (KEY_DIR[e.code]) input.dir = KEY_DIR[e.code];
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") press();
    else if (phase !== "playing" && KEY_DIR[e.code]) press(); // any arrow starts snake etc.
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
  const onTilt = (e: DeviceOrientationEvent) => {
    if (e.gamma != null) tilt = Math.max(-1, Math.min(1, e.gamma / 25));
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("deviceorientation", onTilt);

  // ---------------------------------------------------------------- loop
  let raf = 0;
  let last = performance.now();
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(1 / 30, (now - last) / 1000); // clamp so tab-switches don't teleport
    last = now;

    const keyAxis = (keys.has("ArrowRight") || keys.has("KeyD") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("KeyA") ? 1 : 0);
    input.axis = keyAxis || (Math.abs(tilt) > 0.12 ? tilt : 0);
    input.duck = keys.has("ArrowDown") || keys.has("KeyS");

    if (phase === "playing") game.update(dt, input);
    input.tapped = false;
    input.tap = null;
    input.dir = null;

    // draw
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = cfg.colors.bg;
    g.fillRect(0, 0, W, H);
    if (shakeAmt > 0.3) {
      g.translate((Math.random() - 0.5) * shakeAmt, (Math.random() - 0.5) * shakeAmt);
      shakeAmt *= 0.88;
    }
    game.draw(g);

    // HUD
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    api.label(g, `${Math.floor(score)}`, W / 2, 56, 52);
    api.label(g, cfg.scoreLabel.toUpperCase(), W / 2, 92, 14);

    if (phase === "ready") overlay(cfg.title, "TAP / SPACE TO PLAY", `$${cfg.ticker}`);
    if (phase === "over") overlay(cfg.gameOverText, `${Math.floor(score)} ${cfg.scoreLabel}`, `TAP TO RETRY · $${cfg.ticker}`);
  };

  function overlay(big: string, mid: string, small: string) {
    g.fillStyle = "rgba(0,0,0,0.55)";
    g.fillRect(0, H / 2 - 110, W, 220);
    api.label(g, big.toUpperCase(), W / 2, H / 2 - 50, fitSize(big, 40), "#ffffff");
    api.label(g, mid, W / 2, H / 2 + 10, 24, cfg.colors.accent);
    api.label(g, small, W / 2, H / 2 + 60, 16, "#ffffff");
  }
  function fitSize(text: string, max: number) {
    // Measure with the real font so wide display fonts never overflow the canvas.
    let size = max;
    g.font = `900 ${size}px ui-rounded, "Arial Black", system-ui, sans-serif`;
    const width = g.measureText(text.toUpperCase()).width;
    if (width > W - 40) size = Math.floor((size * (W - 40)) / width);
    return Math.max(14, size);
  }

  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("deviceorientation", onTilt);
  };
}

/** Circle vs axis-aligned rect collision. */
export function circleRect(cx: number, cy: number, r: number, x: number, y: number, w: number, h: number) {
  const nx = Math.max(x, Math.min(cx, x + w));
  const ny = Math.max(y, Math.min(cy, y + h));
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}
