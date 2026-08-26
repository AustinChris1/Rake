<p align="center">
  <img src="public/logo.svg" width="84" alt="RAKE mark">
</p>

<h1 align="center">RAKE</h1>

<p align="center"><em>Every candle has a house. Rake names who got paid — from the actual swaps, in dollars.</em></p>

---

**The mark:** a croupier's rake mid-pull, dragging chips off the table — the house collecting its cut of the pot.

## What it does

Paste a Base token (optionally your wallet too). RAKE reconstructs a bounded window of the pool's **real `Swap` events**, attributes every sell to the human behind it (the **UserOp sender** for ERC-4337 bundles, `tx.from` otherwise — never the router, never the bundler), prices every swap **from its own quote leg at its execution hour**, and classifies each seller by mechanical rules:

| cohort | rule |
|---|---|
| `first-block` | wallet behind one of the first 50 swaps after the pool was deployed |
| `deployer-funded` | seller whose **first inbound transfer ever** came from the initial-LP wallet or a first-block wallet |
| `cluster` | sold alongside ≥1 other seller first-funded by the same **low-degree** wallet (one operator's fleet); funders with ≥1000 lifetime outgoing transfers are exchange/disperse infrastructure and never count |
| `lp` | minted or burned liquidity in this pool in-window (plus the pool itself) |
| `repeat` | also sold in the previous window of equal length |
| `unlabeled` | everyone else |

**The rake** = share of USD that entered the pool which left through the first five cohorts. It also detects **funding clusters** — groups of sellers first-funded by the same wallet (one operator's fleet) — and, with your wallet, prints **your ticket**: what the house sold within ±40 seconds of each of your buys.

Then the analyst (Claude Opus 5) reads the deterministic report, optionally spends a small budget of funding walks on wallets the engine flagged, and writes the diagnosis. **The model never produces a number** — every figure traces to an onchain log, a transaction, or a Dexscreener read, and the whole sequence streams as a live trace.

## Honesty rules

- Thin window → `TOO THIN`. Undecodable pool → `UNREADABLE`. No priceable quote → `UNPRICEABLE`. Never estimated.
- Sellers are humans, not plumbing: ERC-4337 bundles resolve to the **UserOp sender** (billing the bundler would be naming the mailman for the letter); everything else is `tx.from`. Routers and aggregators are never blamed for their users' trades, and never credited either.
- USD comes from each swap's own WETH/USDC leg at execution, priced at that hour's WETH/USD close (GeckoTerminal); if the hourly series is unavailable, a single current print is used and the receipt says so.
- The hourly public log ([log/LEADERBOARD.md](log/LEADERBOARD.md)) self-checks: 12 hours after each event it records whether price actually fell — and publishes the split **even if high rake turns out not to predict anything**.

## Run it

```bash
pnpm install
cp .env.example .env   # ALCHEMY_API_KEY (funding walks) + ANTHROPIC_API_KEY or GROQ_API_KEY (analyst)

# Webapp (Next.js — dev)
pnpm dev               # → http://localhost:3000

# Webapp (production)
pnpm build && pnpm start

# CLI
pnpm rake 0x532f27101965dd16442e59d40670faf5ebb142e4 --hours 4 [--wallet 0x...] [--no-llm]

# Hourly public log + self-check
pnpm leaderboard
```

**Deploy:** the app is Vercel-ready — import the repo on [vercel.com](https://vercel.com), add `ALCHEMY_API_KEY` and `ANTHROPIC_API_KEY`/`GROQ_API_KEY` as environment variables, deploy. The engine runs inside the `/api/rake` route (SSE, `maxDuration: 300` — Fluid compute on the free tier covers it).

No keys at all? The deterministic engine (tape, first-block, lp, repeat, rake %) runs entirely on free public RPCs — funding walks and the analyst switch off cleanly.

## Architecture

```
src/tape.js      bounded swap tape: chunked eth_getLogs (RPC failover), per-log topic0
                 decoder (UniV2 / Solidly / UniV3+Slipstream / PancakeV3 / UniV4), quote-leg
                 USD at execution hour. V4 pools are 32-byte ids on the PoolManager
                 singleton: logs filter by poolId topic, orientation is verified
                 empirically against the pair price (no token0() exists to ask)
src/attribute.js the human behind each log: UserOp sender for ERC-4337 bundles
                 (EntryPoint v0.6/0.7/0.8), tx.from otherwise
src/price.js     hourly WETH/USD closes for execution-hour pricing
src/cohorts.js   creation block (binary-searched eth_getCode), first-50-swaps cohort,
                 LP cohort, repeat cohort, funding cohort + clusters, rake computation
src/alchemy.js   alchemy_getAssetTransfers funding walks (native ETH leaves no logs —
                 eth_getLogs cannot answer "who funded this wallet")
src/ticket.js    your buys vs. house sells within ±20 blocks — window-framed, causal
                 claims never made
src/diagnose.js  Claude Opus 5 analyst via the SDK tool runner; one tool (walk_funding,
                 budget 4); hard rule: interprets numbers, never produces them
src/report.js    the pipeline both surfaces share
app/             Next.js frontend (Tailwind, Framer Motion) + /api/rake SSE route
scripts/         hourly leaderboard + 12h self-check
```

Built on Base for the **Orion Builder Hackathon**.
