import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Address } from "viem";
import { GamePlayer } from "@/components/GamePlayer";
import { CoinView } from "@/components/coin/CoinView";
import { PriceChart } from "@/components/PriceChart";
import { TokenPanel } from "@/components/TokenPanel";
import { MobileTradeBar } from "@/components/token/MobileTradeBar";
import { OnChainProof } from "@/components/token/OnChainProof";
import { Badge, Card, Notice } from "@/components/ui";
import { GAME_META } from "@/games";
import { getStore } from "@/lib/server/store";

type Props = { params: Promise<{ id: string }> };

const TRADE_ID = "buy";

async function load(id: string) {
  if (!/^[a-z0-9]{6,16}$/.test(id)) return null;
  return getStore().get(id);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const game = await load((await params).id);
  if (!game) return { title: "Not found — 0xdegenracy" };
  const title = `${game.config.title} · $${game.config.ticker} — 0xdegenracy`;
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
  const token = game.token_address as Address | null;
  // Live coins get the full-screen terminal: game + chart + trading + holders, all in one view.
  if (token && game.status === "live") return <CoinView id={game.id} config={c} token={token} imageUrl={game.image_url} />;
  const meta = GAME_META[c.gameType];
  // The launch event carries block and gas data; older games launched before the event log have none.
  const [launch] = await getStore()
    .listEvents({ gameId: game.id, kinds: ["launch"], limit: 1 })
    .catch(() => []);
  const blockNumber = typeof launch?.data?.blockNumber === "string" ? launch.data.blockNumber : undefined;
  const factory = typeof launch?.data?.factory === "string" ? launch.data.factory : undefined;

  const proof = (id: string) =>
    game.tx_hash && token ? <OnChainProof id={id} token={token} txHash={game.tx_hash} creator={game.creator} blockNumber={blockNumber} factory={factory} /> : null;

  return (
    <article aria-labelledby="game-title" className={token ? "pb-20 lg:pb-0" : undefined}>
      <header className="mb-6">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <Badge tone="mint">{meta.label}</Badge>
          <Badge tone="banana">${c.ticker}</Badge>
        </div>
        <h1 id="game-title" className="break-words font-[family-name:var(--font-display)] text-3xl font-extrabold leading-[0.95] sm:text-5xl">
          {c.title}
        </h1>
        <p className="mt-2 max-w-prose text-base text-ink/80">{c.tagline}</p>
      </header>

      {/* Phone: game, trade, chart, proof. Desktop: game and chart on the left, trading on the right. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-label="Play" className="min-w-0 lg:col-start-1 lg:row-start-1">
          <GamePlayer config={c} imageUrl={game.image_url} gameId={game.id} tradeHref={`#${TRADE_ID}`} />
        </section>

        <div className="min-w-0 space-y-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          {token ? (
            <TokenPanel id={TRADE_ID} token={token} config={c} imageUrl={game.image_url} />
          ) : (
            <Card as="aside" id={TRADE_ID} title={`$${c.ticker}`}>
              <Notice tone="warn" title="Token is still launching">
                The launch transaction is being confirmed. Refresh in a few seconds.
              </Notice>
            </Card>
          )}
          {proof("proof") && <div className="hidden lg:block">{proof("proof")}</div>}
        </div>

        {token && (
          <div className="min-w-0 lg:col-start-1 lg:row-start-2">
            <PriceChart gameId={game.id} launchedAt={game.created_at} accent={c.colors.accent} token={token} />
          </div>
        )}
        {/* On phones the proof goes last, after the chart; only one copy is ever displayed. */}
        {proof("proof-mobile") && <div className="lg:hidden">{proof("proof-mobile")}</div>}
      </div>

      {token && <MobileTradeBar token={token} ticker={c.ticker} targetId={TRADE_ID} />}
    </article>
  );
}
