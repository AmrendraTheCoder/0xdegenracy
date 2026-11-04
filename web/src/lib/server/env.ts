import "server-only";
import { z } from "zod";

// Server-only secrets. Never import this from a client component.
const Env = z.object({
  // OpenAI-compatible endpoint. Local OmniRoute: http://localhost:20128/v1 (key from its dashboard).
  // If unset or unreachable, /api/generate uses the offline heuristic generator.
  LLM_BASE_URL: z.string().url().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default("auto"),
  // Local inference is slower than hosted APIs; total budget for both attempts.
  LLM_TIMEOUT_MS: z.coerce.number().int().min(2000).max(55000).default(25000),

  // Accepts the key with or without 0x (MetaMask exports it without), quotes or stray whitespace.
  PLATFORM_PRIVATE_KEY: z
    .string()
    .transform((v) => {
      const s = v.trim().replace(/^["']|["']$/g, "").trim();
      return /^[0-9a-fA-F]{64}$/.test(s) ? `0x${s}` : s;
    })
    .refine((v) => /^0x[0-9a-fA-F]{64}$/.test(v), (v) => ({
      // Never echo the value; length and prefix are enough to debug a paste mistake.
      message: `PLATFORM_PRIVATE_KEY must be 64 hex characters, optionally prefixed with 0x (got ${v.length} characters${v.startsWith("0x") ? ", starting with 0x" : ""}). Check web/.env for a typo, a truncated paste or an address pasted instead of the key.`,
    }))
    .optional(),
  RPC_URL: z.string().url().default("https://testnet-rpc.monad.xyz"),

  SUPABASE_URL: z.string().url().optional(),
  // Server-side key: Supabase's new `sb_secret_...` secret key, or a legacy service_role JWT.
  SUPABASE_SECRET_KEY: z.string().optional(),
  SUPABASE_BUCKET: z.string().default("game-images"),

  APP_URL: z.string().url().default("http://localhost:3000"),
  LAUNCHES_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
});

let cached: z.infer<typeof Env> | null = null;
export function env() {
  if (!cached) {
    // Treat empty strings from .env files as unset.
    const raw: Record<string, string | undefined> = Object.fromEntries(
      Object.entries(process.env).filter(([, v]) => v !== ""),
    );
    // Accept the names Supabase's dashboard and older docs use.
    raw.SUPABASE_URL ??= raw.NEXT_PUBLIC_SUPABASE_URL;
    raw.SUPABASE_SECRET_KEY ??= raw.SUPABASE_SECRET_ROLE_KEY ?? raw.SUPABASE_SERVICE_ROLE_KEY;
    cached = Env.parse(raw);
  }
  return cached;
}
