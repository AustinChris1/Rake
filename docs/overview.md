# RAKE - overview

**Onchain market forensics for Base.** Paste a token and RAKE reconstructs the real swaps behind
its candle, names who extracted the money, and prints an evidence-backed receipt. Every number
traces to an onchain log or a live quote - never to a model's opinion.

> Every candle has a house. RAKE answers the question your chart can't: when the money came into
> this token, who actually got paid when it came back out?

## What you get

- **The receipt** - a bounded window (1h / 4h / 24h) of a token's top Base pool: USD in, USD out,
  and the **rake**: the share of inflow that left through "house" cohorts, with every wallet and
  transaction linked.
- **Your ticket** - add your wallet and see what the house sold within seconds of your own buys.
- **The watch** - [@basedrakebot](https://t.me/basedrakebot) on Telegram guards any token and
  pings you the moment extraction crosses your threshold. Runs serverless, around the clock.
- **The deep pass** - an [x402](https://x402.org)-paid API for agents: $0.05 USDC buys the full
  forensic receipt, no account, no API key.
- **The public log** - the agent rakes Base's trending tokens hourly, commits every event to
  [a tamper-evident GitHub log](https://github.com/AustinChris1/Rake/blob/main/log/LEADERBOARD.md),
  and self-checks its own signal 12 hours later - publishing the result even when it is unflattering.

## The five interfaces

| Who | Where |
|---|---|
| Trader | [basedrake.vercel.app](https://basedrake.vercel.app) |
| Trader on Telegram | [@basedrakebot](https://t.me/basedrakebot) |
| Developer | `GET /api/rake` (SSE) |
| AI agent | `GET /api/deeppass` (x402, $0.05) |
| Researcher / community | receipts, shareable by URL |

## The philosophy

The engine is deterministic; the AI is only an analyst. Blockchain data decides what happened:
swaps are reconstructed from logs, sellers are attributed to the human behind the transaction
(the UserOp sender for ERC-4337 bundles, `tx.from` otherwise - never the router, never the
bundler), USD comes from each swap's own quote leg at its execution hour, and cohorts are
mechanical rules. The model reads the finished evidence and writes the diagnosis - it never
produces a number.

When the data is thin or unreadable, RAKE says so: `TOO THIN`, `UNPRICEABLE`, `UNREADABLE`.
Never estimated.

- [How it works →](/docs/how-it-works)
- [Usage →](/docs/usage)
- [Source on GitHub](https://github.com/AustinChris1/Rake)
