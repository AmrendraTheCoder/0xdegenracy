"use client";

import { useEffect, useState } from "react";
import { encodeFunctionData, zeroAddress } from "viem";
import { useAccount, useReadContract, useReadContracts, useSendTransaction } from "wagmi";
import { gameTokenFactoryAbi, prizePoolAbi } from "@/lib/abi";
import { explorerAddress, FACTORY_ADDRESS, monadTestnet } from "@/lib/chain";
import { fmtMon, short } from "@/lib/format";
import { useTx } from "@/lib/useTx";
import { Icon } from "./ui/Icon";

export const SHARES = [25, 18, 15, 12, 10, 8, 6, 4, 1, 1];

function useCountdown() {
  // Starts null so server and client render the same HTML (no hydration mismatch), then ticks.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return "…";
  const left = 86_400_000 - (now % 86_400_000); // to next 00:00 UTC
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

export function Leaderboard() {
  const { address } = useAccount();
  const { sendTransactionAsync } = useSendTransaction();
  const { run, busy } = useTx();
  const countdown = useCountdown();

  const poolAddr = useReadContract({ address: FACTORY_ADDRESS, abi: gameTokenFactoryAbi, functionName: "prizePool", chainId: monadTestnet.id, query: { enabled: !!FACTORY_ADDRESS } });
  const pool = poolAddr.data;
  const p = { address: pool!, abi: prizePoolAbi, chainId: monadTestnet.id } as const;
  const dayQ = useReadContract({ ...p, functionName: "currentDay", query: { enabled: !!pool, refetchInterval: 30_000 } });
  const today = dayQ.data;
  const y = today !== undefined ? today - 1n : undefined;

  const reads = useReadContracts({
    contracts:
      pool && today !== undefined && y !== undefined
        ? [
            { ...p, functionName: "poolOf", args: [today] },
            { ...p, functionName: "getTop", args: [today] },
            { ...p, functionName: "poolOf", args: [y] },
            { ...p, functionName: "getTop", args: [y] },
            { ...p, functionName: "settled", args: [y] },
            { ...p, functionName: "claimable", args: [address ?? zeroAddress] },
            { ...p, functionName: "volumeOf", args: [today, address ?? zeroAddress] },
          ]
        : [],
    query: { enabled: !!pool && today !== undefined, refetchInterval: 5000 },
  });
  const r = reads.data?.map((x) => x.result);
  const todayPool = r?.[0] as bigint | undefined;
  const todayTop = ((r?.[1] as { user: string; volume: bigint }[] | undefined) ?? []).filter((e) => e.user !== zeroAddress);
  const yPool = r?.[2] as bigint | undefined;
  const yTop = ((r?.[3] as { user: string; volume: bigint }[] | undefined) ?? []).filter((e) => e.user !== zeroAddress);
  const ySettled = r?.[4] as boolean | undefined;
  const claimable = (r?.[5] as bigint | undefined) ?? 0n;
  const myVolume = (r?.[6] as bigint | undefined) ?? 0n;
  const myRank = address ? todayTop.findIndex((e) => e.user.toLowerCase() === address.toLowerCase()) : -1;

  const settle = () =>
    run({
      label: "Settling yesterday's pool",
      success: `Paid ${fmtMon(yPool ?? 0n)} MON to the top ${yTop.length}`,
      send: () => sendTransactionAsync({ to: pool!, data: encodeFunctionData({ abi: prizePoolAbi, functionName: "settle", args: [y!] }), chainId: monadTestnet.id }),
    }).then(() => reads.refetch());
  const claim = () =>
    run({
      label: "Claiming prize",
      success: `Claimed ${fmtMon(claimable)} MON`,
      send: () => sendTransactionAsync({ to: pool!, data: encodeFunctionData({ abi: prizePoolAbi, functionName: "claim" }), chainId: monadTestnet.id }),
    }).then(() => reads.refetch());

  if (!FACTORY_ADDRESS) return <p className="brut bg-white p-4 text-sm">Factory address is not configured.</p>;
  if (poolAddr.isError) return <p className="brut bg-white p-4 text-sm">This factory has no prize pool. Deploy the latest contracts.</p>;

  return (
    <div className="space-y-6">
      <section className="brut bg-banana p-4 sm:p-6">
        <div className="text-sm font-bold uppercase">Today&apos;s prize pool</div>
        <div className="font-[family-name:var(--font-display)] text-4xl font-black sm:text-5xl">{todayPool !== undefined ? fmtMon(todayPool) : "…"} MON</div>
        <div className="mt-1 text-sm">
          Pays out to the top 10 traders by volume in <b>{countdown}</b> (00:00 UTC).
        </div>
        {address && (
          <div className="mt-2 text-sm">
            You: <b>{fmtMon(myVolume)} MON</b> volume today{myRank >= 0 ? ` · rank #${myRank + 1}` : ""}
          </div>
        )}
        {claimable > 0n && (
          <button className="brut-btn mt-3 bg-hot px-4 py-2 text-white" disabled={busy} onClick={claim}>
            Claim {fmtMon(claimable)} MON
          </button>
        )}
      </section>

      <Board title="Today · live" entries={todayTop} pool={todayPool} you={address} empty="No trades today yet. Trade any game's coin to get on the board." />

      <section className="brut bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-black">Yesterday</h2>
          {ySettled === false && (yTop.length > 0 || (yPool ?? 0n) > 0n) && (
            <button className="brut-btn bg-mint px-3 py-1 text-sm" disabled={busy || !address} onClick={settle} title={address ? "" : "Connect a wallet to settle"}>
              Settle & pay winners
            </button>
          )}
          {ySettled && <span className="inline-flex items-center gap-1 text-sm font-bold text-up"><Icon name="circleCheck" size={16} /> Paid out</span>}
        </div>
        <Board entries={yTop} pool={yPool} you={address} empty="Nobody traded yesterday." bare />
      </section>

      <section className="brut bg-white p-4 text-sm">
        <h2 className="font-black">How it works</h2>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Every buy and sell of a 0xdegenracy coin pays a 2% fee: 1% to the game&apos;s creator, 1% into today&apos;s pool.</li>
          <li>Your score is your total MON traded today, across all games, measured on-chain.</li>
          <li>After 00:00 UTC anyone can settle (a daily job does it too). Payouts: {SHARES.map((s, i) => `#${i + 1} ${s}%`).join(" · ")}.</li>
          <li>Unfilled ranks roll over into the next day&apos;s pool.</li>
        </ul>
        {pool && (
          <a className="mt-2 inline-block underline" href={explorerAddress(pool)} target="_blank" rel="noreferrer">
            PrizePool contract {short(pool)} <Icon name="external" size={13} />
          </a>
        )}
      </section>
    </div>
  );
}

function Board({ title, entries, pool, you, empty, bare }: { title?: string; entries: { user: string; volume: bigint }[]; pool?: bigint; you?: string; empty: string; bare?: boolean }) {
  const body = (
    <>
      {title && <h2 className="mb-2 font-[family-name:var(--font-display)] text-xl font-black">{title}</h2>}
      {entries.length === 0 ? (
        <p className="py-2 text-sm opacity-70">{empty}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase opacity-60">
              <th className="py-1">#</th>
              <th>Trader</th>
              <th className="text-right">Volume</th>
              <th className="text-right">Share</th>
              <th className="text-right">Prize</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => {
              const me = you && e.user.toLowerCase() === you.toLowerCase();
              return (
                <tr key={e.user} className={`border-t border-ink/10 ${me ? "bg-banana/60 font-black" : ""}`}>
                  <td className="py-1.5">
                    <span className={`inline-grid h-7 w-7 place-items-center rounded-full border-2 border-ink text-xs font-black ${["bg-banana", "bg-[#e5e7eb]", "bg-[#f4b183]"][i] ?? "bg-white"}`}>{i + 1}</span>
                  </td>
                  <td>
                    <a className="underline" href={explorerAddress(e.user)} target="_blank" rel="noreferrer">{short(e.user)}</a>
                    {me && " (you)"}
                  </td>
                  <td className="text-right">{fmtMon(e.volume, 4)}</td>
                  <td className="text-right">{SHARES[i]}%</td>
                  <td className="text-right font-bold">{pool !== undefined ? fmtMon((pool * BigInt(SHARES[i])) / 100n) : "…"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
  return bare ? body : <section className="brut bg-white p-4">{body}</section>;
}
