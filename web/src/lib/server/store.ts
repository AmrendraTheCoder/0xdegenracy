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

export interface GameStore {
  create(rec: Omit<GameRecord, "created_at">): Promise<void>;
  update(id: string, patch: Partial<GameRecord>): Promise<void>;
  get(id: string): Promise<GameRecord | null>;
  list(limit: number): Promise<GameRecord[]>;
  uploadImage(id: string, bytes: Uint8Array, contentType: string): Promise<string>;
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
  async uploadImage(id: string, bytes: Uint8Array, contentType: string) {
    const path = `${id}.${extFor(contentType)}`;
    const { error } = await this.db.storage
      .from(this.bucket)
      .upload(path, bytes, { contentType, upsert: false, cacheControl: "31536000" });
    if (error) throw new Error(`upload: ${error.message}`);
    return this.db.storage.from(this.bucket).getPublicUrl(path).data.publicUrl;
  }
}

// ---------------------------------------------------------------- Local JSON (dev only)
// Lets you run the whole flow without Supabase. Not for Vercel: its filesystem is read-only.

const DATA_DIR = join(process.cwd(), ".data");
const DB_FILE = join(DATA_DIR, "games.json");

class LocalStore implements GameStore {
  private async readAll(): Promise<GameRecord[]> {
    try {
      return JSON.parse(await readFile(DB_FILE, "utf8"));
    } catch {
      return [];
    }
  }
  private async writeAll(rows: GameRecord[]) {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(DB_FILE, JSON.stringify(rows, null, 2));
  }
  async create(rec: Omit<GameRecord, "created_at">) {
    const rows = await this.readAll();
    rows.push({ ...rec, created_at: new Date().toISOString() });
    await this.writeAll(rows);
  }
  async update(id: string, patch: Partial<GameRecord>) {
    const rows = await this.readAll();
    const i = rows.findIndex((r) => r.id === id);
    if (i >= 0) rows[i] = { ...rows[i], ...patch };
    await this.writeAll(rows);
  }
  async get(id: string) {
    return (await this.readAll()).find((r) => r.id === id) ?? null;
  }
  async list(limit: number) {
    return (await this.readAll())
      .filter((r) => r.status === "live")
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }
  async uploadImage(id: string, bytes: Uint8Array, contentType: string) {
    const name = `${id}.${extFor(contentType)}`;
    await mkdir(join(DATA_DIR, "images"), { recursive: true });
    await writeFile(join(DATA_DIR, "images", name), bytes);
    return `${env().APP_URL}/api/images/${name}`;
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
