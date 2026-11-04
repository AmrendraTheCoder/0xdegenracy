import type { GameType } from "@/lib/game-config";
import type { GameFactory } from "./engine";
import { flappy } from "./flappy";
import { runner } from "./runner";
import { dodge } from "./dodge";
import { whack } from "./whack";
import { snake } from "./snake";
import { breakout } from "./breakout";
import { shooter } from "./shooter";

export const GAMES: Record<GameType, GameFactory> = { flappy, runner, dodge, whack, snake, breakout, shooter };

/** An on-screen button: label, the key code it presses, and the keyboard hint shown on it. */
export type PadButton = { label: string; code: string; hint: string; wide?: boolean };

const LEFT: PadButton = { label: "◀", code: "ArrowLeft", hint: "← / A" };
const RIGHT: PadButton = { label: "▶", code: "ArrowRight", hint: "→ / D" };
const UP: PadButton = { label: "▲", code: "ArrowUp", hint: "↑ / W" };
const DOWN: PadButton = { label: "▼", code: "ArrowDown", hint: "↓ / S" };
const action = (label: string): PadButton => ({ label, code: "Space", hint: "Space", wide: true });

export const GAME_META: Record<GameType, { label: string; emoji: string; controls: string; pad: PadButton[]; dpad?: boolean }> = {
  flappy: { label: "Flappy", emoji: "🐦", controls: "Tap, click, Space or ↑ to flap", pad: [action("FLAP")] },
  runner: { label: "Endless Runner", emoji: "🏃", controls: "Tap / Space / ↑ to jump · ↓ to duck", pad: [DOWN, action("JUMP")] },
  dodge: { label: "Dodge & Catch", emoji: "🍕", controls: "Drag, ← → / A D, or tilt to move", pad: [LEFT, RIGHT] },
  whack: { label: "Whack-a-Mole", emoji: "🔨", controls: "Tap the face when it pops up. Never the bombs", pad: [] },
  snake: { label: "Snake", emoji: "🐍", controls: "Swipe or ← ↑ → ↓ / WASD to turn", pad: [UP, LEFT, DOWN, RIGHT], dpad: true },
  breakout: { label: "Brick Breaker", emoji: "🧱", controls: "Drag, ← → / A D, or tilt · Space to serve", pad: [LEFT, action("SERVE"), RIGHT] },
  shooter: { label: "Space Shooter", emoji: "🚀", controls: "Drag, ← → / A D, or tilt to aim · auto-fire", pad: [LEFT, RIGHT] },
};

export const COMMON_KEYS = [
  { key: "Space / Enter", what: "start · action" },
  { key: "P / Esc", what: "pause" },
  { key: "R", what: "restart" },
  { key: "M", what: "mute" },
];
