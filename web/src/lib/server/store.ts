import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "./env";
import type { GameConfig } from "../game-config";

export type GameStatus = "pending" | "live" | "failed";

export type GameRecord = {
  id: string;
  created_at: string;
  prompt: string;
  config: GameConfig;
  image_url: string;
  token_address: string | null;
  tx_hash: string | null;
  creator: string;
  status: GameStatus;
  error: string | null;
};

/** One row of the persistent activity / error log. Chain events use `${txHash}:${logIndex}` as id. */
export type EventKind = "launch" | "buy" | "sell" | "settle" | "error";
export type GameEvent = {
  id: string;
  created_at: string;
  kind: EventKind;
  level: "info" | "error";
  game_id: string | null;
  token: string | null;
  tx_hash: string | null;
  actor: string | null;
  message: string;
  data: Record<string, unknown>;
};

/** `actor` matches the trader/creator address case-insensitively. */
export type EventQuery = { gameId?: string; kinds?: EventKind[]; actor?: string; limit: number; ascending?: boolean };

export interface GameStore {
  create(rec: Omit<GameRecord, "created_at">): Promise<void>;
  update(id: string, patch: Partial<GameRecord>): Promise<void>;
  get(id: string): Promise<GameRecord | null>;
  getByToken(token: string): Promise<GameRecord | null>;
  list(limit: number): Promise<GameRecord[]>;
  /** Whether a live/pending game already uses this token name (case-insensitive) or ticker. */
  taken(tokenName: string, ticker: string): Promise<{ name: boolean; ticker: boolean }>;
  uploadImage(id: string, bytes: Uint8Array, contentType: string): Promise<string>;
  /** Idempotent: an event with an existing id is ignored. */
  addEvent(e: Omit<GameEvent, "created_at"> & { created_at?: string }): Promise<void>;
  listEvents(q: EventQuery): Promise<GameEvent[]>;
}

// ---------------------------------------------------------------- Supabase (production)

class SupabaseStore implements GameStore {
  private db: SupabaseClient;
  constructor(url: string, key: string, private bucket: string) {
    this.db = createClient(url, key, { auth: { persistSession: false } });
  }
  async create(rec: Omit<GameRecord, "created_at">) {
    const { error } = await this.db.from("games").insert(rec);
    if (error) throw new Error(`db insert: ${error.message}`);
  }
  async update(id: string, patch: Partial<GameRecord>) {
    const { error } = await this.db.from("games").update(patch).eq("id", id);
    if (error) throw new Error(`db update: ${error.message}`);
  }
  async get(id: string) {
    const { data, error } = await this.db.from("games").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`db get: ${error.message}`);
    return (data as GameRecord) ?? null;
  }
  async getByToken(token: string) {
    // Addresses have no LIKE wildcards, so ilike is an exact, case-insensitive match here.
    const { data, error } = await this.db.from("games").select("*").ilike("token_address", token).maybeSingle();
    if (error) throw new Error(`db getByToken: ${error.message}`);
    return (data as GameRecord) ?? null;
  }
  async list(limit: number) {
    const { data, error } = await this.db
      .from("games")
      .select("*")
      .eq("status", "live")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`db list: ${error.message}`);
    return (data as GameRecord[]) ?? [];
  }
  async taken(tokenName: string, ticker: string) {
    const escaped = tokenName.replace(/[%_\\]/g, (c) => `\\${c}`);
    const [byName, byTicker] = await Promise.all([
      this.db.from("games").select("id", { count: "exact", head: true }).neq("status", "failed").ilike("config->>tokenName", escaped),
      this.db.from("games").select("id", { count: "exact", head: true }).neq("status", "failed").eq("config->>ticker", ticker),
    ]);
    if (byName.error || byTicker.error) throw new Error(`db taken: ${(byName.error ?? byTicker.error)!.message}`);
    return { name: (byName.count ?? 0) > 0, ticker: (byTicker.count ?? 0) > 0 };
  }
  async uploadImage(id: string, bytes: Uint8Array, contentType: string) {
    const path = `${id}.${extFor(contentType)}`;
    const { error } = await this.db.storage
      .from(this.bucket)
      .upload(path, bytes, { contentType, upsert: false, cacheControl: "31536000" });
    if (error) throw new Error(`upload: ${error.message}`);
    return this.db.storage.from(this.bucket).getPublicUrl(path).data.publicUrl;
  }
  async addEvent(e: Omit<GameEvent, "created_at"> & { created_at?: string }) {
    const { error } = await this.db.from("events").upsert(e, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw new Error(`db event: ${error.message}`);
  }
  async listEvents(q: EventQuery) {
    let query = this.db.from("events").select("*");
    if (q.gameId) query = query.eq("game_id", q.gameId);
    if (q.kinds?.length) query = query.in("kind", q.kinds);
    // Addresses contain no LIKE wildcards, so ilike is an exact case-insensitive match.
    if (q.actor) query = query.ilike("actor", q.actor);
    const { data, error } = await query.order("created_at", { ascending: !!q.ascending }).limit(q.limit);
    if (error) throw new Error(`db events: ${error.message}`);
    return (data as GameEvent[]) ?? [];
  }
}

