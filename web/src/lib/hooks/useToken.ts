"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { encodeFunctionData, parseAbi, parseEther, zeroAddress, type Address, type Hex } from "viem";
import { useAccount, useBalance, useEstimateGas, useReadContract, useReadContracts } from "wagmi";
import { gameTokenAbi } from "@/lib/abi";
import { monadTestnet } from "@/lib/chain";
import { TRADE_EVENT } from "@/lib/useTx";

/** 5%: other trades can land between quote and inclusion. */
export const SLIPPAGE_BPS = 500n;
export const withSlippage = (x: bigint) => (x * (10_000n - SLIPPAGE_BPS)) / 10_000n;

// Tokens from the first (buy-only) factory expose quote() instead of quoteBuy() and have no sell().
const legacyAbi = parseAbi(["function quote(uint256 valueWei) view returns (uint256 tokensWhole, uint256 spent, uint256 fee)"]);

const base = (token: Address) => ({ address: token, abi: gameTokenAbi, chainId: monadTestnet.id }) as const;

export type TokenStats = {
  status: "loading" | "error" | "ready";
  price?: bigint;
  sold?: bigint;
  supply?: bigint;
  remaining?: bigint;
  /** Percentage of supply sold, 0–100 with two decimals. */
  progress: number;
  /** Launched by the v1 factory: buy-only, 1% fee, no prize pool. */
  legacy: boolean;
  soldOut: boolean;
  error: Error | null;
  refetch: () => void;
};

/** Live price, sold and supply for a token, polled every 4s. */
export function useTokenStats(token: Address): TokenStats {
  const q = useReadContracts({
    contracts: [
      { ...base(token), functionName: "currentPrice" },
      { ...base(token), functionName: "sold" },
      { ...base(token), functionName: "TOTAL_SUPPLY_WHOLE" },
      { ...base(token), functionName: "prizePool" }, // reverts on legacy tokens
    ],
    query: { refetchInterval: 4000 },
  });
  const [p, s, t, pool] = q.data ?? [];
  const price = p?.status === "success" ? (p.result as bigint) : undefined;
  const sold = s?.status === "success" ? (s.result as bigint) : undefined;
  const supply = t?.status === "success" ? (t.result as bigint) : undefined;
  // Only call it legacy when the token itself answered but prizePool() did not; a dead RPC fails everything.
  const legacy = price !== undefined && pool?.status === "failure";
  const ready = price !== undefined && sold !== undefined && !!supply;
  const status = ready ? "ready" : q.isError || (q.data && !ready) ? "error" : "loading";
  return {
    status,
    price,
    sold,
    supply,
    remaining: ready ? supply - sold : undefined,
    progress: ready ? Number((sold * 10000n) / supply) / 100 : 0,
    legacy,
    soldOut: ready ? sold >= supply : false,
    error: (q.error as Error | null) ?? (p?.status === "failure" ? (p.error as Error) : null),
    refetch: () => void q.refetch(),
  };
}

/** Connected wallet's MON balance and whole-token balance. */
export function useTokenBalances(token: Address) {
  const { address } = useAccount();
  const mon = useBalance({ address, chainId: monadTestnet.id, query: { enabled: !!address, refetchInterval: 6000 } });
  const tok = useReadContract({
    ...base(token),
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    query: { enabled: !!address, refetchInterval: 4000 },
  });
  return {
    address,
    mon: mon.data?.value,
    heldWhole: tok.data !== undefined ? tok.data / 10n ** 18n : undefined,
    loading: !!address && (mon.isLoading || tok.isLoading),
    refetch: () => {
      void mon.refetch();
      void tok.refetch();
    },
  };
}

/** Parses a MON amount string; null for empty, zero or invalid input. */
export function parseMon(amount: string): bigint | null {
  try {
    const v = parseEther(amount || "0");
    return v > 0n ? v : null;
  } catch {
    return null;
  }
}

export type BuyQuote = { value: bigint | null; tokensOut: bigint; minOut: bigint; data: Hex; loading: boolean; error: Error | null };

