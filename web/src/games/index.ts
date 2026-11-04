import type { GameType } from "@/lib/game-config";
import type { GameFactory } from "./engine";
import type { IconName } from "@/components/ui/Icon";
import { flappy } from "./flappy";
import { runner } from "./runner";
import { dodge } from "./dodge";
import { whack } from "./whack";
import { snake } from "./snake";
import { breakout } from "./breakout";
import { shooter } from "./shooter";

export const GAMES: Record<GameType, GameFactory> = { flappy, runner, dodge, whack, snake, breakout, shooter };

/** An on-screen button: text label, optional icon, the key code it presses, and its keyboard hint. */
export type PadButton = { label: string; icon?: IconName; code: string; hint: string; wide?: boolean };

const LEFT: PadButton = { label: "Left", icon: "chevronLeft", code: "ArrowLeft", hint: "← / A" };
const RIGHT: PadButton = { label: "Right", icon: "chevronRight", code: "ArrowRight", hint: "→ / D" };
const UP: PadButton = { label: "Up", icon: "chevronUp", code: "ArrowUp", hint: "↑ / W" };
const DOWN: PadButton = { label: "Duck", icon: "chevronDown", code: "ArrowDown", hint: "↓ / S" };
const action = (label: string): PadButton => ({ label, code: "Space", hint: "Space", wide: true });

export type GameMeta = { label: string; short: string; controls: string; pad: PadButton[]; dpad?: boolean };

export const GAME_META: Record<GameType, GameMeta> = {
  flappy: { label: "Flappy", short: "Flappy", controls: "Tap, click, Space or ↑ to flap", pad: [action("Flap")] },
  runner: { label: "Endless Runner", short: "Runner", controls: "Tap, Space or ↑ to jump. ↓ to duck", pad: [DOWN, action("Jump")] },
  dodge: { label: "Dodge & Catch", short: "Dodge", controls: "Drag, ← → or A D to move", pad: [LEFT, RIGHT] },
  whack: { label: "Whack-a-Mole", short: "Whack", controls: "Tap the face when it pops up. Never the bombs", pad: [] },
  snake: { label: "Snake", short: "Snake", controls: "Swipe, arrow keys or WASD to turn", pad: [UP, LEFT, { ...DOWN, label: "Down" }, RIGHT], dpad: true },
  breakout: { label: "Brick Breaker", short: "Breakout", controls: "Drag, ← → or A D to move. Space to serve", pad: [LEFT, action("Serve"), RIGHT] },
  shooter: { label: "Space Shooter", short: "Shooter", controls: "Drag, ← → or A D to aim. Fires automatically", pad: [LEFT, RIGHT] },
};

export const COMMON_KEYS = [
  { key: "Space / Enter", what: "start · action" },
  { key: "P / Esc", what: "pause" },
  { key: "R", what: "restart" },
  { key: "M", what: "mute" },
];
