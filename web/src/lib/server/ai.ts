import "server-only";
import { env } from "./env";

/**
 * Which AI endpoint the app talks to. Both options speak the OpenAI chat-completions protocol:
 *  - Gemini (default): GEMINI_API_KEY, or a Google-format key (AIza…) in LLM_API_KEY with no LLM_BASE_URL.
 *    Uses Gemini's OpenAI-compatible endpoint and GEMINI_MODEL (default gemini-2.5-flash).
 *  - Any other OpenAI-compatible endpoint: LLM_BASE_URL (+ LLM_API_KEY, LLM_MODEL).
 * Returns null when nothing is configured; callers then use their offline fallback.
 */
export type AiEndpoint = { provider: "gemini" | "openai-compatible"; baseUrl: string; apiKey?: string; model: string };

export function aiEndpoint(): AiEndpoint | null {
  const e = env();
  const googleKey = e.GEMINI_API_KEY ?? (!e.LLM_BASE_URL && e.LLM_API_KEY?.startsWith("AIza") ? e.LLM_API_KEY : undefined);
  if (googleKey) {
    // LLM_MODEL defaults to "auto" for gateways; only honour it here if it names a Gemini model.
    const model = process.env.GEMINI_MODEL || (e.LLM_MODEL?.startsWith("gemini") ? e.LLM_MODEL : e.GEMINI_MODEL);
    return { provider: "gemini", baseUrl: e.GEMINI_BASE_URL, apiKey: googleKey, model };
  }
  if (e.LLM_BASE_URL) return { provider: "openai-compatible", baseUrl: e.LLM_BASE_URL, apiKey: e.LLM_API_KEY, model: e.LLM_MODEL };
  return null;
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/**
 * One chat-completions call. `maxTokens` must leave room for Gemini 2.5's thinking tokens, which count
 * against the same limit, or long answers (game code) get cut off.
 */
export function aiChat(
  ep: AiEndpoint,
  messages: ChatMessage[],
  opts: { maxTokens: number; temperature: number; jsonMode?: boolean; deadline: number },
): Promise<Response> {
  return fetch(`${ep.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(Math.max(1000, opts.deadline - Date.now())),
    headers: { "Content-Type": "application/json", ...(ep.apiKey ? { Authorization: `Bearer ${ep.apiKey}` } : {}) },
    body: JSON.stringify({
      model: ep.model,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      stream: false,
      ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
      messages,
    }),
  });
}

/** Text of the first choice, with any <think>…</think> preamble removed. */
export async function aiText(res: Response): Promise<string> {
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`AI ${res.status}${detail ? `: ${detail.slice(0, 160)}` : ""}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return (data.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/gi, "");
}
