import Link from "next/link";
import type { GameRecord } from "@/lib/server/store";
import { GAME_META } from "@/games";

export function GameCard({ game }: { game: GameRecord }) {
  const c = game.config;
  return (
    <Link href={`/game/${game.id}`} className="brut block overflow-hidden transition hover:-translate-y-1" style={{ background: c.colors.bg, color: c.colors.fg }}>
      <div className="flex items-center gap-3 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={game.image_url} alt="" className="h-14 w-14 shrink-0 rounded-full border-[3px] object-cover" style={{ borderColor: c.colors.fg }} loading="lazy" />
        <div className="min-w-0">
          <div className="truncate font-[family-name:var(--font-display)] text-lg font-black leading-tight">{c.title}</div>
          <div className="text-sm font-bold" style={{ color: c.colors.accent }}>${c.ticker}</div>
          <div className="text-xs opacity-70">{GAME_META[c.gameType].label}</div>
        </div>
      </div>
    </Link>
  );
}
