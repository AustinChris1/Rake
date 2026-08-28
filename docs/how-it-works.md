# How RAKE works

## The problem, in one story

You find a token on Base. It's pumping: **$1.1M volume, +35%, 4,000 swaps.** Looks exciting.

But volume doesn't tell you the story that matters. Suppose the truth underneath is:

> $1.1M entered the pool. $506K left through wallets that were there in the first block, fund
> each other, or sell every single window. One repeat seller alone took $178K.

Now your question changes from *"is this pumping?"* to the only question that matters:

> **"How much of this market is real, and how much is money being extracted by people who were
> already positioned - am I trading against the house?"**

Dexscreener tells you what happened to the price. Basescan tells you which transactions happened.
**RAKE tells you who got paid.**

## What actually happens when you pull the tape

1. **Find the pool.** RAKE resolves the token's top-volume pool on Base (Uniswap v2/v3/v4,
   Aerodrome, PancakeSwap - v4 pools live inside a singleton contract and are handled specially).
2. **Reconstruct the tape.** Every `Swap` event in your window is read from Base logs and decoded.
3. **Attribute the humans.** Each swap is billed to the person behind it. Smart-wallet
   transactions (ERC-4337) are resolved to the actual account, never the bundler that submitted
   them; routers and aggregators are never blamed for their users' trades.
4. **Price honestly.** Every swap's USD value comes from its own WETH/USDC leg at the hour it
   executed - not from a spot ticker after the fact.
5. **Classify sellers by rules.** See the cohorts below. Rules, not opinions.
6. **Walk the money.** With funding data, RAKE checks who *first funded* the biggest sellers -
   catching fleets of "independent" wallets that share one low-degree funder.
7. **Compute the rake.** The share of the window's inflow that left through house cohorts.
8. **Let the analyst read it.** An LLM writes the diagnosis from the finished evidence. It may
   spend a small budget of extra funding walks; it cannot produce or change a number.

## The house cohorts

| Cohort | Rule (mechanical, reproducible) |
|---|---|
| `first-block` | traded in the first 50 swaps after the pool was created - the snipers |
| `deployer-funded` | first inbound transfer ever came from the initial-LP wallet or a first-block wallet |
| `cluster` | sold alongside other sellers who share the same low-degree first funder - one operator, many hands |
| `lp` | added or removed liquidity in the window, plus the pool itself |
| `repeat` | also sold in the previous window of equal length - sells every window, every time |
| `unlabeled` | everyone else |

**Important honesty note: "house" does not mean "proven to be the same person" or "the dev".**
It means: wallets exhibiting behaviors that fit predefined extraction rules, with the evidence
attached. Exchange hot wallets, bridges, and wallet-infrastructure funders are explicitly
excluded from clustering so ordinary users are never smeared. If a judge asks *"how do you know
they're the same entity?"* - the answer is: we don't claim identity; we identify economically
connected behavior using reproducible rules, and the receipt exposes the evidence.

## Who uses this, and when

- **Traders, right before buying.** Paste the token. If 46% of today's inflow left through house
  cohorts, you may still buy - but with $200 instead of $1,000, and with open eyes.
- **Traders, right after getting wrecked.** Add your wallet and get *your ticket*: who sold, in
  size, within seconds of your entry. "Who sold to me?" finally has receipts.
- **Token communities and founders.** When X says "DEV IS DUMPING", stop arguing and publish the
  receipt - whichever way it comes out. Watch your own token with the Telegram guard and know
  about coordinated extraction before the community does.
- **Researchers and investigators.** Paste token, get investigation: every figure traces to a
  transaction, so the receipt is quotable.
- **Trading bots and AI agents.** Call the deep pass, pay a nickel, get structured forensics
  before deciding to trade. RAKE is infrastructure for other agents, not just a page.

## The self-check

Every hour the agent rakes Base's trending tokens and appends the events to a public GitHub log.
Twelve hours later it checks each event: did price actually fall after a high-rake window?
The split - high-rake vs baseline - is published **even if the answer is embarrassing**. A signal
you can't audit is an opinion; RAKE's log is the audit.

## What RAKE is not

- Not a bubble map. Bubblemaps shows you the ownership network; RAKE quantifies the extraction.
  Different question, different tool - they compose well.
- Not a buy/sell signal. RAKE gives evidence; you make the decision.
- Not an oracle. Thin windows read `TOO THIN`; unreadable pools read `UNPRICEABLE`. It refuses to guess.
