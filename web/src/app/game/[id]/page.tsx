import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Address } from "viem";
import { GamePlayer } from "@/components/GamePlayer";
import { PriceChart } from "@/components/PriceChart";
import { TokenPanel } from "@/components/TokenPanel";
import { getStore } from "@/lib/server/store";
import { explorerAddress, explorerTx } from "@/lib/chain";
import { short } from "@/lib/format";

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
  // The launch event carries block and gas data; older games launched before the event log have none.
  const [launch] = await getStore()
    .listEvents({ gameId: game.id, kinds: ["launch"], limit: 1 })
    .catch(() => []);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section className="space-y-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-black leading-none sm:text-4xl">{c.title}</h1>
          <p className="mt-1 text-sm">{c.tagline}</p>
        </div>
        <GamePlayer config={c} imageUrl={game.image_url} />
        {game.token_address && <PriceChart gameId={game.id} launchedAt={game.created_at} accent={c.colors.accent} />}
      </section>
      <div className="space-y-4">
        {game.token_address ? (
          <TokenPanel token={game.token_address as Address} config={c} imageUrl={game.image_url} txHash={game.tx_hash} />
        ) : (
          <aside className="brut bg-white p-4 text-sm font-bold">Token is still launching… refresh in a few seconds.</aside>
        )}
        {game.tx_hash && game.token_address && (
          <aside className="brut bg-white p-4 text-sm">
            <h2 className="font-black">On-chain proof</h2>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="opacity-70">Token</dt>
              <dd className="text-right"><a className="underline" href={explorerAddress(game.token_address)} target="_blank" rel="noreferrer">{short(game.token_address)} ↗</a></dd>
              <dt className="opacity-70">Launch tx</dt>
              <dd className="text-right"><a className="underline" href={explorerTx(game.tx_hash)} target="_blank" rel="noreferrer">{short(game.tx_hash)} ↗</a></dd>
              {typeof launch?.data?.blockNumber === "string" && (
                <>
                  <dt className="opacity-70">Block</dt>
                  <dd className="text-right">{launch.data.blockNumber}</dd>
                </>
              )}
              {typeof launch?.data?.factory === "string" && (
                <>
                  <dt className="opacity-70">Factory</dt>
                  <dd className="text-right"><a className="underline" href={explorerAddress(launch.data.factory)} target="_blank" rel="noreferrer">{short(launch.data.factory)} (verified) ↗</a></dd>
                </>
              )}
              <dt className="opacity-70">Creator</dt>
              <dd className="text-right"><a className="underline" href={explorerAddress(game.creator)} target="_blank" rel="noreferrer">{short(game.creator)} ↗</a></dd>
            </dl>
          </aside>
        )}
      </div>
    </div>
  );
}
