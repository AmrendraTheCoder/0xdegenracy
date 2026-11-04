import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Address } from "viem";
import { getStore } from "@/lib/server/store";
import { CoinView } from "@/components/coin/CoinView";

type Props = { params: Promise<{ id: string }> };

async function load(id: string) {
  if (!/^[a-z0-9]{6,16}$/.test(id)) return null;
  const g = await getStore().get(id);
  return g && g.status === "live" && g.token_address ? g : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const g = await load((await params).id);
  if (!g) return { title: "Not found — 0xdegenracy" };
  const title = `$${g.config.ticker} · ${g.config.tokenName} — 0xdegenracy`;
  return { title, description: g.config.tagline, openGraph: { title, description: g.config.tagline, images: [g.image_url] } };
}

/** Trading view for a coin: chart, holders, trades, stats, pool and the buy/sell panel. */
export default async function CoinPage({ params }: Props) {
  const g = await load((await params).id);
  if (!g) notFound();
  return <CoinView id={g.id} config={g.config} token={g.token_address as Address} imageUrl={g.image_url} />;
}
