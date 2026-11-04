import type { Metadata } from "next";
import { DiscoverView } from "@/components/discover/DiscoverView";

export const metadata: Metadata = {
  title: "0xdegenracy — every coin ships with a game",
  description: "Trending coins, live trades and top traders. Upload a face, type an idea, get a playable game and a coin on Monad.",
};

/** Home is Discover. Creating a game opens as a popup (?create=1) from the header or the Create button. */
export default function Home() {
  return <DiscoverView />;
}
