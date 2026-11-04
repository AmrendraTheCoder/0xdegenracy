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

export const GAME_META: Record<GameType, { label: string; controls: string }> = {
  flappy: { label: "Flappy", controls: "Tap / click / space to flap" },
  runner: { label: "Endless Runner", controls: "Tap / space to jump · ↓ to duck" },
  dodge: { label: "Dodge & Catch", controls: "Drag, arrow keys or tilt to move" },
  whack: { label: "Whack-a-Mole", controls: "Tap the face. Never the bombs" },
  snake: { label: "Snake", controls: "Swipe or arrow keys to turn" },
  breakout: { label: "Brick Breaker", controls: "Drag, arrows or tilt to move the paddle" },
  shooter: { label: "Space Shooter", controls: "Drag, arrows or tilt to aim · auto-fire" },
};
