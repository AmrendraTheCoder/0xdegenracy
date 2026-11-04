import "server-only";
import { z } from "zod";

// Server-only secrets. Never import this from a client component.
const Env = z.object({
  // OpenAI-compatible endpoint. Point at your OmniRoute gateway (e.g. https://omniroute.yourhost.com/v1)
  // or any provider directly. If unset, /api/generate uses the offline heuristic generator.
  LLM_BASE_URL: z.string().url().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default("auto"),

  PLATFORM_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/)
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
