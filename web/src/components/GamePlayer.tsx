"use client";

import { useEffect, useRef, useState } from "react";
import type { GameConfig } from "@/lib/game-config";
import { COMMON_KEYS, GAMES, GAME_META, type PadButton } from "@/games";
import { runGame, type GameController } from "@/games/engine";

export function GamePlayer({ config, imageUrl, gameId }: { config: GameConfig; imageUrl: string; gameId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ctrl = useRef<GameController | null>(null);
  const [best, setBest] = useState(0);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const meta = GAME_META[config.gameType];

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

  return (
    <div className="mx-auto max-w-[400px]">
      <div className="relative">
        <canvas
          ref={ref}
          className="game brut block aspect-[2/3] w-full"
          style={{ background: config.colors.bg }}
          aria-label={`${config.title} game. ${meta.controls}`}
          tabIndex={0}
        />
        <div className="absolute right-2 top-2 flex gap-1">
          <IconButton label={muted ? "Unmute (M)" : "Mute (M)"} onClick={() => setMuted(ctrl.current?.toggleMute() ?? false)}>
            {muted ? "🔇" : "🔊"}
          </IconButton>
          <IconButton label="Pause (P)" onClick={() => ctrl.current?.keyDown("KeyP")} onRelease={() => ctrl.current?.keyUp("KeyP")}>
            ⏸
          </IconButton>
          <IconButton label="Restart (R)" onClick={() => ctrl.current?.keyDown("KeyR")} onRelease={() => ctrl.current?.keyUp("KeyR")}>
            ↻
          </IconButton>
        </div>
      </div>

      {meta.pad.length > 0 && <Pad buttons={meta.pad} dpad={meta.dpad} ctrl={ctrl} />}

      <div className="mt-2 flex items-center justify-between text-xs font-bold">
        <span>{meta.emoji} {meta.controls}</span>
        <span className="shrink-0">Best: {best}</span>
      </div>
      <div className="mt-1 hidden flex-wrap gap-x-3 gap-y-1 text-[11px] opacity-70 sm:flex">
        {COMMON_KEYS.map((k) => (
          <span key={k.key}>
            <kbd className="rounded border border-ink/40 bg-white px-1 font-mono">{k.key}</kbd> {k.what}
          </span>
        ))}
      </div>

      {lastScore !== null && (
        <a href="#buy" className="brut-btn mt-3 block bg-hot py-3 text-center text-xl text-white">
          {lastScore} {config.scoreLabel}. Cope by buying ${config.ticker} →
        </a>
      )}
    </div>
  );
}

function IconButton({ label, onClick, onRelease, children }: { label: string; onClick: () => void; onRelease?: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      onPointerUp={onRelease}
      onPointerLeave={onRelease}
      className="grid h-8 w-8 place-items-center rounded-lg border-2 border-ink bg-white/85 text-sm shadow-[2px_2px_0_#141414] active:translate-x-[1px] active:translate-y-[1px]"
    >
      {children}
    </button>
  );
}

/** Touch buttons that hold a key down while pressed, so movement keeps going while your thumb is on it. */
function Pad({ buttons, dpad, ctrl }: { buttons: PadButton[]; dpad?: boolean; ctrl: React.RefObject<GameController | null> }) {
  const btn = (b: PadButton, extra = "") => (
    <button
      key={b.code + b.label}
      type="button"
      aria-label={`${b.label} (${b.hint})`}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        ctrl.current?.keyDown(b.code);
      }}
      onPointerUp={() => ctrl.current?.keyUp(b.code)}
      onPointerCancel={() => ctrl.current?.keyUp(b.code)}
      onContextMenu={(e) => e.preventDefault()}
      className={`brut-btn flex select-none flex-col items-center justify-center bg-white py-3 text-2xl leading-none touch-none ${extra}`}
    >
      <span>{b.label}</span>
      <span className="mt-1 text-[10px] font-bold opacity-50">{b.hint}</span>
    </button>
  );

  if (dpad) {
    const [up, left, down, right] = buttons;
    return (
      <div className="mx-auto mt-3 grid w-56 grid-cols-3 gap-2">
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
    <div className="mt-3 flex gap-2">
      {buttons.map((b) => btn(b, b.wide ? "flex-[2] bg-banana" : "flex-1"))}
    </div>
  );
}
