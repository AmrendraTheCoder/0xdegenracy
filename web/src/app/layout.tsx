import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Bricolage_Grotesque, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { ConnectButton } from "@/components/ConnectButton";
import { NavLinks } from "@/components/NavLinks";
import { CreateButton, CreateModal } from "@/components/CreateModal";
import { Suspense } from "react";
import { explorerAddress, FACTORY_ADDRESS, FAUCET_URL } from "@/lib/chain";
import { Icon } from "@/components/ui/Icon";

// Self-hosted at build time by next/font: no request to Google at runtime and no layout shift.
const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-bricolage", display: "swap" });
const sans = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-space", display: "swap" });

export const metadata: Metadata = {
  title: "0xdegenracy — every coin ships with a game",
  description: "Upload a face, type a game idea, get a playable meme game plus a memecoin on Monad.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffe066" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="flex min-h-dvh flex-col antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-3 focus:py-2 focus:text-banana">
          Skip to content
        </a>
        <Providers>
          <header className="sticky top-0 z-20 border-b-[3px] border-ink bg-banana/95 backdrop-blur supports-[backdrop-filter]:bg-banana/85">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-1.5 sm:gap-4">
                <Link href="/" className="shrink-0 font-[family-name:var(--font-display)] text-lg font-extrabold tracking-tight min-[400px]:text-xl sm:text-2xl" aria-label="0xdegenracy home">
                  <span className="text-hot-strong">0x</span>degenracy
                </Link>
                <NavLinks />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Suspense fallback={null}>
                  <CreateButton />
                </Suspense>
                <ConnectButton />
              </div>
            </div>
          </header>
          <Suspense fallback={null}>
            <CreateModal />
          </Suspense>
          <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:py-8">
            {children}
          </main>
          <footer className="border-t-[3px] border-ink bg-white/60">
            <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-xs sm:flex-row sm:items-center sm:justify-between">
              <p className="opacity-80">
                <span className="font-[family-name:var(--font-display)] font-extrabold">0xdegenracy</span> · every coin ships with a game. Monad
                testnet only. Tokens have no value. Play responsibly, degen.
              </p>
              <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-1 font-bold">
                <Link className="hover:underline" href="/leaderboard">Prize pool</Link>
                <Link className="hover:underline" href="/activity">On-chain proof</Link>
                {FACTORY_ADDRESS && (
                  <a className="hover:underline" href={explorerAddress(FACTORY_ADDRESS)} target="_blank" rel="noreferrer">
                    Factory contract <Icon name="external" size={12} className="inline" />
                  </a>
                )}
                <a className="hover:underline" href={FAUCET_URL} target="_blank" rel="noreferrer">Testnet faucet <Icon name="external" size={12} className="inline" /></a>
              </nav>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
