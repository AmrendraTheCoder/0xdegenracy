// Shared between /api/coin/[id] and the coin page. MON amounts are wei as decimal strings; prices are
// wei per whole token; token amounts are whole tokens.

export const COIN_SUPPLY = 1_000_000_000;
export const COIN_BASE_PRICE = 100_000_000; // GameTokenFactory.BASE_PRICE

export type CoinTrade = {
  id: string;
  kind: "buy" | "sell";
  at: number; // ms
  actor: string;
  tokensWhole: string;
  value: string; // MON on the curve (cost for buys, gross proceeds for sells)
  fee: string;
  newPrice: string;
  txHash: string;
};

export type CoinHolder = {
  address: string;
  balanceWhole: string;
  pct: number; // of total supply
  value: string; // balance x spot price
  costBasis: string; // avg-cost basis of what is still held
  avgEntryPrice: string | null; // wei per whole token
  pnl: string | null; // value - costBasis + realized; null when we have no purchase record
  isCreator: boolean;
  tracked: boolean;
};

export type CoinData = {
  game: {
    id: string;
    title: string;
    ticker: string;
    tokenName: string;
    tagline: string;
    prompt: string;
    imageUrl: string;
    gameType: string;
    colors: { bg: string; fg: string; accent: string };
    createdAt: string;
    creator: string;
    launchTx: string | null;
    token: string;
  };
  chain: {
    price: string;
    sold: string;
    reserve: string | null; // null on v1 tokens
    pendingCreatorFees: string;
    prizePool: string | null; // null on v1 tokens (no sell, no prize pool)
    legacy: boolean;
  };
  trades: CoinTrade[]; // oldest first
  holders: CoinHolder[]; // largest first
  athPrice: string;
  updatedAt: string;
};
