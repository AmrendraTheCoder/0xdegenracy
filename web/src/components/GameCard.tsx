import Link from "next/link";
import type { GameRecord } from "@/lib/server/store";
import { GAME_META } from "@/games";
import { shade } from "@/games/engine";

export function GameCard({ game }: { game: GameRecord }) {
  const c = game.config;
  const meta = GAME_META[c.gameType] ?? GAME_META.runner;
  return (
    <Link
      href={`/game/${game.id}`}
      className="brut group block overflow-hidden transition hover:-translate-y-1 hover:shadow-[6px_6px_0_#141414]"
      style={{ background: `linear-gradient(135deg, ${shade(c.colors.bg, 0.1)}, ${shade(c.colors.bg, -0.12)})`, color: c.colors.fg }}
    >
      <div className="flex items-center gap-3 p-3">
        <div className="relative shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={game.image_url} alt="" className="h-16 w-16 rounded-full border-[3px] object-cover transition group-hover:rotate-6" style={{ borderColor: c.colors.fg }} loading="lazy" />
          <span className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border-2 border-ink bg-white text-sm" title={meta.label}>
            {meta.emoji}
          </span>
        </div>
        <div className="min-w-0">
          <div className="truncate font-[family-name:var(--font-display)] text-lg font-black leading-tight">{c.title}</div>
          <div className="truncate text-sm font-bold" style={{ color: c.colors.accent }}>${c.ticker} · {c.tokenName}</div>
          <div className="text-xs opacity-70">{meta.label} · Play →</div>
        </div>
      </div>
    </Link>
  );
}
