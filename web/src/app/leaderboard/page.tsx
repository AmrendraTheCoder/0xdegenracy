import type { Metadata } from "next";
import { Leaderboard } from "@/components/Leaderboard";

export const metadata: Metadata = { title: "Leaderboard — 0xdegenracy" };

export default function LeaderboardPage() {
  return (
    <div className="space-y-4">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black sm:text-4xl">Daily leaderboard</h1>
      <Leaderboard />
    </div>
  );
}
