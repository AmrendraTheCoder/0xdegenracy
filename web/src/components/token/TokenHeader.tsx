import { Badge } from "@/components/ui";

export type TokenHeaderProps = {
  name: string;
  ticker: string;
  imageUrl: string;
  /** Game accent colour; used for the avatar ring only (decorative, not text). */
  accent: string;
  legacy?: boolean;
  /** Heading id, so the enclosing region can be labelled by it. */
  headingId?: string;
};

export function TokenHeader({ name, ticker, imageUrl, accent, legacy, headingId }: TokenHeaderProps) {
  return (
    <div className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="" width={64} height={64} className="h-16 w-16 shrink-0 rounded-full border-[3px] border-ink object-cover" style={{ boxShadow: `0 0 0 3px ${accent}` }} />
      <div className="min-w-0">
        <h2 id={headingId} className="truncate font-[family-name:var(--font-display)] text-xl font-black leading-tight">
          {name}
        </h2>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge tone="banana">${ticker}</Badge>
          {legacy && <Badge tone="white">v1 · buy-only</Badge>}
        </div>
      </div>
    </div>
  );
}
