import Link from "next/link";
import { CreateForm } from "@/components/CreateForm";
import { GameCard } from "@/components/GameCard";
import { getStore } from "@/lib/server/store";
import { GAME_META } from "@/games";
import { GAME_TYPES } from "@/lib/game-config";
import { Icon } from "@/components/ui/Icon";

export const dynamic = "force-dynamic";

const STEPS = [
  { n: "1", title: "Upload a face", body: "Any face. Your friend, your cat, your boss." },
  { n: "2", title: "Type a dumb idea", body: "AI turns it into one of 7 arcade games." },
  { n: "3", title: "Get a game + a coin", body: "An ERC-20 with that face launches on Monad. Share, play, trade." },
];

export default async function Home() {
  const games = await getStore()
    .list(24)
    .catch((e) => {
      console.error("[feed]", e);
      return [];
    });

  return (
    <div className="space-y-8">
      <CreateForm />

      <section className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.n} className="brut flex gap-3 bg-white p-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-[3px] border-ink bg-banana font-[family-name:var(--font-display)] font-black">{s.n}</span>
            <div>
              <div className="font-black">{s.title}</div>
              <div className="text-sm opacity-80">{s.body}</div>
            </div>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-3 font-[family-name:var(--font-display)] text-2xl font-black">7 games, one face</h2>
        <div className="flex flex-wrap gap-2">
          {GAME_TYPES.map((t) => (
            <span key={t} className="brut bg-white px-3 py-1.5 text-sm font-bold">
              {GAME_META[t].label}
            </span>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-black">Fresh launches</h2>
          <Link href="/leaderboard" className="inline-flex items-center gap-1 text-sm font-bold underline">Daily prize pool <Icon name="arrowRight" size={14} /></Link>
        </div>
        {games.length === 0 ? (
          <p className="brut bg-white p-4 text-sm">No games yet. Be the first degen.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
