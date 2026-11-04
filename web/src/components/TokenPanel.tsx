"use client";

import { useEffect, useMemo, useState } from "react";
import { encodeFunctionData, formatEther, parseEther, type Address } from "viem";
import {
  useAccount,
  useBalance,
  useEstimateGas,
  useReadContract,
  useReadContracts,
  useSendTransaction,
  useSwitchChain,
  useWaitForTransactionReceipt,
} from "wagmi";
import { gameTokenAbi } from "@/lib/abi";
import { explorerAddress, explorerTx, FAUCET_URL, monadTestnet } from "@/lib/chain";
import type { GameConfig } from "@/lib/game-config";
import { short } from "./ConnectButton";

const PRESETS = ["0.001", "0.01", "0.05"];
const fmtTokens = (n: bigint) => Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 }).format(Number(n));

export function TokenPanel({ token, config, imageUrl, txHash }: { token: Address; config: GameConfig; imageUrl: string; txHash: string | null }) {
  const { address, chainId, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const [amount, setAmount] = useState("0.01");
  const [copied, setCopied] = useState(false);

  const value = useMemo(() => {
    try {
      const v = parseEther(amount || "0");
      return v > 0n ? v : null;
    } catch {
      return null;
    }
  }, [amount]);

  const base = { address: token, abi: gameTokenAbi, chainId: monadTestnet.id } as const;
  const stats = useReadContracts({
    contracts: [
      { ...base, functionName: "currentPrice" },
      { ...base, functionName: "sold" },
      { ...base, functionName: "TOTAL_SUPPLY_WHOLE" },
    ],
    query: { refetchInterval: 4000 },
  });
  const [price, sold, supply] = (stats.data ?? []).map((r) => r.result as bigint | undefined);

  const quote = useReadContract({ ...base, functionName: "quote", args: [value ?? 0n], query: { enabled: !!value } });
  const tokensOut = quote.data?.[0] ?? 0n;
  // 5% slippage tolerance: other buys can land between quote and inclusion.
  const minOut = (tokensOut * 95n) / 100n;

  const data = useMemo(() => encodeFunctionData({ abi: gameTokenAbi, functionName: "buy", args: [minOut] }), [minOut]);
  // Monad charges the full gas LIMIT, so estimate and add only 10% instead of letting the wallet guess high.
  const gas = useEstimateGas({ to: token, data, value: value ?? 0n, account: address, chainId: monadTestnet.id, query: { enabled: !!address && !!value && tokensOut > 0n } });
  const bal = useBalance({ address, chainId: monadTestnet.id, query: { enabled: !!address } });
  const balTok = useReadContract({ ...base, functionName: "balanceOf", args: [address ?? "0x0000000000000000000000000000000000000000"], query: { enabled: !!address, refetchInterval: 4000 } });

  const send = useSendTransaction();
  const receipt = useWaitForTransactionReceipt({ hash: send.data, chainId: monadTestnet.id, pollingInterval: 300 });

  useEffect(() => {
    if (receipt.isSuccess) {
      stats.refetch();
      balTok.refetch();
      bal.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);

  function buy() {
    if (!value || !gas.data) return;
    send.sendTransaction({ to: token, data, value, gas: gas.data + gas.data / 10n, chainId: monadTestnet.id });
  }

  const wrongChain = isConnected && chainId !== monadTestnet.id;
  const insufficient = bal.data && value ? bal.data.value < value : false;
  const pending = send.isPending || (!!send.data && receipt.isLoading);
  const progress = sold !== undefined && supply ? Number((sold * 10000n) / supply) / 100 : 0;

  return (
    <aside id="buy" className="brut space-y-4 bg-white p-4">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" className="h-16 w-16 rounded-full border-[3px] border-ink object-cover" />
        <div className="min-w-0">
          <div className="truncate font-[family-name:var(--font-display)] text-xl font-black">{config.tokenName}</div>
          <div className="font-bold" style={{ color: config.colors.accent }}>${config.ticker}</div>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="opacity-70">Price</dt>
        <dd className="text-right font-bold">{price !== undefined ? `${formatEther(price)} MON` : "…"}</dd>
        <dt className="opacity-70">Sold</dt>
        <dd className="text-right font-bold">{sold !== undefined ? `${fmtTokens(sold)} (${progress}%)` : "…"}</dd>
        <dt className="opacity-70">Contract</dt>
        <dd className="text-right">
          <a className="font-bold underline" href={explorerAddress(token)} target="_blank" rel="noreferrer">{short(token)}</a>
        </dd>
        {txHash && (
          <>
            <dt className="opacity-70">Launch tx</dt>
            <dd className="text-right">
              <a className="font-bold underline" href={explorerTx(txHash)} target="_blank" rel="noreferrer">{short(txHash)}</a>
            </dd>
          </>
        )}
      </dl>
      <div className="h-3 overflow-hidden rounded-full border-2 border-ink">
        <div className="h-full bg-hot" style={{ width: `${Math.max(1, progress)}%` }} />
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          {PRESETS.map((p) => (
            <button key={p} onClick={() => setAmount(p)} className={`brut-btn flex-1 py-1 text-sm ${amount === p ? "bg-banana" : "bg-white"}`}>
              {p}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            className="brut w-full bg-paper px-3 py-2 font-bold outline-none"
            aria-label="Amount in MON"
          />
          <span className="font-bold">MON</span>
        </div>
        <p className="text-sm">≈ <b>{fmtTokens(tokensOut)}</b> ${config.ticker} <span className="opacity-60">(1% creator fee incl.)</span></p>

        {!isConnected ? (
          <p className="rounded-lg bg-paper p-2 text-center text-sm font-bold">Connect a wallet (top right) to buy</p>
        ) : wrongChain ? (
          <button className="brut-btn w-full bg-hot py-3 text-white" onClick={() => switchChain({ chainId: monadTestnet.id })}>Switch to Monad testnet</button>
        ) : (
          <button className="brut-btn w-full bg-hot py-3 text-xl text-white" disabled={!value || !gas.data || pending || insufficient} onClick={buy}>
            {pending ? "Buying…" : insufficient ? "Not enough MON" : `BUY $${config.ticker}`}
          </button>
        )}
        {insufficient && (
          <a href={FAUCET_URL} target="_blank" rel="noreferrer" className="block text-center text-xs underline">Get testnet MON from the faucet</a>
        )}
        {receipt.isSuccess && send.data && (
          <p className="text-center text-sm font-bold text-green-700">
            Bought! <a className="underline" href={explorerTx(send.data)} target="_blank" rel="noreferrer">View tx</a>
          </p>
        )}
        {(send.error || gas.error) && (
          <p className="text-center text-xs text-hot">{(send.error ?? gas.error)?.message.split("\n")[0].slice(0, 140)}</p>
        )}
        {balTok.data !== undefined && balTok.data > 0n && (
          <p className="text-center text-xs">You hold {fmtTokens(balTok.data / 10n ** 18n)} ${config.ticker}</p>
        )}
      </div>

      <button
        className="brut-btn w-full bg-mint py-2"
        onClick={async () => {
          const url = window.location.href.split("?")[0];
          if (navigator.share) await navigator.share({ title: config.title, text: `Play ${config.title} and buy $${config.ticker}`, url }).catch(() => {});
          else {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }
        }}
      >
        {copied ? "Link copied!" : "Share"}
      </button>
      <p className="text-[11px] leading-tight opacity-60">Testnet only. No sell function in this MVP. Price rises linearly with every buy.</p>
    </aside>
  );
}
