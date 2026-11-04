import { NextResponse } from "next/server";
import { customAlphabet } from "nanoid";
import { isAddress, type Address } from "viem";
import { normalizeConfig, type GameConfig } from "@/lib/game-config";
import { env } from "@/lib/server/env";
import { getStore, type GameStore } from "@/lib/server/store";
import { launchToken, platformAddress } from "@/lib/server/chain";
import { verifyGameCode } from "@/lib/server/codegen";
import { logError, logEvent } from "@/lib/server/log";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";
import { FACTORY_ADDRESS } from "@/lib/chain";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const newId = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 10);
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const NAME_SUFFIXES = ["Inu", "Classic", "Supreme", "Max", "Reloaded", "Gold", "Army", "Turbo", "Prime", "Ultra"];

// Magic-byte check so a renamed file can't pass as an image.
function sniff(b: Uint8Array): string | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return "image/webp";
  return null;
}

/** Every coin gets its own name and ticker: tweak them until neither collides with an existing game. */
async function makeUnique(store: GameStore, cfg: GameConfig): Promise<GameConfig> {
  let { tokenName, ticker } = cfg;
  for (let i = 0; i < 8; i++) {
    const t = await store.taken(tokenName, ticker);
    if (!t.name && !t.ticker) return { ...cfg, tokenName, ticker };
    if (t.name) {
      const base = cfg.tokenName.slice(0, 38);
      tokenName = i < 5 ? `${base} ${NAME_SUFFIXES[Math.floor(Math.random() * NAME_SUFFIXES.length)]}` : `${base} ${i + 1}`;
    }
    if (t.ticker) {
      const rand = () => LETTERS[Math.floor(Math.random() * LETTERS.length)];
      ticker = (cfg.ticker.slice(0, Math.min(4, cfg.ticker.length)) + rand() + rand()).slice(0, 6);
    }
  }
  return { ...cfg, tokenName: `${cfg.tokenName.slice(0, 40)} ${newId().slice(0, 4)}`, ticker };
}

// POST /api/launch  multipart: image (File), config (JSON string), prompt, creator?  ->  { id, token, txHash, ... }
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
  const prompt = String(form.get("prompt") ?? "").slice(0, 280);
  const creatorRaw = String(form.get("creator") ?? "");
  const creator: Address | null = isAddress(creatorRaw) ? creatorRaw : null;

  // Custom games must carry code signed by our generator. Without this, anyone could skip the AI and
  // launch arbitrary code by calling this endpoint directly. (It would still be sandboxed, but it
  // would no longer be an AI-made, checked game.)
  const normalized = normalizeConfig(rawConfig);
  if (normalized.gameType === "custom" && !(normalized.code && verifyGameCode(normalized.code, normalized.codeSig))) {
    return NextResponse.json({ error: "This custom game wasn't produced by the generator. Generate it again." }, { status: 400 });
  }
  const { codeSig: _sig, ...toStore } = normalized; // the signature has done its job; don't persist it

  const store = getStore();
  const id = newId();
  let stage = "validate";
  try {
    stage = "unique-name";
    const config = await makeUnique(store, toStore);
    stage = "upload-image";
    const imageUrl = await store.uploadImage(id, bytes, type);
    stage = "save-game";
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

    stage = "launch-token";
    const launched = await launchToken({
      name: config.tokenName,
      symbol: config.ticker,
      imageURI: imageUrl,
      configURI: `${e.APP_URL}/api/games/${id}`,
      creator,
    });
    stage = "mark-live";
    await store.update(id, { token_address: launched.token, tx_hash: launched.txHash, status: "live" });
    await logEvent({
      id: `${launched.txHash}:launch`,
      kind: "launch",
      game_id: id,
      token: launched.token,
      tx_hash: launched.txHash,
      actor: creator ?? platformAddress(),
      message: `Launched $${config.ticker} (${config.tokenName})`,
      data: {
        blockNumber: launched.blockNumber.toString(),
        gasUsed: launched.gasUsed.toString(),
        factory: FACTORY_ADDRESS,
        title: config.title,
        ticker: config.ticker,
        gameType: config.gameType,
      },
    });
    return NextResponse.json({
      id,
      token: launched.token,
      txHash: launched.txHash,
      blockNumber: launched.blockNumber.toString(),
      tokenName: config.tokenName,
      ticker: config.ticker,
    });
  } catch (err) {
    const message = (err as Error).message?.split("\n")[0].slice(0, 300) ?? "launch failed";
    await logError(`launch/${stage}`, err, { gameId: id, data: { stage } });
    await store.update(id, { status: "failed", error: message }).catch(() => {});
    return NextResponse.json({ error: "Token launch failed. Try again.", detail: message, stage }, { status: 502 });
  }
}
