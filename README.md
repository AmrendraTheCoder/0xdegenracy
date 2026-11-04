# 0xdegenracy

**Every coin ships with a game.** Upload a face, type a dumb game idea, and get a playable meme game
plus an ERC-20 memecoin with that face on it, live on Monad testnet in under a minute.

Built for Monad Blitz with [MONSKILLS](https://skills.devnads.com). See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design, review log and roadmap.

```
contracts/   Foundry: GameTokenFactory, GameToken (linear bonding curve, buy + sell, 2% fee), PrizePool
web/         Next.js 15 + Tailwind + wagmi/viem; API routes; canvas engine with 7 games
supabase/    schema.sql + migrations/002_events.sql (activity, proof and error log)
```

**Features:** 7 games (Flappy, Endless Runner, Dodge & Catch, Whack-a-Mole, Snake, Brick Breaker,
Space Shooter), each using the uploaded face as the hero. Buy and sell on a linear bonding curve, with
a price chart. A daily leaderboard funded by trading fees pays the top 10 traders
25/18/15/12/10/8/6/4/1/1%. Transaction toasts, an activity page with on-chain proof, and persistent
error logging.

## Deployed (Monad testnet, chain 10143)

| Contract | Address |
|---|---|
| GameTokenFactory v2 | [`0x4eBB7557B64563138A11fa27BE82003EaF4a46e8`](https://testnet.monadvision.com/address/0x4eBB7557B64563138A11fa27BE82003EaF4a46e8) (verified on MonadVision and [Monadscan](https://testnet.monadscan.com/address/0x4eBB7557B64563138A11fa27BE82003EaF4a46e8)) |
| PrizePool | [`0x82C972CB96b8DeC431e32D5C8af4dc474a8dc871`](https://testnet.monadvision.com/address/0x82C972CB96b8DeC431e32D5C8af4dc474a8dc871) (verified; deployed by the factory) |
| GameTokenFactory v1 (buy-only, superseded) | [`0x11548952e9a5C38EF6A365147a099427B64128eb`](https://testnet.monadvision.com/address/0x11548952e9a5C38EF6A365147a099427B64128eb) (verified) |

## Upgrade to v2 (sell, leaderboard, prize pool)

1. Run `supabase/migrations/002_events.sql` in the Supabase SQL editor.
2. Deploy the new factory. It deploys its PrizePool in the same transaction.
   ```bash
   cd contracts && forge script script/Deploy.s.sol --rpc-url monad_testnet --account reachy --broadcast
   ```
3. Set `NEXT_PUBLIC_FACTORY_ADDRESS` to the new address, locally and on Vercel. The app reads the
   PrizePool address from the factory.
4. On Vercel, add `CRON_SECRET` (any long random string). Vercel Cron then settles yesterday's pool
   at 00:05 UTC (`web/vercel.json`).

Games launched on v1, like `$MONBA`, keep working but stay buy-only.

## Run locally (no accounts needed)

```bash
# terminal 1: local chain using Monad's testnet chain id
anvil --chain-id 10143
```

```bash
# terminal 2: deploy the factory with an Anvil dev key
cd contracts && forge test && forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

```bash
# wagmi batches reads through Multicall3; copy it from Monad testnet into Anvil
cast rpc anvil_setCode 0xcA11bde05977b3631167028862bE2a173976CA11 $(cast code 0xcA11bde05977b3631167028862bE2a173976CA11 --rpc-url https://testnet-rpc.monad.xyz) --rpc-url http://127.0.0.1:8545
```

```bash
cd web && cp .env.example .env.local   # set NEXT_PUBLIC_FACTORY_ADDRESS, both RPC URLs = http://127.0.0.1:8545, an Anvil key as PLATFORM_PRIVATE_KEY
```

```bash
cd web && npm install && npm run dev
```

With Supabase vars empty, data goes to `web/.data/`. With no AI key, configs come from the offline
generator (presets only).

## AI (Gemini)

The AI turns an idea into a game: it picks one of the 7 presets, or writes a custom game that runs in a
sandboxed iframe. Get a key at https://aistudio.google.com/apikey and set it in `web/.env` and on
Vercel:

```ini
GEMINI_API_KEY=<your key>
GEMINI_MODEL=gemini-2.5-flash   # optional; any Gemini model id
```

It uses Gemini's OpenAI-compatible endpoint. A Google-format key (`AIza…`) in `LLM_API_KEY` also
works. If the AI is unavailable or times out, the offline generator picks a preset, so creating a game
never blocks.

## Deploy to Monad testnet

```bash
cast wallet new                                   # make a fresh testnet-only deployer/platform wallet
```

```bash
cast wallet import reachy-deployer --interactive  # paste that key; stored encrypted, not in shell history
```

Fund the address at https://faucet.monad.xyz, then:

```bash
cd contracts && forge script script/Deploy.s.sol --rpc-url monad_testnet --account reachy-deployer --broadcast
```

Verify the contract on all explorers with the MONSKILLS verification API (see the `scaffold` skill;
`compilerVersion` is `v0.8.28+commit.7893614a`, and via-IR is in the metadata).

Then on Vercel (root directory `web/`), set every variable in `web/.env.example`, run
`supabase/schema.sql` in Supabase, deploy, and seed the feed:

```bash
cd web && SEED_URL=https://your-app.vercel.app node scripts/seed.mjs face1.png face2.png face3.png
```

## Safety

Testnet only. There is no sell function and no mint after deploy. Uploads are type-sniffed,
size-capped and re-encoded. Secrets live only in server env vars.
