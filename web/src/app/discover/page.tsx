import type { Metadata } from "next";
import { DiscoverView } from "@/components/discover/DiscoverView";

export const metadata: Metadata = {
  title: "Discover — 0xdegenracy",
  description: "Trending coins, live trades and top traders on 0xdegenracy. Every coin ships with a game.",
};

export default function DiscoverPage() {
  return <DiscoverView />;
}
