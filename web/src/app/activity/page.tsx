import type { Metadata } from "next";
import Link from "next/link";
import { getStore, type EventKind, type GameEvent } from "@/lib/server/store";
import { explorerAddress, explorerTx } from "@/lib/chain";
import { short, timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Activity — Reachy" };
export const dynamic = "force-dynamic";

const TABS: { key: string; label: string; kinds?: EventKind[] }[] = [
  { key: "all", label: "All" },
  { key: "launch", label: "Launches", kinds: ["launch"] },
  { key: "trades", label: "Trades", kinds: ["buy", "sell"] },
  { key: "settle", label: "Payouts", kinds: ["settle"] },
  { key: "error", label: "Errors", kinds: ["error"] },
];

const BADGE: Record<EventKind, string> = {
  launch: "bg-banana",
  buy: "bg-mint",
  sell: "bg-hot text-white",
  settle: "bg-grape text-white",
  error: "bg-ink text-white",
};

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "all" } = await searchParams;
  const active = TABS.find((t) => t.key === tab) ?? TABS[0];
  let events: GameEvent[] = [];
  let loadError: string | null = null;
  try {
    events = await getStore().listEvents({ limit: 100, kinds: active.kinds });
  } catch (e) {
    loadError = (e as Error).message;
  }

  return (
    <div className="space-y-4">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black sm:text-4xl">Activity & proof</h1>
      <p className="text-sm">Every launch, trade and payout links to its Monad transaction. Errors are logged here too.</p>
      <nav className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link key={t.key} href={t.key === "all" ? "/activity" : `/activity?tab=${t.key}`} className={`brut-btn px-3 py-1 text-sm ${t.key === active.key ? "bg-ink text-white" : "bg-white"}`}>
            {t.label}
          </Link>
        ))}
      </nav>

      {loadError ? (
        <p className="brut bg-white p-4 text-sm">
          Could not load activity: {loadError}. If you just upgraded, run <code>supabase/migrations/002_events.sql</code>.
        </p>
      ) : events.length === 0 ? (
        <p className="brut bg-white p-4 text-sm">Nothing here yet.</p>
      ) : (
        <ul className="brut divide-y divide-ink/10 bg-white">
          {events.map((e) => (
            <li key={e.id} className={`flex flex-col gap-1 p-3 text-sm sm:flex-row sm:items-center sm:gap-3 ${e.level === "error" ? "bg-hot/5" : ""}`}>
              <span className={`w-fit rounded-md border-2 border-ink px-2 py-0.5 text-xs font-black uppercase ${BADGE[e.kind]}`}>{e.kind}</span>
              <span className="min-w-0 flex-1 break-words">
                {e.message}
                {e.game_id && (
                  <>
                    {" · "}
                    <Link className="underline" href={`/game/${e.game_id}`}>game</Link>
                  </>
                )}
              </span>
              <span className="flex flex-wrap gap-3 text-xs opacity-80">
                {e.actor && <a className="underline" href={explorerAddress(e.actor)} target="_blank" rel="noreferrer">{short(e.actor)}</a>}
                {e.tx_hash && <a className="font-bold underline" href={explorerTx(e.tx_hash)} target="_blank" rel="noreferrer">tx {short(e.tx_hash)} ↗</a>}
                {typeof e.data?.blockNumber === "string" && <span>block {e.data.blockNumber}</span>}
                <span title={e.created_at}>{timeAgo(e.created_at)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
