"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";
import { CreateForm } from "./CreateForm";
import { Modal } from "./ui/Modal";
import { Icon } from "./ui/Icon";
import { buttonClasses, cn } from "./ui";

/** `?create=1` on any page opens the create popup; closing it removes the param. Shareable and back-button friendly. */
export function CreateModal() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const open = params.get("create") === "1";

  const close = useCallback(() => {
    markSeen();
    const next = new URLSearchParams(params.toString());
    next.delete("create");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  // First visit to the home page: open the create popup by itself, once per browser, after a short beat
  // so the page behind it has painted. Never on deep links (games, coins, ?ref=…) or once seen.
  useEffect(() => {
    if (pathname !== "/" || params.toString() !== "" || hasSeen()) return;
    const t = setTimeout(() => {
      markSeen();
      router.replace("/?create=1", { scroll: false });
    }, 1200);
    return () => clearTimeout(t);
  }, [pathname, params, router]);
  // Opening it any other way also counts as seen.
  useEffect(() => {
    if (open) markSeen();
  }, [open]);

  return (
    <Modal open={open} onClose={close} title="Create a game" description="Upload a face, type an idea. You get a playable game and a coin on Monad.">
      <Link href="/create" className="mb-3 inline-flex items-center gap-1 text-sm font-bold underline">
        Open the full create page <Icon name="arrowRight" size={14} />
      </Link>
      <CreateForm />
    </Modal>
  );
}

/** Header button: opens the create popup on top of whatever page you are on. */
export function CreateButton({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <Link href={`${pathname}?create=1`} scroll={false} className={cn(buttonClasses({ variant: "primary", size: "sm" }), "shrink-0 px-2.5 sm:px-3", className)} aria-label="Create a game">
      <Icon name="spark" size={16} />
      <span className="hidden sm:inline">Create</span>
    </Link>
  );
}

const SEEN_KEY = "reachy:create-popup-seen";
function hasSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true; // storage blocked (private mode etc.): don't nag on every visit
  }
}
function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {}
}
