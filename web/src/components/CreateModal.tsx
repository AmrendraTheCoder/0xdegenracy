"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
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
    const next = new URLSearchParams(params.toString());
    next.delete("create");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);

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
