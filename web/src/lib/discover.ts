import type { GameType } from "./game-config";

// Shared between /api/discover and the Discover page. All MON amounts are wei as decimal strings
// (JSON has no bigint); prices are wei per whole token.

export const WINDOWS = ["1h", "4h", "12h", "24h"] as const;
export type DiscoverWindow = (typeof WINDOWS)[number];
export const WINDOW_MS: Record<DiscoverWindow, number> = { "1h": 3_600_000, "4h": 14_400_000, "12h": 43_200_000, "24h": 86_400_000 };

export type DiscoverCoin = {
  gameId: string;
  title: string;
  ticker: string;
  tokenName: string;
  imageUrl: string;
  gameType: GameType;
  token: string;
  createdAt: string;
  /** Current price (wei per whole token). */
  price: string;
  /** Market cap at the current price for the full 1B supply (wei). */
  marketCap: string;
  /** Whole tokens sold on the curve, and the same as a % of supply. */
  sold: string;
  curvePct: number;
  /** Price change over the window, in %. Null when there is no price to compare against. */
  change: number | null;
  /** MON traded in the window (wei) and number of trades. */
  volume: string;
  trades: number;
  hot: boolean;
  isNew: boolean;
};

export type DiscoverEvent = {
  id: string;
  kind: "launch" | "buy" | "sell" | "settle";
  createdAt: string;
  actor: string | null;
  txHash: string | null;
  message: string;
  /** MON value of a trade (wei). */
  value: string | null;
  tokensWhole: string | null;
  game: { id: string; title: string; ticker: string; imageUrl: string; accent: string } | null;
};

export type DiscoverTrader = { address: string; volume: string; trades: number; buys: number; sells: number; lastAt: string };
export type DiscoverCreator = { address: string; coins: number; earned: string; volume: string; topCoin: { gameId: string; ticker: string; imageUrl: string } | null };

export type DiscoverResponse = {
  window: DiscoverWindow;
  updatedAt: string;
  coins: DiscoverCoin[];
  feed: DiscoverEvent[];
  traders: DiscoverTrader[];
  creators: DiscoverCreator[];
  totals: { coins: number; volume: string; trades: number; traders: number };
};
