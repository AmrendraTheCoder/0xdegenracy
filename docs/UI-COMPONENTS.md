# UI components

How the game page (`/game/[id]`) is put together, and the shared primitives it is built from.
Everything lives in `web/src`. Styling is Tailwind v4 with the neo-brutalist tokens in
`app/globals.css` (`ink`, `paper`, `banana`, `hot`, `mint`, `grape`, plus `hot-strong` and `up`
for text that needs 4.5:1 contrast on light backgrounds).

## Layers

```
app/game/[id]/page.tsx        server: loads the game + launch event, lays out the page
app/game/[id]/loading.tsx     skeleton that mirrors the layout
app/game/[id]/error.tsx       error boundary with "Try again"

components/GamePlayer.tsx     canvas game, toolbar, touch pad, keyboard legend
components/TokenPanel.tsx     container: hooks → presentational token pieces
components/PriceChart.tsx     price step chart + recent trades
components/token/*            presentational token pieces (no data fetching)
components/ui/*               generic primitives (no app knowledge except AddressLink)

lib/hooks/useToken.ts         data hooks: stats, balances, quotes, gas, trades
lib/hooks/useMounted.ts       hydration guard for wallet state
lib/hooks/useInView.ts        IntersectionObserver for the mobile trade bar
```

Rules of thumb:

- **Hooks fetch, components render.** Components in `token/` and `ui/` take plain props
  (bigints, strings, callbacks) and never call wagmi directly. `TokenPanel` and `PriceChart` are
  the only places that wire hooks to UI.
- **Button logic is a pure function.** `getTradeState()` (`components/token/tradeState.ts`) turns
  wallet/quote/gas state into exactly one of `loading | connect | switch | busy | blocked | ready`.
  Every `blocked` state carries a human `reason` that is shown under the button and linked with
  `aria-describedby`.
- **Server-safe where possible.** `Card`, `Badge`, `Stat`, `Skeleton`, `Notice`, `ProgressBar`,
  `AddressLink` and `OnChainProof` have no hooks and render on the server. Interactive pieces
  (`Tabs`, `NumberInput`, `CopyButton`, …) are marked `"use client"`.

## Page layout

| Width | Order |
|---|---|
| Phone (< 1024px) | header → game → trade panel → price chart → on-chain proof, plus a sticky bottom **trade bar** (`MobileTradeBar`) that hides while the panel is on screen |
| Desktop (≥ 1024px) | two columns: game + chart on the left, trade panel + proof on the right (360px) |

Landmarks: the page is an `<article>` labelled by the `<h1>`; the game is a labelled `<section>`;
the trade panel and proof are `<aside>`s labelled by their headings; the chart is a `<section>`.

## Data hooks (`lib/hooks/useToken.ts`)

| Hook | Returns |
|---|---|
| `useTokenStats(token)` | `{ status: "loading" \| "error" \| "ready", price, sold, supply, remaining, progress, legacy, soldOut, error, refetch }`. Polls every 4s. `legacy` is true only when the token answered but `prizePool()` reverted, so a dead RPC is reported as `error`, not as a v1 token. |
| `useTokenBalances(token)` | `{ address, mon, heldWhole, loading, refetch }` for the connected wallet. |
| `useBuyQuote(token, amount, legacy, enabled?)` | `{ value, tokensOut, minOut, data, loading, error }`. Uses `quoteBuy` (v2) or `quote` (v1). `minOut` applies 5% slippage; `data` is the encoded `buy(minOut)`. |
| `useSellQuote(token, tokensWhole, enabled?)` | `{ amount, netOut, minMon, data, loading, error }`, `data` is the encoded `sell(amount, minMon)`. |
| `useTradeGas({ to, data, value, enabled })` | `{ limit, loading, error }`. `limit` = estimate + 10% (Monad charges the full gas limit). |
| `useTrades(gameId)` | `{ trades, status, error, retry }` from `/api/games/:id/trades`, polled every 8s and refetched on `TRADE_EVENT`. |
| `useLivePrice(token)` | live `currentPrice()`, anchors the chart's "now". |

