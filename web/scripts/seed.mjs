// Seeds the feed by running the real create flow against a deployed site.
// Usage: SEED_URL=https://your-app.vercel.app node scripts/seed.mjs ./face1.png ./face2.png ./face3.png
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const BASE = process.env.SEED_URL || "http://localhost:3000";
const IDEAS = [
  { prompt: "a monkey runs behind a banana chasing it", gameType: "runner" },
  { prompt: "a degen flaps between red candles", gameType: "flappy" },
  { prompt: "catch falling MON coins, dodge the rugs", gameType: "dodge" },
];
const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Pass 1-3 image paths (square PNG/JPG/WebP, <2MB).");
  process.exit(1);
}

for (let i = 0; i < files.length && i < IDEAS.length; i++) {
  const idea = IDEAS[i];
  const gen = await fetch(`${BASE}/api/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(idea) }).then((r) => r.json());
  const type = files[i].endsWith(".png") ? "image/png" : files[i].endsWith(".webp") ? "image/webp" : "image/jpeg";
  const fd = new FormData();
  fd.append("image", new Blob([readFileSync(files[i])], { type }), basename(files[i]));
  fd.append("config", JSON.stringify(gen.config));
  fd.append("prompt", idea.prompt);
  const res = await fetch(`${BASE}/api/launch`, { method: "POST", body: fd });
  const json = await res.json();
  console.log(res.ok ? `✅ ${BASE}/game/${json.id}  token ${json.token}` : `❌ ${JSON.stringify(json)}`);
}
