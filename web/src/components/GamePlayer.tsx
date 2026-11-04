"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { GameConfig } from "@/lib/game-config";
import { COMMON_KEYS, GAMES, GAME_META, type PadButton } from "@/games";
import { runGame, type GameController } from "@/games/engine";
import { buttonClasses, cn } from "./ui";

export type GamePlayerProps = {
  config: GameConfig;
  imageUrl: string;
  gameId: string;
  /** Anchor of the trade panel the post-game CTA links to. */
  tradeHref?: string;
};

export function GamePlayer({ config, imageUrl, gameId, tradeHref = "#buy" }: GamePlayerProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ctrl = useRef<GameController | null>(null);
  const [best, setBest] = useState(0);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const meta = GAME_META[config.gameType];
  const descId = useId();

  useEffect(() => {
    if (!ref.current) return;
    const bestKey = `reachy:best:${gameId}`;
    try {
      setBest(Number(localStorage.getItem(bestKey)) || 0);
    } catch {}
    const c = runGame({
      canvas: ref.current,
      cfg: config,
      spriteUrl: imageUrl,
      factory: GAMES[config.gameType],
      bestKey,
      // Respect the OS setting: no screen shake or white flashes for motion-sensitive players.
      reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
      onStart: () => setLastScore(null),
      onGameOver: (s, b) => {
        setLastScore(s);
        setBest(b);
      },
    });
    ctrl.current = c;
    setMuted(c.isMuted());
    return () => {
      c.destroy();
      ctrl.current = null;
    };
  }, [config, imageUrl, gameId]);

  /** A tap on a key (down then up), for buttons that act once per click. */
  const tapKey = (code: string) => {
    ctrl.current?.keyDown(code);
    ctrl.current?.keyUp(code);
    ref.current?.focus({ preventScroll: true });
  };

  return (
    <div className="mx-auto w-full max-w-[400px]">
      <div className="relative">
        <canvas
          ref={ref}
          className="game brut block aspect-[2/3] w-full"
          style={{ background: config.colors.bg }}
          role="application"
          aria-roledescription="game"
          aria-label={`${config.title}, a ${meta.label} game`}
          aria-describedby={descId}
          tabIndex={0}
        />
        <p id={descId} className="sr-only">
          {`${meta.controls}. Press Space or Enter to start. P or Escape pauses, R restarts, M mutes. Best score ${best} ${config.scoreLabel}.`}
        </p>
        <div className="absolute right-2 top-2 flex gap-1.5" role="toolbar" aria-label="Game controls">
          <IconButton label={muted ? "Unmute (M)" : "Mute (M)"} pressed={muted} onClick={() => setMuted(ctrl.current?.toggleMute() ?? false)}>
            {muted ? "🔇" : "🔊"}
          </IconButton>
          <IconButton label="Pause (P)" onClick={() => tapKey("KeyP")}>⏸</IconButton>
          <IconButton label="Restart (R)" onClick={() => tapKey("KeyR")}>↻</IconButton>
        </div>
      </div>

      {meta.pad.length > 0 && <Pad buttons={meta.pad} dpad={meta.dpad} ctrl={ctrl} />}

      <div className="mt-3 flex items-center justify-between gap-3 text-xs font-bold">
        <span>
          <span aria-hidden>{meta.emoji} </span>
          {meta.controls}
        </span>
        <span className="shrink-0 rounded-full border-2 border-ink bg-white px-2 py-0.5">Best: {best}</span>
      </div>
      <ul className="mt-2 hidden flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink/70 sm:flex" aria-label="Keyboard shortcuts">
        {COMMON_KEYS.map((k) => (
          <li key={k.key}>
            <kbd className="rounded border border-ink/40 bg-white px-1 font-mono text-ink">{k.key}</kbd> {k.what}
          </li>
        ))}
      </ul>

      <div aria-live="polite" aria-atomic="true">
        {lastScore !== null && (
          <a href={tradeHref} className={buttonClasses({ variant: "primary", size: "lg", block: true, className: "mt-3 text-xl" })}>
            {lastScore} {config.scoreLabel}. Cope by buying ${config.ticker} →
          </a>
        )}
      </div>
    </div>
  );
}

function IconButton({ label, onClick, pressed, children }: { label: string; onClick: () => void; pressed?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      // Keep focus on the canvas when tapped, so the keyboard keeps driving the game; click still works from the keyboard.
      onPointerDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-lg border-2 border-ink bg-white/90 text-sm shadow-[2px_2px_0_#141414] active:translate-x-[1px] active:translate-y-[1px]"
    >
      <span aria-hidden>{children}</span>
    </button>
  );
}

const PAD_NAMES: Record<string, string> = { ArrowLeft: "Left", ArrowRight: "Right", ArrowUp: "Up", ArrowDown: "Down" };

/** Touch buttons that hold a key down while pressed, so movement keeps going while your thumb is on it. */
function Pad({ buttons, dpad, ctrl }: { buttons: PadButton[]; dpad?: boolean; ctrl: React.RefObject<GameController | null> }) {
  const btn = (b: PadButton, extra = "") => (
    <button
      key={b.code + b.label}
      type="button"
      aria-label={PAD_NAMES[b.code] ?? b.label}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        ctrl.current?.keyDown(b.code);
      }}
      onPointerUp={() => ctrl.current?.keyUp(b.code)}
      onPointerCancel={() => ctrl.current?.keyUp(b.code)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          ctrl.current?.keyDown(b.code);
        }
      }}
      onKeyUp={(e) => {
        if (e.key === "Enter" || e.key === " ") ctrl.current?.keyUp(b.code);
      }}
      onContextMenu={(e) => e.preventDefault()}
      className={cn("brut-btn flex min-h-14 touch-none select-none flex-col items-center justify-center bg-white py-3 text-2xl leading-none", extra)}
    >
      <span aria-hidden>{b.label}</span>
      <span aria-hidden className="mt-1 text-[10px] font-bold text-ink/60">{b.hint}</span>
    </button>
  );

  if (dpad) {
    const [up, left, down, right] = buttons;
    return (
      <div className="mx-auto mt-3 grid w-56 grid-cols-3 gap-2" role="group" aria-label="Direction pad">
        <span />
        {btn(up)}
        <span />
        {btn(left)}
        {btn(down)}
        {btn(right)}
      </div>
    );
  }
  return (
    <div className="mt-3 flex gap-2" role="group" aria-label="On-screen controls">
      {buttons.map((b) => btn(b, b.wide ? "flex-[2] bg-banana" : "flex-1"))}
    </div>
  );
}
