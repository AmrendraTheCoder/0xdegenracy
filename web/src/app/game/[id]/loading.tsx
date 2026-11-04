import { TerminalSkeleton } from "@/components/coin/TerminalSkeleton";

/** Mirrors the game terminal so nothing jumps when it streams in. */
export default function Loading() {
  return <TerminalSkeleton label="Loading game" />;
}
