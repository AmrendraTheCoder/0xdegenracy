# Reachy: architecture, review and optimizations

> Upload a face, type a game idea, get a playable meme game plus a memecoin with that face on it,
> live on Monad testnet in under a minute. *pump.fun, but every coin ships with a game.*

This doc follows the four-role process: **Architect** (design) → **Engineer** (what was built) →
**Reviewer** (what was wrong and fixed) → **Optimizer** (what was tuned, and what's next).

---

## 1. Architect

### Core loop (the only thing that matters)

```
image + prompt ──► /api/generate ──► GameConfig (JSON only, validated)
                                         │
                       /api/launch ◄─────┘   (multipart: image, config, creator?)
                         │  1. sniff + store image (Supabase Storage)
                         │  2. insert games row (status=pending)
                         │  3. platform wallet → GameTokenFactory.launch()  [eth_sendRawTransactionSync]
                         │  4. parse GameLaunched → token address, status=live
                         ▼
                    /game/[id]  ── canvas game (no wallet) + token card + Buy (user's wallet)
```

### System diagram

```
┌────────────── Browser ──────────────┐        ┌──────── Vercel (Next.js 15) ────────┐
│ CreateForm: crop→256² WebP          │  HTTP  │ /api/generate → OmniRoute (OpenAI-  │
│ GamePlayer: shared canvas engine    │ ─────► │                 compatible) or      │
│ TokenPanel: wagmi reads + buy()     │        │                 offline heuristic   │
└───────┬─────────────────────────────┘        │ /api/launch  → Supabase + viem      │
        │ JSON-RPC (reads, buy tx)             │ /api/games[/id] → Supabase          │
        ▼                                      └──────┬───────────────┬──────────────┘
┌──────────── Monad testnet (10143) ───────────┐      │ service key   │ PLATFORM_PRIVATE_KEY
│ GameTokenFactory ──new──► GameToken (ERC-20) │ ◄────┘               ▼
│   launch(), tokens[], GameLaunched           │             ┌─────────────────┐
│ GameToken: buy(minOut) linear curve, 1% fee  │             │ Supabase        │
└──────────────────────────────────────────────┘             │ games + bucket  │
                                                             └─────────────────┘
```

### On-chain vs off-chain (per MONSKILLS `scaffold`)

| On-chain | Off-chain |
|---|---|
| Token ownership, supply, buys, creator fee, launch registry | Game config, prompt, image bytes, feed ordering, rate limits |

`imageURI` and `configURI` are stored on the token, so a third-party indexer can rebuild the feed
without our database.

### Key decisions

| Decision | Why |
|---|---|
| LLM returns **only JSON**, never code | Generation can't break the page. `normalizeConfig` clamps and defaults every field. |
| **OmniRoute** as the LLM gateway, running locally | It exposes an OpenAI-compatible `/v1/chat/completions` on `localhost:20128`, so the app speaks one protocol and you swap models or providers (including local Ollama) in OmniRoute, not in code. The client retries without JSON mode for local models that reject it, removes `<think>` blocks, and has a 25 s budget. Production reaches it through an HTTPS tunnel. |
| **Offline heuristic fallback** | Demo never blocks on an LLM outage, a missing key or a timeout (12 s). |
| Platform wallet signs launches | Creator needs no wallet (doc §8.2). The creator address gets the fee if one is connected. |
| `eth_sendRawTransactionSync` server-side | Monad returns the receipt in one RPC call (~300 ms blocks), so no polling. |
| Explicit gas limit = estimate + 10% | **Monad charges on gas limit, not gas used** (MONSKILLS `gas`). Wallet guesses would overcharge. |
| Storage adapter (Supabase / local JSON) | Run the full flow locally with zero accounts; production uses Supabase. |
| One canvas engine, three 80-line games | Shared loop/input/HUD/shake; each game is a factory reading the same config. |
| Injected wallet only (MetaMask, Rabby, Phantom EVM…) | Smallest dependency surface. Para (MONSKILLS `wallet-integration`) is a drop-in upgrade later. |

### File structure

```
reachy/
├── .monskills                     built-with=monskills, chain=monad-testnet
├── contracts/                     Foundry (solc 0.8.28, via-IR, OZ v5.4.0)
│   ├── src/GameToken.sol          ERC-20 + linear-curve buy(), 1% creator fee, no mint/sell
│   ├── src/GameTokenFactory.sol   launch(), registry, GameLaunched event, pagination
│   ├── test/GameToken.t.sol       10 tests incl. fuzz (cost never exceeds budget)
│   └── script/Deploy.s.sol
├── supabase/schema.sql            games table + RLS + public image bucket
├── docs/ARCHITECTURE.md           this file
└── web/                           Next.js 15 App Router, Tailwind v4, wagmi 2, viem 2
    ├── scripts/export-abi.mjs     contracts/out → src/lib/abi.ts
    ├── scripts/seed.mjs           seeds 1–3 games against any deployed URL
    └── src/
        ├── app/
        │   ├── page.tsx                 create form + live feed
        │   ├── game/[id]/page.tsx       game + token panel, OG tags
        │   └── api/{generate,launch,games,games/[id],images/[name]}/route.ts
        ├── components/  CreateForm, GamePlayer, TokenPanel, GameCard, ConnectButton
        ├── games/       engine.ts, flappy.ts, runner.ts, dodge.ts, index.ts
        └── lib/
            ├── chain.ts         ONE network config file (chain id, RPC, explorers)
            ├── game-config.ts   LLM contract: types, normalizeConfig, clamps
            ├── image.ts         client crop/resize/EXIF strip
            ├── abi.ts           generated
            └── server/          env, llm, store, chain (launch), rate-limit  [server-only]
```

### Database schema (`supabase/schema.sql`)

| column | type | notes |
|---|---|---|
| id | text PK | 10-char slug, unambiguous alphabet |
| created_at | timestamptz | default now() |
| prompt | text | original prompt |
| config | jsonb | validated GameConfig |
| image_url | text | public Supabase Storage URL (also the token logo) |
| token_address | text unique | set after launch |
| tx_hash | text | launch tx |
| creator | text | connected wallet or platform wallet |
| status | text | `pending` \| `live` \| `failed` (added, so failed launches never show) |
| error | text | server-side only, stripped from API responses |

Index: `(status, created_at desc)` for the feed. RLS on with no policies, so only the server's
service-role key can touch it.

### API

| Method | Path | Body / query | Returns |
|---|---|---|---|
| POST | `/api/generate` | `{prompt, gameType?, ticker?}` | `{config, source: "llm"\|"fallback"}`; 20 per 10 min per IP |
| POST | `/api/launch` | multipart `image`, `config`, `prompt`, `creator?` | `{id, token, txHash}`; 5 per 10 min per IP, `maxDuration=60` |
| GET | `/api/games` | `?limit=24` | `{games}`, live only, newest first, edge-cached 5 s |
| GET | `/api/games/:id` | — | game record (this is the token's on-chain `configURI`) |
| GET | `/api/images/:name` | — | dev-only local image serving |

### Contracts

`GameToken` mints 1B tokens to itself. Price per whole token is `P0 + K·sold`, with
`P0 = 1e8 wei` and `K = 1 wei`. `buy(minTokensOut)` solves the quadratic for the maximum whole tokens
the budget affords, refunds the remainder, and pushes the 1% fee to the creator. If the push fails,
the fee accrues to `pendingCreatorFees` so buys never revert. The whole curve raises about 0.6 MON,
and 0.01 MON buys about 72.6M tokens. `launch()` costs about 1.1M gas.

---

## 2. Engineer: what is built and verified

- `forge test`: 10/10 pass, including a 256-run fuzz test that cost + fee never exceeds `msg.value`
  and that the token count is maximal.
- `next build`: passes. First-load JS is 128 kB on `/` and 176 kB on `/game/[id]`.
- **End-to-end on a local Anvil chain with chain ID 10143**: generate → launch → token deployed with
  the correct symbol and imageURI → feed → game page → on-chain price and quote shown (0.01 MON ≈
  72.63M tokens, matching the math). A fake `.png` was rejected by the magic-byte check. All three
  game types rendered without console errors on desktop and at a 375 px mobile width.
- **Not yet verified:** a real wallet buy from the UI (covered by contract tests, not clicked through
  in a browser), gameplay feel at full frame rate (the test browser was throttled to 2 fps), the real
  LLM path through OmniRoute, Supabase, and Monad testnet itself.

## 3. Reviewer: issues found and fixed during the build

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | High | `BASE_PRICE = 1e10` made the full curve cost ~10.5 MON, not the ~0.5 the comment claimed | Set to `1e8` and documented the arithmetic |
| 2 | High | Fee taken on the whole `msg.value`, including the refunded part | `quote()` recomputes the fee on what was actually spent |
| 3 | High | A creator that can't receive MON would brick all buys | Push the fee, fall back to `pendingCreatorFees` and `claimCreatorFees()` |
| 4 | Med | No slippage protection | `buy(minTokensOut)`, and the UI passes 95% of the quote |
| 5 | Med | Renamed non-images accepted | Magic-byte sniffing for PNG, JPEG and WebP |
| 6 | Med | Platform wallet can be drained by scripted launches | Per-IP limit plus a `LAUNCHES_ENABLED` kill switch (see Optimizer for the global limit) |
| 7 | Med | Failed launches would appear in the feed | `status` column; the feed and page show only `live` |
| 8 | Med | `wagmi/connectors` barrel broke the build (pulled in Coinbase/x402 SDKs) | Import `injected` from the `wagmi` root |
| 9 | Low | Flappy spawned a pipe every frame; runner kept duck state through a type-cast hack | Rewrote the spawn condition; duck is plain local state |
| 10 | Low | Long titles overflowed the canvas overlay | Size the text with `measureText` |
| 11 | Low | Phone photos carry EXIF/GPS | Client re-encode to 256² WebP strips metadata |
| 12 | Low | viem's built-in Monad testnet explorer URL is outdated | Own `defineChain` with MonadVision and Monadscan from docs.monad.xyz |

Known and accepted for the MVP: the in-memory rate limit is per instance, there is no sell function
(state this in the pitch), and MON raised by the curve stays locked in the token. That last point is
honest for testnet and is where bonding-curve graduation goes later.

## 4. Optimizer

Done:
- Single-RPC launch (`sendTransactionSync`) and tight gas limits on both server and client.
- Buy receipt polled every 300 ms, matching Monad's block time. Stats refetch every 4 s.
- Images are 256² WebP (~10–30 kB), served with `immutable` year-long caching. The sprite loads
  asynchronously, so the game starts in under 2 s.
- Canvas DPR is capped at 2 and `dt` is clamped, so a tab switch doesn't make the hero teleport.
- `/api/games` uses `s-maxage=5, stale-while-revalidate=30`, and live game JSON is cached for 300 s.
- One nonce-collision retry on the platform wallet.

Next, in priority order:
1. **Global rate limit and a daily launch cap** with Upstash or Vercel KV. This is the real
   wallet-drain guard.
2. **Nonce manager** for the platform wallet (viem `nonceManager`, or a small queue) if many judges
   create at once.
3. **Envio HyperIndex** (MONSKILLS `indexer`) on `GameLaunched` and `Bought`, for a volume-sorted
   feed and leaderboards.
4. **Para** embedded wallets (MONSKILLS `wallet-integration`) so buyers can use email login.
5. Verify the contracts through `agents.devnads.com/v1/verify` after the testnet deploy.
