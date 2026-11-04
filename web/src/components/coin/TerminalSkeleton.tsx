import { Loader, Skeleton } from "@/components/ui";

/** Placeholder for the full-screen game/coin terminal: header strip, then game half and trade half. */
export function TerminalSkeleton({ label }: { label: string }) {
  return (
    <div className="terminal-bleed -mt-6 flex flex-col gap-3 px-3 pb-24 pt-3 sm:-mt-8 lg:h-[calc(100dvh-var(--site-header-h))] lg:pb-3">
      <div className="brut flex shrink-0 items-center gap-3 bg-white p-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-24 rounded-full" />
        </div>
        <Skeleton className="hidden h-10 w-28 rounded-xl sm:block" />
      </div>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
        <div className="brut grid min-h-[60dvh] place-items-center bg-white lg:min-h-0">
          <Loader label={label} />
        </div>
        <div className="hidden min-h-0 gap-3 lg:grid lg:grid-rows-[auto_1fr]">
          <div className="brut space-y-3 bg-white p-4">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
          <div className="brut bg-white p-4">
            <Skeleton className="h-full min-h-40 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
