import type { Metadata } from "next";
import { PortfolioView } from "@/components/PortfolioView";

export const metadata: Metadata = { title: "Portfolio — Reachy" };

export default function PortfolioPage() {
  return (
    <div className="space-y-4">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black sm:text-4xl">Your bags 💼</h1>
      <PortfolioView />
    </div>
  );
}
