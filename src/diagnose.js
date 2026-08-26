// RAKE — the analyst. The model NEVER produces a number: every figure in its
// diagnosis must already exist in the deterministic report it is handed.
// It may spend a small budget of funding walks to chase what the engine flagged,
// and each walk streams into the trace. No key → diagnosis is skipped, not faked.

import Anthropic from '@anthropic-ai/sdk';
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import { firstFunder, fundingEnabled } from './alchemy.js';
import { ANTHROPIC_KEY_PRESENT, GROQ_API_KEY, GROQ_MODEL } from './env.js';

const MODEL = 'claude-opus-5';
const WALK_BUDGET = 4;

const WALK_SCHEMA = {
  type: 'object',
  properties: {
    wallet: { type: 'string', description: 'The 0x wallet address to walk' },
    why: { type: 'string', description: 'One short clause: why this wallet' },
  },
  required: ['wallet', 'why'],
  additionalProperties: false,
};

const WALK_DESCRIPTION =
  'Look up the first inbound value transfer ever received by a Base wallet: who funded it, in which transaction. Use on wallets the report flags but does not explain.';

// Shared walk executor — both providers run the identical tool with the identical budget.
function makeWalker(onProgress) {
  let used = 0;
  const walks = [];
  const seen = new Map(); // wallet -> result; repeat calls are free and instant
  return {
    walks,
    async run(input) {
      if (!input?.wallet) return 'Invalid input: wallet is required.';
      if (!fundingEnabled()) return 'Funding walks are disabled (no ALCHEMY_API_KEY).';
      const key = input.wallet.toLowerCase();
      if (seen.has(key)) return seen.get(key) + ' (already walked — do not walk this wallet again)';
      if (used >= WALK_BUDGET) return 'Walk budget exhausted.';
      used++;
      onProgress(`analyst: walking funding of ${input.wallet} (${input.why ?? ''})`);
      try {
        const f = await firstFunder(input.wallet);
        const result = f
          ? `First inbound transfer to ${input.wallet}: from ${f.funder} in tx ${f.txHash} (${f.category}${f.asset ? ', ' + f.asset : ''}).`
          : `No inbound transfers found for ${input.wallet}.`;
        seen.set(key, result);
        walks.push({ wallet: input.wallet, why: input.why, result });
        return result;
      } catch (err) {
        const failure = `Walk failed: ${err.message}`;
        seen.set(key, failure);
        onProgress(`analyst: ${failure}`);
        return failure;
      }
    },
  };
}

const SYSTEM = `You are RAKE's analyst. You are handed a deterministic report of one Base token pool: a bounded window of real swaps, cohort classifications, and funding annotations. Every number in it traces to an onchain log or a transaction.

Hard rules:
- Never state a dollar figure, percentage, count, or address that is not present verbatim in the report or in a tool result. You interpret numbers; you never produce them.
- Cite transaction hashes from the report as evidence where they exist.
- Cohort labels are mechanical rules over public data. Describe behavior ("sold $X in the window, was funded by the initial LP wallet"), never accusations ("scammer", "rug"). "The house" refers collectively to the first-block, deployer-funded, cluster, lp, and repeat cohorts — that usage is fine.
- When most of the outflow is unlabeled, the verdict must attribute the selling to unidentified sellers — never to "the house". A cluster marked infra:true has a high-degree funder (exchange or disperse bot); its members are NOT one operator and are not house.
- If the window is thin or a cohort is disabled, say so plainly. Uncertainty is stated, never papered over.
- You may call walk_funding up to ${WALK_BUDGET} times to check who first funded a wallet that looks significant (e.g. a large unlabeled seller, or members of an apparent cluster). Spend the budget on what the report flags as unexplained, or not at all.
- Cohort labels come ONLY from the report — never re-classify a wallet. A walk_funding result tells you a funder address: report it verbatim ("first funded by 0x…, tx 0x…") and stop. If a wallet is labeled "unlabeled", it stays unlabeled in your diagnosis no matter what you infer.
- Do not derive new aggregates (sums, percentages, ratios) from the report's numbers. Quote the figures as given.

Output exactly these sections, plain text, total under 350 words:
VERDICT — one sentence on what this window was: a market, a payout, or too thin to call.
THE TAPE — what the flows show, 2-4 sentences.
WHO GOT PAID — the notable wallets and what is known about them, with tx hashes.
READ BEFORE APING — 1-3 sentences of practical caution grounded only in the evidence above.`;

// Compact the report: the model reads a summary, not 500 raw swaps.
function compactReport({ tape, rake, ticket }) {
  const cohortView = {};
  for (const [name, c] of Object.entries(rake.cohorts)) {
    cohortView[name] = {
      usd: Math.round(c.usd),
      sells: c.swaps,
      wallets: c.walletList.slice(0, 6).map((w) => ({
        wallet: w.wallet,
        usd: Math.round(w.usd),
        exampleTx: w.txs[0],
      })),
      walletCount: c.walletList.length,
    };
  }
  return {
    token: { symbol: tape.tokenSymbol, address: tape.token, dex: tape.dex, pool: tape.pool },
    window: tape.window,
    totals: {
      swaps: tape.totals.swaps,
      usdIn: Math.round(tape.totals.usdIn),
      usdOut: Math.round(tape.totals.usdOut),
      uniqueBuyers: tape.totals.uniqueBuyers,
      uniqueSellers: tape.totals.uniqueSellers,
      // Precomputed so the analyst may cite it (it is barred from deriving ratios itself).
      outflowToInflowRatio:
        tape.totals.usdIn > 0 ? Number((tape.totals.usdOut / tape.totals.usdIn).toFixed(1)) : null,
      drainWindow: tape.totals.usdIn > 0 && tape.totals.usdOut / tape.totals.usdIn >= 2,
    },
    rake: {
      houseUsd: Math.round(rake.houseUsd),
      // Named unambiguously: the rake is the house's share of the USD that ENTERED the pool.
      rakePctOfInflow: rake.rakePct === null ? null : Number(rake.rakePct.toFixed(1)),
    },
    cohorts: cohortView,
    clusters: rake.clusters
      ? rake.clusters.slice(0, 4).map((cl) => ({
          funder: cl.funder,
          size: cl.size,
          infra: cl.infra ?? false,
          members: cl.members.slice(0, 5).map((m) => m.wallet),
        }))
      : 'DISABLED',
    meta: rake.meta,
    ticket: ticket ?? undefined,
  };
}

