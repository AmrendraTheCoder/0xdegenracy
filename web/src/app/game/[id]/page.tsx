import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Address } from "viem";
import { GamePlayer } from "@/components/GamePlayer";
import { TokenPanel } from "@/components/TokenPanel";
import { getStore } from "@/lib/server/store";

type Props = { params: Promise<{ id: string }> };

async function load(id: string) {
  if (!/^[a-z0-9]{6,16}$/.test(id)) return null;
  return getStore().get(id);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const game = await load((await params).id);
  if (!game) return { title: "Not found — Reachy" };
  const title = `${game.config.title} · $${game.config.ticker} — Reachy`;
  return {
    title,
    description: game.config.tagline,
    openGraph: { title, description: game.config.tagline, images: [game.image_url] },
    twitter: { card: "summary", title, images: [game.image_url] },
  };
}

export default async function GamePage({ params }: Props) {
  const game = await load((await params).id);
  if (!game || game.status === "failed") notFound();
  const c = game.config;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-black leading-none sm:text-4xl">{c.title}</h1>
        <p className="mb-4 mt-1 text-sm">{c.tagline}</p>
        <GamePlayer config={c} imageUrl={game.image_url} />
      </section>
      {game.token_address ? (
        <TokenPanel token={game.token_address as Address} config={c} imageUrl={game.image_url} txHash={game.tx_hash} />
      ) : (
        <aside className="brut bg-white p-4 text-sm font-bold">Token is still launching… refresh in a few seconds.</aside>
      )}
    </div>
  );
}
