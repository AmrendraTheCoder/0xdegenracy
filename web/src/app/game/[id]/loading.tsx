import { Skeleton } from "@/components/ui";

/** Mirrors the game page layout so nothing jumps when it streams in. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading game">
      <div className="mb-5 space-y-2">
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-9 w-2/3 max-w-md" />
        <Skeleton className="h-4 w-1/2 max-w-sm" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="mx-auto w-full max-w-[400px] lg:col-start-1 lg:row-start-1">
          <Skeleton className="aspect-[2/3] w-full rounded-[14px]" />
          <Skeleton className="mt-3 h-14 w-full rounded-xl" />
        </div>
        <div className="brut space-y-4 bg-white p-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <div className="flex items-center gap-3">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-16 rounded-full" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
          <Skeleton className="h-4 w-full rounded-full" />
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-[14px] lg:col-start-1 lg:row-start-2" />
      </div>
      <span className="sr-only">Loading game…</span>
    </div>
  );
}
