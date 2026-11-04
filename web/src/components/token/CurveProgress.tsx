import { ProgressBar, Skeleton } from "@/components/ui";

export function CurveProgress({ progress, loading, soldOut }: { progress: number; loading?: boolean; soldOut?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-bold">
        <span>Bonding curve</span>
        {loading ? <Skeleton className="h-3 w-10" /> : <span>{soldOut ? "Sold out" : `${progress}% sold`}</span>}
      </div>
      {loading ? <Skeleton className="h-4 w-full rounded-full" /> : <ProgressBar value={progress} label="Bonding curve progress" valueText={`${progress}% of tokens sold`} />}
    </div>
  );
}
