"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/leaderboard", icon: "🏆", label: "Leaderboard" },
  { href: "/portfolio", icon: "💼", label: "Portfolio" },
  { href: "/activity", icon: "📜", label: "Activity" },
];

/** Header navigation. Marks the current page with aria-current so it's styled and announced. */
export function NavLinks() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex items-center gap-1 text-sm">
      {LINKS.map((l) => {
        const current = path === l.href || path.startsWith(`${l.href}/`);
        return (
          <Link key={l.href} href={l.href} className="nav-link" aria-current={current ? "page" : undefined} aria-label={l.label}>
            <span aria-hidden>{l.icon}</span>
            <span className="hidden md:inline">{l.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
