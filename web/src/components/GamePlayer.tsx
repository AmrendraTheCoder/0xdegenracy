"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { GameConfig } from "@/lib/game-config";
import { COMMON_KEYS, GAMES, GAME_META, type PadButton } from "@/games";
import { runGame, type GameController } from "@/games/engine";
import { buttonClasses, cn } from "./ui";
import { Icon, type IconName } from "./ui/Icon";

export type GamePlayerProps = {
  config: GameConfig;
  imageUrl: string;
  gameId: string;
  /** Anchor of the trade panel the post-game CTA links to. */
  tradeHref?: string;
};

/**
 * The game "stage": a dark arcade frame that fills its column, a canvas sized to the viewport height,
 * a toolbar (game type, best score, mute / pause / restart) and controls that adapt to the device:
 * keyboard hints on desktop, hold-to-move touch buttons on phones and tablets.
 */
export function GamePlayer({ config, imageUrl, gameId, tradeHref = "#buy" }: GamePlayerProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ctrl = useRef<GameController | null>(null);
  const [best, setBest] = useState(0);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
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
      hint: meta.controls,
      // Respect the OS setting: no screen shake or white flashes for motion-sensitive players.
      reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
      onStart: () => setLastScore(null),
      onPhase: (p) => setPaused(p === "paused"),
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
  }, [config, imageUrl, gameId, meta.controls]);

  /** A tap on a key (down then up), for buttons that act once per click. */
  const tapKey = (code: string) => {
    ctrl.current?.keyDown(code);
    ctrl.current?.keyUp(code);
    ref.current?.focus({ preventScroll: true });
  };

  return (
    <div className="overflow-hidden rounded-[18px] border-[3px] border-ink bg-ink text-white shadow-[5px_5px_0_#141414]">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 border-b-[3px] border-ink bg-[#1f1f22] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Icon name="gamepad" size={18} className="text-banana" />
          <span className="truncate font-bold">{meta.label}</span>
          <span className="hidden rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold text-white/80 sm:inline">
            Best {best} {config.scoreLabel.toLowerCase()}
          </span>
        </div>
        <div className="flex gap-1.5" role="toolbar" aria-label="Game controls">
          <ToolButton label={muted ? "Unmute (M)" : "Mute (M)"} icon={muted ? "volumeOff" : "volume"} pressed={muted} onClick={() => setMuted(ctrl.current?.toggleMute() ?? false)} />
          <ToolButton label={paused ? "Resume (P)" : "Pause (P)"} icon={paused ? "play" : "pause"} onClick={() => tapKey("KeyP")} />
          <ToolButton label="Restart (R)" icon="restart" onClick={() => tapKey("KeyR")} />
        </div>
      </div>

      {/* Stage: the canvas is sized by height on desktop so the game is as large as the screen allows */}
      <div
        className="flex justify-center px-3 py-4 sm:px-6 sm:py-6"
        style={{ background: `radial-gradient(120% 90% at 50% 0%, ${config.colors.accent}33, transparent 60%), #18181b` }}
      >
        <canvas
          ref={ref}
          className="game block aspect-[2/3] w-full max-w-[460px] rounded-xl border-[3px] border-black shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7)] lg:h-[min(70vh,690px)] lg:w-auto lg:max-w-none"
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
      </div>

      {/* Touch devices: hold-to-move buttons. Mouse + keyboard devices: one line of key hints. */}
      {meta.pad.length > 0 && (
        <div className="touch-only border-t-[3px] border-ink bg-[#1f1f22] p-3">
          <Pad buttons={meta.pad} dpad={meta.dpad} ctrl={ctrl} />
        </div>
      )}
      <div className="pointer-only flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-t-[3px] border-ink bg-[#1f1f22] px-3 py-2.5 text-xs text-white/75">
        <span className="font-bold text-white">{meta.controls}</span>
        <span aria-hidden className="text-white/30">|</span>
        <ul className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Keyboard shortcuts">
          {COMMON_KEYS.slice(1).map((k) => (
            <li key={k.key} className="flex items-center gap-1">
              <kbd className="rounded border border-white/25 bg-white/10 px-1.5 py-px font-mono text-[11px] text-white">{k.key}</kbd>
              {k.what}
            </li>
          ))}
        </ul>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {lastScore !== null && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t-[3px] border-ink bg-banana px-4 py-3 text-ink">
            <p className="font-[family-name:var(--font-display)] text-lg font-extrabold">
              {lastScore} {config.scoreLabel}
              {lastScore >= best && lastScore > 0 ? " · new best" : ""}
            </p>
            <a href={tradeHref} className={buttonClasses({ variant: "primary", size: "md" })}>
              Buy ${config.ticker} <Icon name="arrowRight" size={16} />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolButton({ label, icon, onClick, pressed }: { label: string; icon: IconName; onClick: () => void; pressed?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      // Keep focus on the canvas when tapped, so the keyboard keeps driving the game; click still works from the keyboard.
      onPointerDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-lg border-2 border-white/15 bg-white/10 text-white transition hover:bg-white/20 active:translate-y-px"
    >
      <Icon name={icon} size={17} />
    </button>
  );
}

/** Touch buttons that hold a key down while pressed, so movement keeps going while your thumb is on it. */
function Pad({ buttons, dpad, ctrl }: { buttons: PadButton[]; dpad?: boolean; ctrl: React.RefObject<GameController | null> }) {
  const btn = (b: PadButton, extra = "") => (
    <button
      key={b.code + b.label}
      type="button"
      aria-label={b.label}
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
      className={cn(
        "flex min-h-14 touch-none select-none items-center justify-center gap-1.5 rounded-xl border-[3px] border-black bg-white text-lg font-extrabold text-ink shadow-[0_4px_0_#000] active:translate-y-[3px] active:shadow-none",
        extra,
      )}
    >
      {b.icon ? <Icon name={b.icon} size={26} strokeWidth={3} /> : <span className="font-[family-name:var(--font-display)] uppercase">{b.label}</span>}
    </button>
  );

  if (dpad) {
    const [up, left, down, right] = buttons;
    return (
      <div className="mx-auto grid w-60 grid-cols-3 gap-2" role="group" aria-label="Direction pad">
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
    <div className="flex gap-2" role="group" aria-label="On-screen controls">
      {buttons.map((b) => btn(b, b.wide ? "flex-[2] bg-banana" : "flex-1"))}
    </div>
  );
}
