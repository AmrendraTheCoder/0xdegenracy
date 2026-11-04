"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAccount } from "wagmi";
import { GAME_TYPES, type GameConfig, type GameType } from "@/lib/game-config";
import { GAME_META } from "@/games";
import { prepareImage } from "@/lib/image";

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
    try {
      setStep("config");
      const gen = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, gameType: gameType || undefined, ticker: ticker || undefined }),
      });
      const genJson = await gen.json();
      if (!gen.ok) throw new Error(genJson.error ?? "Could not generate game");
      const config = genJson.config as GameConfig;

      setStep("token");
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
      router.push(`/game/${launchJson.id}?new=1`);
    } catch (e) {
      setError((e as Error).message);
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
        <ol className="mt-4 space-y-1 text-sm font-bold">
          {STEPS.map((s, i) => {
            const cur = STEPS.findIndex((x) => x.key === step);
            return (
              <li key={s.key} className={i <= cur ? "" : "opacity-40"}>
                {i < cur ? "✅" : i === cur ? "⏳" : "⬜"} {s.label}
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
