import { explorerAddress, explorerTx } from "@/lib/chain";
import { short } from "@/lib/format";
import { CopyButton } from "./CopyButton";
import { cn } from "./cn";

export type AddressLinkProps = {
  /** An address or a transaction hash. */
  value: string;
  kind?: "address" | "tx";
  /** Visible text; defaults to the shortened value. */
  label?: string;
  /** Adds a copy-to-clipboard button. */
  copy?: boolean;
  className?: string;
};

/** Explorer link for an address or tx, shortened, with the full value in the title and an optional copy button. */
export function AddressLink({ value, kind = "address", label, copy, className }: AddressLinkProps) {
  const href = kind === "tx" ? explorerTx(value) : explorerAddress(value);
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <a href={href} target="_blank" rel="noreferrer" title={value} className="font-mono font-bold underline decoration-2 underline-offset-2 hover:bg-banana">
        {label ?? short(value)}
        <span aria-hidden> ↗</span>
        <span className="sr-only"> (view {kind === "tx" ? "transaction" : "address"} on explorer, opens in a new tab)</span>
      </a>
      {copy && <CopyButton value={value} label={`Copy ${kind === "tx" ? "transaction hash" : "address"}`} />}
    </span>
  );
}
