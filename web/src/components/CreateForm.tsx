"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useAccount } from "wagmi";
import { GAME_TYPES, type GameConfig, type GameType } from "@/lib/game-config";
import { GAME_META } from "@/games";
import { prepareImage } from "@/lib/image";
import { explorerTx } from "@/lib/chain";
import { useToast } from "./Toaster";
import { Icon } from "./ui/Icon";

type Step = "idle" | "config" | "token" | "publish";
const STEPS: { key: Exclude<Step, "idle">; label: string }[] = [
  { key: "config", label: "Generating game config" },
  { key: "token", label: "Launching token on Monad" },
  { key: "publish", label: "Publishing game" },
];

const EXAMPLES = [
  "a monkey runs behind a banana chasing it",
  "my boss flaps through a sea of meetings",
  "catch falling pizzas, dodge the broccoli",
  "whack my roommate when he pops out of holes",
  "a snake that eats crypto candles",
  "smash the bricks of the bank",
  "shoot down alien rug pullers in space",
];

export function CreateForm() {
  const router = useRouter();
  const { address } = useAccount();
  const [image, setImage] = useState<{ blob: Blob; previewUrl: string } | null>(null);
  const [prompt, setPrompt] = useState("");
  const [gameType, setGameType] = useState<GameType | "">("");
  const [ticker, setTicker] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const configCache = useRef(new Map<string, GameConfig>());
  const busy = step !== "idle";

  async function onFile(f: File | undefined) {
    setError(null);
    if (!f) return;
    try {
      if (image) URL.revokeObjectURL(image.previewUrl);
      setImage(await prepareImage(f));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function onCreate() {
    if (!image || prompt.trim().length < 3) return;
    setError(null);
    const toastId = toast({ kind: "pending", title: "Creating your game", description: "Generating config…" });
    try {
      setStep("config");
      // Reuse the config from a failed attempt with the same inputs, so a retry doesn't call the LLM again.
      const cacheKey = JSON.stringify([prompt.trim(), gameType, ticker]);
      let config = configCache.current.get(cacheKey);
      if (!config) {
        const gen = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, gameType: gameType || undefined, ticker: ticker || undefined }),
        });
        const genJson = await gen.json();
        if (!gen.ok) throw new Error(genJson.error ?? "Could not generate game");
        config = genJson.config as GameConfig;
        configCache.current.set(cacheKey, config);
      }

      setStep("token");
      toast({ id: toastId, kind: "pending", title: `Launching $${config.ticker}`, description: "Deploying your token on Monad…" });
      const fd = new FormData();
      fd.append("image", image.blob, "hero");
      fd.append("config", JSON.stringify(config));
      fd.append("prompt", prompt);
      if (address) fd.append("creator", address);
      const launch = await fetch("/api/launch", { method: "POST", body: fd });
      const launchJson = await launch.json();
      if (!launch.ok) {
        // Surface the server's reason (e.g. missing env var, RPC error) instead of a generic message.
        throw new Error([launchJson.error ?? "Launch failed", launchJson.detail].filter(Boolean).join(" — "));
      }

      setStep("publish");
      configCache.current.delete(cacheKey);
      toast({
        id: toastId,
        kind: "success",
        title: `$${launchJson.ticker} is live on Monad`,
        description: `${launchJson.tokenName} · block ${launchJson.blockNumber}`,
        href: explorerTx(launchJson.txHash),
      });
      router.push(`/game/${launchJson.id}?new=1`);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast({ id: toastId, kind: "error", title: "Launch failed", description: msg });
      setStep("idle");
    }
  }

  return (
    <section className="brut bg-white p-4 sm:p-6">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black leading-none sm:text-5xl">
        Every coin ships with a game.
      </h1>
      <p className="mt-2 text-sm sm:text-base">Upload a face, type a dumb idea, get a playable game + a memecoin on Monad.</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-[160px_1fr]">
        <label className="brut flex aspect-square cursor-pointer items-center justify-center overflow-hidden bg-mint text-center text-sm font-bold">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image.previewUrl} alt="Hero preview" className="h-full w-full rounded-full object-cover p-2" />
          ) : (
            <span className="p-3">Tap to upload a face<br />PNG · JPG · WebP</span>
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            disabled={busy}
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>

        <div className="flex flex-col gap-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value.slice(0, 280))}
            disabled={busy}
            rows={3}
            placeholder={EXAMPLES[0]}
            className="brut w-full resize-none bg-paper p-3 text-base outline-none"
          />
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" disabled={busy} onClick={() => setPrompt(ex)} className="rounded-full border-2 border-ink px-2 py-0.5 text-xs">
                {ex}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <select
              value={gameType}
              disabled={busy}
              onChange={(e) => setGameType(e.target.value as GameType | "")}
              className="brut bg-white px-3 py-2 text-sm font-bold"
            >
              <option value="">Game: AI picks</option>
              {GAME_TYPES.map((t) => (
                <option key={t} value={t}>{GAME_META[t].label}</option>
              ))}
            </select>
            <input
              value={ticker}
              disabled={busy}
              onChange={(e) => setTicker(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6))}
              placeholder="$TICKER (optional)"
              className="brut w-44 bg-white px-3 py-2 text-sm font-bold uppercase outline-none"
            />
          </div>
        </div>
      </div>

      <button
        onClick={onCreate}
        disabled={busy || !image || prompt.trim().length < 3}
        className="brut-btn mt-5 w-full bg-hot py-4 text-2xl text-white"
      >
        {busy ? "Cooking…" : "CREATE"}
      </button>

      {busy && (
        <ol className="mt-4 space-y-1.5 text-sm font-bold" aria-live="polite">
          {STEPS.map((s, i) => {
            const cur = STEPS.findIndex((x) => x.key === step);
            return (
              <li key={s.key} className={i <= cur ? "flex items-center gap-2" : "flex items-center gap-2 opacity-40"}>
                {i < cur ? (
                  <Icon name="circleCheck" size={18} className="text-up" />
                ) : i === cur ? (
                  <span aria-hidden className="inline-block h-[18px] w-[18px] animate-spin rounded-full border-[3px] border-ink border-r-transparent motion-reduce:animate-none" />
                ) : (
                  <Icon name="circle" size={18} />
                )}
                <span>{s.label}</span>
                <span className="sr-only">{i < cur ? "(done)" : i === cur ? "(in progress)" : "(pending)"}</span>
              </li>
            );
          })}
        </ol>
      )}
      {error && <p className="mt-3 rounded-lg border-2 border-hot bg-hot/10 p-2 text-sm font-bold text-hot">{error}</p>}
      {!address && <p className="mt-3 text-xs opacity-70">No wallet needed to create. Connect one to receive the 1% creator fee.</p>}
    </section>
  );
}
