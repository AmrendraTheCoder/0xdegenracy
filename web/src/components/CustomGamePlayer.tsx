"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GameConfig } from "@/lib/game-config";
import { buildGameFrameHtml } from "@/lib/customGameHtml";
import type { GameController } from "@/games/engine";
import { GAME_META } from "@/games";
import { buttonClasses } from "./ui";
import { Icon } from "./ui/Icon";
import { Pad, ToolButton } from "./GamePlayer";

export type CustomGamePlayerProps = {
  config: GameConfig;
  imageUrl: string;
  /** Live game: the frame loads from /api/custom-game/:id (served with a no-network CSP header). */
  gameId?: string;
  /** Pre-launch preview: no game id yet, so the document is built in the browser and passed as srcdoc. */
  preview?: boolean;
  tradeHref?: string;
  /** Called if the AI's code throws, so the parent can offer the preset version. */
  onCrash?: (message: string) => void;
};

type FrameMsg = { source: "degen-game"; type: "ready" | "start" | "over" | "error" | "phase"; score?: number; best?: number; message?: string; phase?: string };

/**
 * Stage for an AI-written game. The game runs inside <iframe sandbox="allow-scripts">: no
 * allow-same-origin, so it has an opaque origin and cannot reach this page, the wallet, cookies or
 * storage, and its CSP blocks all network. We only exchange small, shape-checked postMessages with it.
 */
export function CustomGamePlayer({ config, imageUrl, gameId, preview, tradeHref = "#buy", onCrash }: CustomGamePlayerProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [best, setBest] = useState(0);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [crash, setCrash] = useState<string | null>(null);
  const meta = GAME_META.custom;

  const srcDoc = useMemo(
    () => (preview && config.code ? buildGameFrameHtml({ code: config.code, cfg: config, imageUrl, withCspMeta: true }) : undefined),
    [preview, config, imageUrl],
  );

  const send = (msg: Record<string, unknown>) => frame.current?.contentWindow?.postMessage({ ...msg, target: "degen-game" }, "*");

  // The pad and toolbar drive the game through the same controller interface the preset engine exposes.
  const ctrl = useRef<GameController | null>(null);
  ctrl.current = {
    keyDown: (code) => send({ type: "key", code, down: true }),
    keyUp: (code) => send({ type: "key", code, down: false }),
    toggleMute: () => false,
    isMuted: () => false,
    destroy: () => {},
  };

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      // Only trust messages from our own iframe, and only the fields we expect.
      if (e.source !== frame.current?.contentWindow) return;
      const d = e.data as FrameMsg;
      if (!d || d.source !== "degen-game" || typeof d.type !== "string") return;
      if (d.type === "start") setLastScore(null);
      if (d.type === "phase") setPaused(d.phase === "paused");
      if (d.type === "over" && typeof d.score === "number") {
        setLastScore(Math.max(0, Math.floor(d.score)));
        setBest((b) => Math.max(b, Math.floor(d.best ?? d.score ?? 0)));
      }
      if (d.type === "error") {
        const m = String(d.message ?? "unknown error").slice(0, 200);
        setCrash(m);
        onCrash?.(m);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onCrash]);

  return (
    <div className="overflow-hidden rounded-[18px] border-[3px] border-ink bg-ink text-white shadow-[5px_5px_0_#141414]">
      <div className="flex items-center justify-between gap-2 border-b-[3px] border-ink bg-[#1f1f22] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Icon name="spark" size={18} className="text-banana" />
          <span className="truncate font-bold">{preview ? "Preview · AI-made game" : "AI-made game"}</span>
          <span className="hidden rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold text-white/80 sm:inline">
            Best {best} {config.scoreLabel.toLowerCase()}
          </span>
        </div>
        <div className="flex gap-1.5" role="toolbar" aria-label="Game controls">
          <ToolButton label={paused ? "Resume (P)" : "Pause (P)"} icon={paused ? "play" : "pause"} onClick={() => send({ type: "pause" })} />
          <ToolButton label="Restart (R)" icon="restart" onClick={() => send({ type: "restart" })} />
        </div>
      </div>

      <div
        className="flex justify-center px-3 py-4 sm:px-6 sm:py-6"
        style={{ background: `radial-gradient(120% 90% at 50% 0%, ${config.colors.accent}33, transparent 60%), #18181b` }}
      >
        <iframe
          ref={frame}
          title={`${config.title}, an AI-made game`}
          // No allow-same-origin: opaque origin, fully isolated from this page. No forms, popups or navigation.
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          allow="fullscreen 'none'; camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'"
          src={srcDoc ? undefined : `/api/custom-game/${gameId}`}
          srcDoc={srcDoc}
          className="block aspect-[2/3] w-full max-w-[460px] rounded-xl border-[3px] border-black bg-[#18181b] shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7)] lg:h-[min(70vh,690px)] lg:w-auto lg:max-w-none"
          style={{ background: config.colors.bg }}
        />
      </div>

      {crash && (
        <div role="alert" className="border-t-[3px] border-ink bg-hot px-4 py-3 text-sm font-bold text-ink">
          This AI game crashed: {crash}
        </div>
      )}

      <div className="touch-only border-t-[3px] border-ink bg-[#1f1f22] p-3">
        <Pad buttons={meta.pad} dpad={meta.dpad} ctrl={ctrl} />
      </div>
      <div className="pointer-only flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-t-[3px] border-ink bg-[#1f1f22] px-3 py-2.5 text-xs text-white/75">
        <span className="font-bold text-white">Click the game, then use arrow keys or WASD and Space</span>
        <span aria-hidden className="text-white/30">|</span>
        <span>P pause · R restart</span>
      </div>

      {!preview && (
        <div aria-live="polite" aria-atomic="true">
          {lastScore !== null && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t-[3px] border-ink bg-banana px-4 py-3 text-ink">
              <p className="font-[family-name:var(--font-display)] text-lg font-extrabold">
                {lastScore} {config.scoreLabel}
              </p>
              <a href={tradeHref} className={buttonClasses({ variant: "primary", size: "md" })}>
                Buy ${config.ticker} <Icon name="arrowRight" size={16} />
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
