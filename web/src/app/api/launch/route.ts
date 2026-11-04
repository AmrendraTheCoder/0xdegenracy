import { NextResponse } from "next/server";
import { customAlphabet } from "nanoid";
import { isAddress, type Address } from "viem";
import { normalizeConfig } from "@/lib/game-config";
import { env } from "@/lib/server/env";
import { getStore } from "@/lib/server/store";
import { launchToken, platformAddress } from "@/lib/server/chain";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const newId = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 10);

// Magic-byte check so a renamed file can't pass as an image.
function sniff(b: Uint8Array): string | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return "image/webp";
  return null;
}

// POST /api/launch  multipart: image (File), config (JSON string), prompt, creator?  ->  { id, token, txHash }
export async function POST(req: Request) {
  const e = env();
  if (!e.LAUNCHES_ENABLED) return NextResponse.json({ error: "Launches are paused" }, { status: 503 });

  const rl = rateLimit(`launch:${clientIp(req)}`, 5, 10 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Slow down, degen. Try again soon." }, { status: 429, headers: { "Retry-After": `${rl.retryAfter}` } });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });

  const image = form.get("image");
  if (!(image instanceof File)) return NextResponse.json({ error: "Image is required" }, { status: 400 });
  if (image.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Image must be under 2 MB" }, { status: 413 });
  const bytes = new Uint8Array(await image.arrayBuffer());
  const type = sniff(bytes);
  if (!type || !IMAGE_TYPES.has(type)) return NextResponse.json({ error: "Use PNG, JPG or WebP" }, { status: 415 });

  let rawConfig: unknown = null;
  try {
    rawConfig = JSON.parse(String(form.get("config") ?? "null"));
  } catch {}
  const config = normalizeConfig(rawConfig);
  const prompt = String(form.get("prompt") ?? "").slice(0, 280);
  const creatorRaw = String(form.get("creator") ?? "");
  const creator: Address | null = isAddress(creatorRaw) ? creatorRaw : null;

  const store = getStore();
  const id = newId();
  try {
    const imageUrl = await store.uploadImage(id, bytes, type);
    await store.create({
      id,
      prompt,
      config,
      image_url: imageUrl,
      token_address: null,
      tx_hash: null,
      creator: creator ?? platformAddress() ?? "unknown",
      status: "pending",
      error: null,
    });

    const { token, txHash } = await launchToken({
      name: config.tokenName,
      symbol: config.ticker,
      imageURI: imageUrl,
      configURI: `${e.APP_URL}/api/games/${id}`,
      creator,
    });
    await store.update(id, { token_address: token, tx_hash: txHash, status: "live" });
    return NextResponse.json({ id, token, txHash });
  } catch (err) {
    const message = (err as Error).message?.slice(0, 300) ?? "launch failed";
    console.error("[launch]", id, message);
    await store.update(id, { status: "failed", error: message }).catch(() => {});
    return NextResponse.json({ error: "Token launch failed. Try again.", detail: message }, { status: 502 });
  }
}
