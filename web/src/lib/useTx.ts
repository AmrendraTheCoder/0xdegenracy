"use client";

import { useCallback, useState } from "react";
import type { Hex } from "viem";
import { useConfig } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { explorerTx, monadTestnet } from "./chain";
import { errorText, useToast } from "@/components/Toaster";

export const TRADE_EVENT = "reachy:trade";

/**
 * Runs a wallet transaction with toast feedback at every step and returns the receipt status.
 * `record: true` reports the tx to /api/trades (server verifies it on-chain) for the chart and activity log.
 */
export function useTx() {
  const config = useConfig();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (opts: { label: string; success: string; send: () => Promise<Hex>; record?: boolean }) => {
      const id = Math.random().toString(36).slice(2);
      setBusy(true);
      toast({ id, kind: "pending", title: opts.label, description: "Confirm in your wallet…" });
      try {
        const hash = await opts.send();
        toast({ id, kind: "pending", title: opts.label, description: "Submitted. Waiting for Monad (~0.5s)…", href: explorerTx(hash) });
        const receipt = await waitForTransactionReceipt(config, { hash, chainId: monadTestnet.id, pollingInterval: 300 });
        if (receipt.status !== "success") throw new Error("Transaction reverted on-chain");
        toast({ id, kind: "success", title: opts.success, description: `Block ${receipt.blockNumber}`, href: explorerTx(hash) });
        if (opts.record) {
          await fetch("/api/trades", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ txHash: hash }) }).catch(() => {});
          window.dispatchEvent(new CustomEvent(TRADE_EVENT, { detail: { hash } }));
        }
        return { ok: true as const, hash };
      } catch (err) {
        toast({ id, kind: "error", title: `${opts.label} failed`, description: errorText(err) });
        return { ok: false as const };
      } finally {
        setBusy(false);
      }
    },
    [config, toast],
  );

  return { run, busy };
}
