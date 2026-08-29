# Using RAKE

## The webapp

1. Open [basedrake.vercel.app](https://basedrake.vercel.app).
2. Paste any Base token address (or tap a trending chip). Pick a window: **1h / 4h / 24h**.
3. Optionally paste your own wallet to get **your ticket**.
4. **PULL THE TAPE.** The live trace streams every real call the agent makes; the receipt follows.

Reading the receipt:

- **The big number** is the rake: the share of the window's inflow that left through house cohorts.
  Green under 20%, gold to 50%, red beyond - and red whenever the window is a drain
  (outflow ≥ 2x inflow), whatever the rake says.
- **Who got paid** lists sellers by cohort with amounts and transaction links - every row is
  checkable on Basescan.
- **Funding clusters** show sellers who share one first funder. Clusters with exchange, bridge,
  or wallet-infrastructure funders are shown but never counted as house.
- **Your ticket** shows your buys and what house wallets sold within ±40 seconds of each one. If
  your buy routed through a different pool of the token, the ticket says so, with the receipts of
  your actual transfer. If you hold a same-name token at a different contract, it warns you.
- Every receipt is a **shareable URL** - `/?token=0x…&hours=4` re-runs it for anyone.

Timing: 1h/4h windows on normal tokens take seconds to ~a minute; a 24h window on a token with
tens of thousands of swaps can take several minutes - the agent is attributing every transaction.
Repeat views are cached for 10 minutes.

## The Telegram watch - @basedrakebot

Open [@basedrakebot](https://t.me/basedrakebot). Watches are **per chat**: your watches are yours
alone, and alerts go only to you.

| Command | What it does |
|---|---|
| `/check 0xTOKEN` | rake it right now, receipt in chat |
| `/watch 0xTOKEN 50` | alert when the 1h rake crosses 50% (your number) or the window is a ≥3x drain |
| `/list` | your active watches |
| `/unwatch 0xTOKEN` | stop watching |

Alerts fire on the crossing and re-arm when the pool calms down - a guard, not a spammer. Buttons
on every alert: open the receipt, re-check, unwatch. The patrol re-rakes watched pools every ~30
minutes and runs serverless - nobody's laptop needs to be on.

From any webapp receipt, **"watch on Telegram"** deep-links the bot with the token prefilled.

## The API

### Free receipt (SSE)

```bash
curl -N "https://basedrake.vercel.app/api/rake?token=0xTOKEN&hours=4&wallet=0xYOU"
```

Streams `progress` events (the live trace) and a final `result` event with the full receipt JSON.

### The deep pass

```
GET https://basedrake.vercel.app/api/deeppass?token=0xTOKEN&hours=4
```

The deep pass walks eligible sellers' funding far beyond the free tier's top 60, richest
first, and adds two-hop funding graphs on cluster funders - who funded the fleet's funder.
On very large windows the walk stops at the request's time budget and the receipt states
exactly how many sellers were walked (`walked N of M sellers (time budget)`). It never
silently truncates. Payment is
[x402](https://x402.org): the route answers `402 Payment Required` with a machine-readable quote;
your client pays $0.05 USDC and retries with the proof. No account, no API key.

From an agent, with `@x402/fetch`:

```js
import { wrapFetchWithPayment } from '@x402/fetch';
const paidFetch = wrapFetchWithPayment(fetch, walletClient);
const r = await paidFetch('https://basedrake.vercel.app/api/deeppass?token=0xTOKEN&hours=4');
const receipt = await r.json(); // deterministic forensics, machine-readable
```

The receipt JSON includes `tape` (every swap, attributed and priced), `rake` (cohorts, clusters,
meta), and `ticket` when a wallet is provided. Statuses are explicit: `OK`, `TOO_THIN`,
`UNPRICEABLE`.

## Self-hosting

```bash
git clone https://github.com/AustinChris1/Rake && cd Rake
pnpm install
cp .env.example .env   # fill in keys - each feature degrades cleanly without its key
pnpm dev               # webapp on :3000
pnpm rake 0xTOKEN --hours 4    # CLI
pnpm leaderboard               # one pass of the public log
pnpm watch                     # local Telegram bot (long-poll mode)
```

| Env | Enables |
|---|---|
| `ALCHEMY_API_KEY` | funding walks: deployer-funded cohort, clusters |
| `ANTHROPIC_API_KEY` / `GROQ_API_KEY` | the analyst note |
| `TELEGRAM_BOT_TOKEN` + `UPSTASH_REDIS_REST_URL/TOKEN` | the watch |
| `X402_PAY_TO` (+ `X402_NETWORK`) | paid deep pass |

No keys at all still runs the full deterministic engine on free public RPCs.