// ---------------------------------------------------------------- Local JSON (dev only)
// Lets you run the whole flow without Supabase. Not for Vercel: its filesystem is read-only.

const DATA_DIR = join(process.cwd(), ".data");
const DB_FILE = join(DATA_DIR, "games.json");
const EVENTS_FILE = join(DATA_DIR, "events.json");

async function readJson<T>(file: string): Promise<T[]> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return [];
  }
}
async function writeJson(file: string, rows: unknown[]) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(file, JSON.stringify(rows, null, 2));
}

class LocalStore implements GameStore {
  private readAll = () => readJson<GameRecord>(DB_FILE);
  async create(rec: Omit<GameRecord, "created_at">) {
    const rows = await this.readAll();
    rows.push({ ...rec, created_at: new Date().toISOString() });
    await writeJson(DB_FILE, rows);
  }
  async update(id: string, patch: Partial<GameRecord>) {
    const rows = await this.readAll();
    const i = rows.findIndex((r) => r.id === id);
    if (i >= 0) rows[i] = { ...rows[i], ...patch };
    await writeJson(DB_FILE, rows);
  }
  async get(id: string) {
    return (await this.readAll()).find((r) => r.id === id) ?? null;
  }
  async getByToken(token: string) {
    return (await this.readAll()).find((r) => r.token_address?.toLowerCase() === token.toLowerCase()) ?? null;
  }
  async list(limit: number) {
    return (await this.readAll())
      .filter((r) => r.status === "live")
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }
  async taken(tokenName: string, ticker: string) {
    const rows = (await this.readAll()).filter((r) => r.status !== "failed");
    return {
      name: rows.some((r) => r.config.tokenName.toLowerCase() === tokenName.toLowerCase()),
      ticker: rows.some((r) => r.config.ticker === ticker),
    };
  }
  async uploadImage(id: string, bytes: Uint8Array, contentType: string) {
    const name = `${id}.${extFor(contentType)}`;
    await mkdir(join(DATA_DIR, "images"), { recursive: true });
    await writeFile(join(DATA_DIR, "images", name), bytes);
    return `${env().APP_URL}/api/images/${name}`;
  }
  async addEvent(e: Omit<GameEvent, "created_at"> & { created_at?: string }) {
    const rows = await readJson<GameEvent>(EVENTS_FILE);
    if (rows.some((r) => r.id === e.id)) return;
    rows.push({ ...e, created_at: e.created_at ?? new Date().toISOString() });
    await writeJson(EVENTS_FILE, rows.slice(-5000));
  }
  async listEvents(q: EventQuery) {
    const rows = (await readJson<GameEvent>(EVENTS_FILE))
      .filter(
        (r) =>
          (!q.gameId || r.game_id === q.gameId) &&
          (!q.kinds?.length || q.kinds.includes(r.kind)) &&
          (!q.actor || r.actor?.toLowerCase() === q.actor.toLowerCase()),
      )
      .sort((a, b) => (q.ascending ? 1 : -1) * a.created_at.localeCompare(b.created_at));
    return rows.slice(0, q.limit);
  }
}

export const LOCAL_IMAGE_DIR = join(DATA_DIR, "images");

function extFor(type: string) {
  return type === "image/png" ? "png" : type === "image/jpeg" ? "jpg" : "webp";
}

let store: GameStore | null = null;
export function getStore(): GameStore {
  if (store) return store;
  const e = env();
  store =
    e.SUPABASE_URL && e.SUPABASE_SECRET_KEY
      ? new SupabaseStore(e.SUPABASE_URL, e.SUPABASE_SECRET_KEY, e.SUPABASE_BUCKET)
      : new LocalStore();
  return store;
}