// Provider dispatch: Claude when an Anthropic key is present (strongest tool
// discipline), Groq as fallback. Same prompt, same walker, same rules either way.
export async function diagnose({ tape, rake, ticket, onProgress = () => {} }) {
  // Minified JSON: Groq's free tier is tokens-per-minute bound; whitespace is spend.
  const userMsg = `Here is the deterministic RAKE report. Diagnose it.\n\n${JSON.stringify(compactReport({ tape, rake, ticket }))}`;

  if (ANTHROPIC_KEY_PRESENT) {
    const out = await diagnoseClaude(userMsg, onProgress);
    // Auth failure with a Groq key on hand → fall through rather than give up.
    if (out.status !== 'LLM_DISABLED' || !GROQ_API_KEY) return out;
  }
  if (GROQ_API_KEY) return diagnoseGroq(userMsg, onProgress);
  return {
    status: 'LLM_DISABLED',
    reason: 'Analyst offline — set ANTHROPIC_API_KEY (preferred) or GROQ_API_KEY to enable the diagnosis.',
  };
}

async function diagnoseClaude(userMsg, onProgress) {
  let client;
  try {
    client = new Anthropic();
  } catch {
    return { status: 'LLM_DISABLED', reason: 'Anthropic credentials could not be resolved.' };
  }
  const walker = makeWalker(onProgress);
  const walkFunding = betaTool({
    name: 'walk_funding',
    description: WALK_DESCRIPTION,
    inputSchema: WALK_SCHEMA,
    run: (input) => walker.run(input),
  });

  onProgress('analyst: reading the tape…');
  try {
    const runner = client.beta.messages.toolRunner({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      tools: [walkFunding],
      messages: [{ role: 'user', content: userMsg }],
    });

    let last = null;
    for await (const message of runner) {
      last = message;
    }
    const text = (last?.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (!text) return { status: 'LLM_ERROR', reason: 'Empty diagnosis.' };
    onProgress('analyst: diagnosis written');
    return { status: 'OK', model: MODEL, text, walks: walker.walks };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || /authentication|apiKey|x-api-key/i.test(err.message ?? '')) {
      return { status: 'LLM_DISABLED', reason: 'Anthropic credentials rejected.' };
    }
    return { status: 'LLM_ERROR', reason: err.message };
  }
}

// Groq speaks the OpenAI chat-completions dialect; the tool loop is manual.
async function diagnoseGroq(userMsg, onProgress) {
  const walker = makeWalker(onProgress);
  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: userMsg },
  ];
  const body = {
    model: GROQ_MODEL,
    temperature: 0.2,
    max_tokens: 2048,
    tools: [
      { type: 'function', function: { name: 'walk_funding', description: WALK_DESCRIPTION, parameters: WALK_SCHEMA } },
    ],
  };

  onProgress(`analyst: reading the tape… (${GROQ_MODEL} via Groq)`);
  try {
    let retries = 2;
    for (let i = 0; i < 6; i++) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({ ...body, messages }),
      });
      if (res.status === 401 || res.status === 403) {
        return { status: 'LLM_DISABLED', reason: 'Groq key rejected.' };
      }
      if (res.status === 429 && retries > 0) {
        retries--;
        const text = await res.text();
        const suggested = Number(text.match(/try again in (\d+(?:\.\d+)?)s/)?.[1] ?? 20);
        const waitS = Math.min(70, Math.ceil(suggested) + 2);
        onProgress(`analyst: Groq rate limit — retrying in ${waitS}s`);
        await new Promise((r) => setTimeout(r, waitS * 1000));
        i--; // the retry does not consume a tool-loop iteration
        continue;
      }
      if (!res.ok) {
        return { status: 'LLM_ERROR', reason: `Groq HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
      }
      const msg = (await res.json()).choices?.[0]?.message;
      if (!msg) return { status: 'LLM_ERROR', reason: 'Empty Groq response.' };

      if (msg.tool_calls?.length) {
        messages.push(msg);
        for (const call of msg.tool_calls) {
          let input;
          try {
            input = JSON.parse(call.function?.arguments ?? '{}');
          } catch {
            input = {};
          }
          const result =
            call.function?.name === 'walk_funding' ? await walker.run(input) : `Unknown tool ${call.function?.name}.`;
          messages.push({ role: 'tool', tool_call_id: call.id, content: result });
        }
        continue;
      }

      const text = (msg.content ?? '').trim();
      if (!text) return { status: 'LLM_ERROR', reason: 'Empty diagnosis.' };
      onProgress('analyst: diagnosis written');
      return { status: 'OK', model: `${GROQ_MODEL} (groq)`, text, walks: walker.walks };
    }
    return { status: 'LLM_ERROR', reason: 'Groq tool loop exceeded 6 iterations.' };
  } catch (err) {
    return { status: 'LLM_ERROR', reason: err.message };
  }
}
