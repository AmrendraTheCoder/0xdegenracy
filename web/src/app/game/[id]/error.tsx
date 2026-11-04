"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button, buttonClasses } from "@/components/ui";

export default function GameError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div role="alert" className="brut mx-auto max-w-md bg-white p-6 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black">This game glitched.</h1>
      <p className="mt-2 text-sm">We couldn&apos;t load it. That&apos;s usually the database or the RPC having a moment.</p>
      {error.digest && <p className="mt-1 font-mono text-xs text-ink/70">Error id: {error.digest}</p>}
      <div className="mt-4 flex justify-center gap-3">
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
        <Link href="/" className={buttonClasses({ variant: "secondary" })}>
          Home
        </Link>
      </div>
    </div>
  );
}