Exports `SLIPPAGE_BPS`, `withSlippage()` and `parseMon()` for reuse.

## Primitives (`components/ui`)

Import from the barrel: `import { Button, Card, Tabs } from "@/components/ui"`.

### Button / ButtonLink / buttonClasses

| Prop | Type | Notes |
|---|---|---|
| `variant` | `"primary" \| "buy" \| "sell" \| "secondary" \| "accent"` | hot / mint / ink / white / banana |
| `size` | `"sm" \| "md" \| "lg"` | |
| `block` | `boolean` | full width |
| `loading` | `boolean` | spinner, `aria-busy`, disabled |
| …rest | button / anchor attributes | `type` defaults to `"button"` |

```tsx
<Button variant="primary" size="lg" block loading={busy} onClick={trade}>Buy $CAT</Button>
<ButtonLink href={FAUCET_URL} target="_blank">Faucet</ButtonLink>   // adds rel + "(opens in a new tab)"
<Link href="/" className={buttonClasses({ variant: "secondary" })}>Home</Link>
```

### Card

`{ as?: "section" | "aside" | "div" | "article"; id?; title?; level?: 2 | 3; action?; className?; children }`.
With `id` and `title` the region gets `aria-labelledby` pointing at its heading.

```tsx
<Card id="price" title="Price" action={<b>{fmtPrice(p)}</b>}>…</Card>
```

### Tabs / TabPanel

WAI-ARIA tabs with automatic activation. ←/→ (and ↑/↓) move and select, Home/End jump, disabled
tabs are skipped by the arrow keys but stay discoverable (`aria-disabled` + `aria-description`).

| Prop | Type |
|---|---|
| `label` | accessible name of the tablist |
| `idPrefix` | unique prefix for tab/panel ids |
| `items` | `{ id, label, disabled?, disabledReason?, activeClassName? }[]` |
| `value` / `onChange` | controlled selection |

```tsx
<Tabs label="Trade direction" idPrefix="trade" value={side} onChange={setSide}
  items={[{ id: "buy", label: "Buy" }, { id: "sell", label: "Sell", disabled: legacy, disabledReason: "Buy-only token" }]} />
<TabPanel idPrefix="trade" id={side}>…</TabPanel>
```

### NumberInput / PresetGroup

`NumberInput`: `{ label, value, onChange, unit?, presets?, description?, error?, disabled?, id?, hideLabel? }`.
Accepts digits and one decimal point (commas become dots), sets `aria-invalid` and
`aria-describedby` for description/error. `PresetGroup` is the row of `aria-pressed` toggle
buttons, usable on its own (the sell form uses it for 25/50/100%).

```tsx
<NumberInput label="Amount to spend" unit="MON" value={amount} onChange={setAmount}
  presets={["0.001", "0.01"].map((v) => ({ label: v, value: v }))} error={invalid && "Enter a number above 0."} />
<PresetGroup label="Share of your bag to sell" presets={[{ label: "50%", value: 50 }]} value={pct} onSelect={setPct} />
```

### Stat / StatGrid

`StatGrid` is a `<dl>`; `Stat` is `{ label, value, hint?, loading?, className? }` and shows a
skeleton (with "Loading" for screen readers) while `loading`.

```tsx
<StatGrid><Stat label="Price" value="1.2e-10" hint="MON per token" loading={!ready} /></StatGrid>
```

### ProgressBar

`{ value: 0–100, label, valueText?, className? }`, `role="progressbar"` with `aria-valuenow/text`.

### Skeleton

`{ className?, width?, height? }`. `aria-hidden`; pair it with a `role="status"` label or sr-only text.
Pulse is disabled under `prefers-reduced-motion`.

### Badge

`{ tone?: "banana" | "mint" | "hot" | "ink" | "white"; children }`.

### Notice / ErrorState

