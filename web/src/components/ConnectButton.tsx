"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { monadTestnet } from "@/lib/chain";

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function ConnectButton() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { address, chainId, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  if (!mounted) return <div className="h-10 w-32" />;

  if (!isConnected) {
    // Prefer a wallet announced via EIP-6963 (MetaMask first) over the generic window.ethereum
    // connector, which can point at a stale provider or another extension that hijacked it.
    const announced = connectors.filter((c) => c.id !== "injected");
    const injected =
      announced.find((c) => c.id === "io.metamask") ?? announced[0] ?? connectors.find((c) => c.id === "injected");
    return (
      <button
        className="brut-btn bg-white px-3 py-2 text-sm"
        disabled={isPending || !injected}
        onClick={() => injected && connect({ connector: injected, chainId: monadTestnet.id })}
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }
  if (chainId !== monadTestnet.id) {
    return (
      <button className="brut-btn bg-hot px-3 py-2 text-sm text-white" onClick={() => switchChain({ chainId: monadTestnet.id })}>
        Switch to Monad
      </button>
    );
  }
  return (
    <button className="brut-btn bg-white px-3 py-2 text-sm" onClick={() => disconnect()} title="Disconnect">
      {short(address!)}
    </button>
  );
}
