"use client";

import { useToast } from "@/components/Toaster";
import { Button } from "@/components/ui";

/** Native share sheet when available, else copies the page URL and confirms with a toast. */
export function ShareButton({ title, text }: { title: string; text: string }) {
  const { toast } = useToast();
  return (
    <Button
      variant="buy"
      block
      onClick={async () => {
        const url = window.location.href.split(/[?#]/)[0];
        if (navigator.share) {
          await navigator.share({ title, text, url }).catch(() => {});
          return;
        }
        try {
          await navigator.clipboard.writeText(url);
          toast({ kind: "success", title: "Link copied", description: url });
        } catch {
          toast({ kind: "error", title: "Couldn't copy the link", description: url });
        }
      }}
    >
      <span aria-hidden>📣</span> Share
    </Button>
  );
}
