import { CreateForm } from "@/components/CreateForm";
import { GameCard } from "@/components/GameCard";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

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
      <section>
        <h2 className="mb-3 font-[family-name:var(--font-display)] text-2xl font-black">Fresh launches 🔥</h2>
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
