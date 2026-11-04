import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { Providers } from "./providers";
import { ConnectButton } from "@/components/ConnectButton";

export const metadata: Metadata = {
  title: "Reachy — every coin ships with a game",
  description: "Upload a face, type a game idea, get a playable meme game plus a memecoin on Monad.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffe066" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <Providers>
          <header className="sticky top-0 z-10 border-b-[3px] border-ink bg-banana">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
              <Link href="/" className="font-[family-name:var(--font-display)] text-2xl font-black tracking-tight">
                REACHY<span className="text-hot">.</span>
              </Link>
              <ConnectButton />
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
          <footer className="mx-auto max-w-5xl px-4 pb-10 text-xs opacity-70">
            Monad testnet only. Tokens have no value. No sell function. Play responsibly, degen.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
