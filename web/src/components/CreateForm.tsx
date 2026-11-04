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
import { Button } from "./ui";
import { CustomGamePlayer } from "./CustomGamePlayer";

type Step = "idle" | "config" | "preview" | "token" | "publish";
const STEPS: { key: Exclude<Step, "idle" | "preview">; label: string }[] = [
  { key: "config", label: "Designing your game (custom games take up to a minute)" },
  { key: "token", label: "Launching token on Monad" },
  { key: "publish", label: "Publishing game" },
];

type Generated = { config: GameConfig; mode: "preset" | "custom"; note?: string };

const EXAMPLES = [
  "a monkey runs behind a banana chasing it",
  "my boss flaps through a sea of meetings",
  "catch falling pizzas, dodge the broccoli",
  "whack my roommate when he pops out of holes",
  "a snake that eats crypto candles",
  "smash the bricks of the bank",
  "shoot down alien rug pullers in space",
  "stack falling blocks into a tower without toppling",
  "a racing car switching lanes to avoid traffic",
];

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

export function CreateForm() {
  const router = useRouter();
  const { address } = useAccount();
  const [image, setImage] = useState<{ blob: Blob; previewUrl: string } | null>(null);
  const [prompt, setPrompt] = useState("");
  const [gameType, setGameType] = useState<GameType | "">("");
  const [ticker, setTicker] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  // A generated custom game waiting for the creator to play it and approve it.
  const [draft, setDraft] = useState<{ config: GameConfig; imageDataUrl: string; crashed: boolean } | null>(null);
  const { toast } = useToast();
  const configCache = useRef(new Map<string, Generated>());
  const busy = step !== "idle" && step !== "preview";

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

  const cacheKey = () => JSON.stringify([prompt.trim(), gameType, ticker]);

  /** Step 1: the AI designs the game, matching a preset or writing a custom one. */
  async function onCreate(regenerate = false) {
    if (!image || prompt.trim().length < 3) return;
    setError(null);
    setDraft(null);
    const key = cacheKey();
    if (regenerate) configCache.current.delete(key);
    const toastId = toast({ kind: "pending", title: "Designing your game", description: "The AI is matching your idea to a game…" });
    try {
      setStep("config");
      // Reuse the result of a failed launch with the same inputs, so a retry doesn't call the AI again.
      let gen = configCache.current.get(key);
      if (!gen) {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, gameType: gameType || undefined, ticker: ticker || undefined }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Could not generate game");
        gen = { config: json.config as GameConfig, mode: json.mode === "custom" ? "custom" : "preset", note: json.note };
        configCache.current.set(key, gen);
      }
      if (gen.note) toast({ kind: "info", title: "Using a preset game", description: gen.note });

      if (gen.mode === "custom") {
        // Let the creator play the AI's game before spending gas on it.
        setDraft({ config: gen.config, imageDataUrl: await blobToDataUrl(image.blob), crashed: false });
        setStep("preview");
        toast({ id: toastId, kind: "success", title: "The AI built a custom game", description: "Play the preview, then launch it." });
        return;
      }
      toast({ id: toastId, kind: "info", title: `Matched: ${GAME_META[gen.config.gameType].label}`, description: "Launching your coin…" });
      await launch(gen.config, toastId);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast({ id: toastId, kind: "error", title: "Couldn't create the game", description: msg });
      setStep("idle");
    }
  }

  /** Step 2: deploy the coin and publish the game (same for presets and approved custom games). */
  async function launch(config: GameConfig, existingToastId?: string) {
    if (!image) return;
    const toastId = existingToastId ?? toast({ kind: "pending", title: `Launching $${config.ticker}`, description: "Deploying your token on Monad…" });
    try {
      setStep("token");
      toast({ id: toastId, kind: "pending", title: `Launching $${config.ticker}`, description: "Deploying your token on Monad…" });
      const fd = new FormData();
      fd.append("image", image.blob, "hero");
      fd.append("config", JSON.stringify(config));
      fd.append("prompt", prompt);
      if (address) fd.append("creator", address);
      const res = await fetch("/api/launch", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        // Surface the server's reason (e.g. missing env var, RPC error) instead of a generic message.
        throw new Error([json.error ?? "Launch failed", json.detail].filter(Boolean).join(" — "));
      }
      setStep("publish");
      configCache.current.delete(cacheKey());
      toast({
        id: toastId,
        kind: "success",
        title: `$${json.ticker} is live on Monad`,
        description: `${json.tokenName} · block ${json.blockNumber}`,
        href: explorerTx(json.txHash),
      });
      router.push(`/game/${json.id}?new=1`);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast({ id: toastId, kind: "error", title: "Launch failed", description: msg });
      setStep(draft ? "preview" : "idle");
    }
  }

  function usePreset() {
    if (!draft) return;
    const { code: _c, codeSig: _s, ...rest } = draft.config;
    const preset: GameConfig = { ...rest, gameType: draft.config.fallbackType ?? "runner" };
    setDraft(null);
    void launch(preset);
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
                <option key={t} value={t}>{t === "custom" ? "AI writes a new game" : GAME_META[t].label}</option>
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
        onClick={() => onCreate(false)}
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
      {draft && step === "preview" && (
        <div className="mt-5 space-y-3" aria-label="Preview your AI-made game">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-extrabold">Try your AI-made game</h2>
            <p className="text-xs text-ink/60">
              It runs isolated from this page. If it&apos;s too janky, regenerate or use the {GAME_META[draft.config.fallbackType ?? "runner"].label} preset.
            </p>
          </div>
          <CustomGamePlayer config={draft.config} imageUrl={draft.imageDataUrl} preview onCrash={() => setDraft((d) => (d ? { ...d, crashed: true } : d))} />
          <div className="grid gap-2 sm:grid-cols-3">
            <Button variant="primary" size="lg" disabled={draft.crashed} onClick={() => launch(draft.config)}>
              Launch ${draft.config.ticker}
            </Button>
            <Button size="lg" onClick={() => onCreate(true)}>
              <Icon name="restart" size={18} /> Regenerate
            </Button>
            <Button variant="accent" size="lg" onClick={usePreset}>
              Use {GAME_META[draft.config.fallbackType ?? "runner"].short} instead
            </Button>
          </div>
        </div>
      )}
      {error && <p className="mt-3 rounded-lg border-2 border-hot bg-hot/10 p-2 text-sm font-bold text-hot">{error}</p>}
      {!address && <p className="mt-3 text-xs opacity-70">No wallet needed to create. Connect one to receive the 1% creator fee.</p>}
    </section>
  );
}