/** Tokens out for `amount` MON (fee included), min-out with slippage, and the encoded buy() call. */
export function useBuyQuote(token: Address, amount: string, legacy: boolean, enabled = true): BuyQuote {
  const value = useMemo(() => parseMon(amount), [amount]);
  const on = enabled && !!value;
  const v2 = useReadContract({ ...base(token), functionName: "quoteBuy", args: [value ?? 0n], query: { enabled: on && !legacy } });
  const v1 = useReadContract({ address: token, abi: legacyAbi, functionName: "quote", args: [value ?? 0n], chainId: monadTestnet.id, query: { enabled: on && legacy } });
  const q = legacy ? v1 : v2;
  const tokensOut = (on ? q.data?.[0] : undefined) ?? 0n;
  const minOut = withSlippage(tokensOut);
  const data = useMemo(() => encodeFunctionData({ abi: gameTokenAbi, functionName: "buy", args: [minOut] }), [minOut]);
  return { value, tokensOut, minOut, data, loading: on && q.isLoading, error: on ? (q.error as Error | null) : null };
}

export type SellQuote = { amount: bigint; netOut: bigint; minMon: bigint; data: Hex; loading: boolean; error: Error | null };

/** Net MON out for selling `tokensWhole`, min-out with slippage, and the encoded sell() call. */
export function useSellQuote(token: Address, tokensWhole: bigint, enabled = true): SellQuote {
  const on = enabled && tokensWhole > 0n;
  const q = useReadContract({ ...base(token), functionName: "quoteSell", args: [tokensWhole], query: { enabled: on } });
  const netOut = (on ? q.data?.[2] : undefined) ?? 0n;
  const minMon = withSlippage(netOut);
  const data = useMemo(() => encodeFunctionData({ abi: gameTokenAbi, functionName: "sell", args: [tokensWhole, minMon] }), [tokensWhole, minMon]);
  return { amount: tokensWhole, netOut, minMon, data, loading: on && q.isLoading, error: on ? (q.error as Error | null) : null };
}

/**
 * Gas limit for a call. Monad charges the full gas LIMIT, so estimate and add only 10%
 * instead of letting the wallet guess high.
 */
export function useTradeGas({ to, data, value, enabled }: { to: Address; data: Hex; value: bigint; enabled: boolean }) {
  const { address } = useAccount();
  const q = useEstimateGas({ to, data, value, account: address, chainId: monadTestnet.id, query: { enabled: enabled && !!address } });
  return {
    limit: q.data !== undefined ? q.data + q.data / 10n : undefined,
    loading: enabled && !!address && q.isLoading,
    error: enabled ? q.error : null,
  };
}

export type Trade = {
  id: string;
  created_at: string;
  kind: "buy" | "sell";
  tx_hash: string;
  actor: string;
  data: { tokensWhole: string; value: string; newPrice: string };
};

/** Verified trades for a game (oldest first), polled every 8s and refreshed right after our own trades. */
export function useTrades(gameId: string) {
  const q = useQuery({
    queryKey: ["trades", gameId],
    queryFn: async () => {
      const res = await fetch(`/api/games/${gameId}/trades`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Could not load trades (HTTP ${res.status})`);
      return (await res.json()).trades as Trade[];
    },
    refetchInterval: 8000,
    retry: 1,
  });
  const { refetch } = q;
  useEffect(() => {
    const on = () => void refetch();
    window.addEventListener(TRADE_EVENT, on);
    return () => window.removeEventListener(TRADE_EVENT, on);
  }, [refetch]);
  return { trades: q.data ?? [], status: q.data ? "ready" : q.isError ? "error" : "loading", error: q.error, retry: () => void refetch() } as const;
}

/** Live on-chain price, used to anchor the chart's "now" point. */
export function useLivePrice(token: Address) {
  return useReadContract({ ...base(token), functionName: "currentPrice", query: { refetchInterval: 5000 } }).data;
}
