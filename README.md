# Reachy

**Every coin ships with a game.** Upload a face, type a dumb game idea, and get a playable meme game
plus an ERC-20 memecoin with that face on it, live on Monad testnet in under a minute.

Built for Monad Blitz with [MONSKILLS](https://skills.devnads.com). See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design, review log and roadmap.

```
contracts/   Foundry: GameTokenFactory + GameToken (linear curve, 1% creator fee)
web/         Next.js 15 + Tailwind + wagmi/viem; API routes; canvas engine with 3 games
supabase/    schema.sql (games table + image bucket)
```

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

With Supabase vars empty, data goes to `web/.data/`. With `LLM_BASE_URL` empty, configs come from
the offline generator.

## Local inference with OmniRoute

Reachy sends every LLM call to [OmniRoute](https://github.com/cheaper-inference/OmniRoute), a local
OpenAI-compatible gateway, so you can swap models or providers without code changes.

```bash
npm install -g omniroute
```

```bash
omniroute
```

Open the dashboard at http://localhost:20128, connect a provider (for fully local inference, add
the **Ollama** provider with a model you've pulled, such as `qwen3:8b`), then create an API key.
In `web/.env`:

```ini
LLM_BASE_URL=http://localhost:20128/v1
LLM_API_KEY=<OmniRoute API key>
LLM_MODEL=auto            # or a combo name / a specific model id
LLM_TIMEOUT_MS=25000
```

The client works with local models: if a model rejects JSON mode, it retries without it, removes
`<think>` blocks, and validates and clamps every field. If OmniRoute is down or times out, the
offline generator is used, so creating a game never blocks.

**Deployed on Vercel?** Vercel can't reach your `localhost`. Expose OmniRoute over HTTPS with a
tunnel (OmniRoute's Docker guide covers Cloudflare tunnels, or run
`cloudflared tunnel --url http://localhost:20128`), keep your laptop running during the demo, and
set `LLM_BASE_URL` on Vercel to `https://<tunnel-host>/v1`.

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
