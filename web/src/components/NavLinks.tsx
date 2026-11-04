"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./ui/Icon";

const LINKS = [
  { href: "/leaderboard", icon: "trophy", label: "Leaderboard" },
  { href: "/portfolio", icon: "wallet", label: "Portfolio" },
  { href: "/activity", icon: "activity", label: "Activity" },
] satisfies { href: string; icon: IconName; label: string }[];

/** Header navigation. Marks the current page with aria-current so it's styled and announced. */
export function NavLinks() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex items-center gap-0.5 text-sm sm:gap-1">
      {LINKS.map((l) => {
        const current = path === l.href || path.startsWith(`${l.href}/`);
        return (
          <Link key={l.href} href={l.href} className="nav-link" aria-current={current ? "page" : undefined} aria-label={l.label}>
            <Icon name={l.icon} size={17} />
            <span className="hidden md:inline">{l.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
