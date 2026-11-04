import Link from "next/link";
import type { GameRecord } from "@/lib/server/store";
import { GAME_META } from "@/games";
import { shade } from "@/games/engine";
import { Icon } from "./ui/Icon";

export function GameCard({ game }: { game: GameRecord }) {
  const c = game.config;
  const meta = GAME_META[c.gameType] ?? GAME_META.runner;
  return (
    <Link
      href={`/game/${game.id}`}
      className="brut brut-hover group block overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${shade(c.colors.bg, 0.1)}, ${shade(c.colors.bg, -0.12)})`, color: c.colors.fg }}
    >
      <div className="flex items-center gap-3 p-3">
        <div className="relative shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={game.image_url} alt="" className="h-16 w-16 rounded-full border-[3px] object-cover transition group-hover:rotate-6" style={{ borderColor: c.colors.fg }} loading="lazy" />
          <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border-2 border-ink bg-white px-1.5 text-[10px] font-black uppercase leading-4 text-ink">
            {meta.short}
          </span>
        </div>
        <div className="min-w-0">
          <div className="truncate font-[family-name:var(--font-display)] text-lg font-black leading-tight">{c.title}</div>
          <div className="truncate text-sm font-bold" style={{ color: c.colors.accent }}>${c.ticker} · {c.tokenName}</div>
          <div className="text-xs opacity-70">{meta.label} · Play <Icon name="arrowRight" size={12} className="inline" /></div>
        </div>
      </div>
    </Link>
  );
}
