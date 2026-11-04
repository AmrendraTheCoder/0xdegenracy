import { AddressLink, Card } from "@/components/ui";

export type OnChainProofProps = {
  token: string;
  txHash: string;
  creator: string;
  blockNumber?: string;
  factory?: string;
  /** Region id (must be unique if rendered more than once). */
  id?: string;
};

/** Explorer links proving the launch happened on-chain. Server-renderable. */
export function OnChainProof({ token, txHash, creator, blockNumber, factory, id = "proof" }: OnChainProofProps) {
  const rows: [string, React.ReactNode][] = [
    ["Token", <AddressLink key="t" value={token} copy />],
    ["Launch tx", <AddressLink key="tx" value={txHash} kind="tx" copy />],
    ...(blockNumber ? ([["Block", <span key="b" className="font-mono font-bold">{blockNumber}</span>]] as [string, React.ReactNode][]) : []),
    ...(factory ? ([["Factory", <AddressLink key="f" value={factory} label={`${factory.slice(0, 6)}… · verified`} />]] as [string, React.ReactNode][]) : []),
    ["Creator", <AddressLink key="c" value={creator} copy />],
  ];
  return (
    <Card as="aside" id={id} title="On-chain proof" className="text-sm">
      <dl className="divide-y-2 divide-ink/10">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3 py-1.5">
            <dt className="text-ink/70">{k}</dt>
            <dd className="min-w-0 text-right">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
