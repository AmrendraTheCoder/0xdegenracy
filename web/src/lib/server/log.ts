import "server-only";
import { customAlphabet } from "nanoid";
import { getStore, type GameEvent } from "./store";

const rid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12);

/** Writes to the persistent event log. Never throws: logging must not break the request it describes. */
export async function logEvent(e: Omit<GameEvent, "created_at" | "id" | "level"> & { id?: string; level?: GameEvent["level"]; created_at?: string }) {
  try {
    await getStore().addEvent({ ...e, id: e.id ?? `${e.kind}:${rid()}`, level: e.level ?? "info" });
  } catch (err) {
    console.error("[log] could not persist event", e.kind, (err as Error).message);
  }
}

/** Persists an error with context so it shows in /activity and survives serverless restarts. */
export async function logError(where: string, err: unknown, ctx: { gameId?: string | null; token?: string | null; data?: Record<string, unknown> } = {}) {
  const message = `${where}: ${String((err as Error)?.message ?? err).split("\n")[0].slice(0, 300)}`;
  console.error("[error]", message);
  await logEvent({
    kind: "error",
    level: "error",
    game_id: ctx.gameId ?? null,
    token: ctx.token ?? null,
    tx_hash: null,
    actor: null,
    message,
    data: ctx.data ?? {},
  });
}