`Notice`: `{ tone?: "info" | "warn" | "error" | "success"; title?; children?; action? }`. Errors use `role="alert"`.
`ErrorState`: `{ title?, message?, onRetry? }`, a `Notice` with a "Try again" button.

```tsx
<ErrorState title="Can't reach the token contract" onRetry={stats.refetch} />
<Notice title="No trades yet">Be the first to buy.</Notice>
```

### AddressLink / CopyButton

`AddressLink`: `{ value, kind?: "address" | "tx", label?, copy?, className? }`. Explorer link,
shortened, full value in `title`, sr-only "opens in a new tab", optional copy button.
`CopyButton`: `{ value, label?, className? }`. Confirms with ✓ and a polite live region.

```tsx
<AddressLink value={token} copy />
<AddressLink value={txHash} kind="tx" />
```

## Token pieces (`components/token`)

| Component | Props | Notes |
|---|---|---|
| `TokenHeader` | `{ name, ticker, imageUrl, accent, legacy?, headingId? }` | `<h2>` that labels the panel |
| `TokenStats` | `{ loading, ticker, price?, sold?, supply?, heldWhole? }` | "Your bag" row only when `heldWhole` is given |
| `CurveProgress` | `{ progress, loading?, soldOut? }` | bonding curve bar |
| `BuyForm` | `{ ticker, amount, onAmountChange, tokensOut, quoteLoading, feeLabel, invalid?, disabled? }` | quote line is `aria-live` |
| `SellForm` | `{ ticker, pct, onPctChange, heldWhole?, sellAmount, netOut, quoteLoading, disabled? }` | 25/50/100% presets |
| `TradeButton` | `{ state: TradeState, side, onTrade, onSwitchChain, reasonId }` | renders connect / switch / action + reason |
| `ShareButton` | `{ title, text }` | native share, else copy + toast |
| `OnChainProof` | `{ token, txHash, creator, blockNumber?, factory?, id? }` | server-renderable |
| `MobileTradeBar` | `{ token, ticker, targetId }` | phone-only sticky bar |

`getTradeState(inputs)` covers: not mounted, not connected, wrong network, tx in flight, token
loading, sold out, empty/invalid amount, insufficient MON (with faucet link), quote loading,
amount too small for one whole token, legacy (sell disabled), zero balance, sell share rounding to
zero, gas estimating, gas estimation error (shown verbatim, first line), ready.

### Composing a custom panel

```tsx
const stats = useTokenStats(token);
const buy = useBuyQuote(token, amount, stats.legacy);
return (
  <Card as="aside" id="buy" title="Quick buy">
    <TokenStats loading={stats.status === "loading"} ticker="CAT" price={stats.price} sold={stats.sold} supply={stats.supply} />
    <BuyForm ticker="CAT" amount={amount} onAmountChange={setAmount} tokensOut={buy.tokensOut} quoteLoading={buy.loading} feeLabel="2%" />
  </Card>
);
```

## Accessibility checklist

- Landmarks and headings: one `<h1>` per page, `<h2>` per region, regions labelled by headings.
- Every input has a `<label>`; preset groups have `aria-label`; toggles use `aria-pressed`.
- Tabs follow the APG pattern with arrow-key navigation and roving `tabIndex`.
- Visible `:focus-visible` ring (3px grape) on everything, including the canvas.
- `aria-live` on quotes, the trade button reason, the price, and the post-game CTA; toasts are
  already a polite live region.
- Canvas: `role="application"`, `aria-roledescription="game"`, and a description with the controls
  and best score. Toolbar buttons work from the keyboard (click, not pointer-down only) and keep
  focus on the canvas when tapped.
- Contrast: text on light backgrounds uses `hot-strong` / `up` instead of `hot` / `green`; buttons
  on `hot` use ink text.
- `prefers-reduced-motion`: no smooth scroll, no button transitions, no skeleton pulse or spinner
  rotation, no progress/trade-bar animation.
