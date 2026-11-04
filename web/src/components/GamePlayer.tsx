"use client";

import { useEffect, useRef, useState } from "react";
import type { GameConfig } from "@/lib/game-config";
import { GAMES, GAME_META } from "@/games";
import { runGame } from "@/games/engine";

export function GamePlayer({ config, imageUrl }: { config: GameConfig; imageUrl: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [best, setBest] = useState(0);
  const [lastScore, setLastScore] = useState<number | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    return runGame({
      canvas: ref.current,
      cfg: config,
      spriteUrl: imageUrl,
      factory: GAMES[config.gameType],
      onStart: () => setLastScore(null),
      onGameOver: (s) => {
        setLastScore(s);
        setBest((b) => Math.max(b, s));
      },
    });
  }, [config, imageUrl]);

  return (
    <div>
      <canvas
        ref={ref}
        className="game brut mx-auto block aspect-[2/3] w-full max-w-[400px]"
        style={{ background: config.colors.bg }}
        aria-label={`${config.title} game`}
        tabIndex={0}
      />
      <div className="mx-auto mt-2 flex max-w-[400px] justify-between text-xs font-bold">
        <span>{GAME_META[config.gameType].controls}</span>
        <span>Best: {best}</span>
      </div>
      {lastScore !== null && (
        <a href="#buy" className="brut-btn mx-auto mt-3 block max-w-[400px] bg-hot py-3 text-center text-xl text-white">
          {lastScore} {config.scoreLabel}. Cope by buying ${config.ticker} →
        </a>
      )}
    </div>
  );
}
