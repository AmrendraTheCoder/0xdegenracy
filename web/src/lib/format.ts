import { formatEther } from "viem";

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export const fmtTokens = (n: bigint | number) =>
  Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 }).format(Number(n));

/** MON amounts: trims trailing zeros, keeps small values readable. */
export function fmtMon(wei: bigint, digits = 6) {
  const n = Number(formatEther(wei));
  if (n === 0) return "0";
  if (n < 10 ** -digits) return n.toExponential(2);
  return n.toLocaleString("en", { maximumFractionDigits: digits });
}

/** Per-token prices are tiny (1e8 wei = 1e-10 MON), so show them in scientific notation. */
export const fmtPrice = (wei: bigint | number) => `${(Number(wei) / 1e18).toExponential(3)} MON`;

export function timeAgo(iso: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
