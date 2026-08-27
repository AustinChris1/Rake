// RAKE deep pass: every eligible seller walked plus two-hop cluster funding graphs,
// paid via x402. Without X402_PAY_TO the route runs free and says so in a header.

import { NextResponse } from 'next/server';
import { withX402, x402ResourceServer } from '@x402/next';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { runRake } from '../../../src/report.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const PAY_TO = process.env.X402_PAY_TO;
const NETWORK = process.env.X402_NETWORK || 'eip155:8453'; // Base mainnet
const PRICE = process.env.X402_PRICE || '$0.05';
const FACILITATOR_URL = process.env.X402_FACILITATOR_URL || 'https://x402.org/facilitator';

async function deepHandler(req) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token')?.trim();
  const hours = Math.min(24, Math.max(1, Number(searchParams.get('hours') || 4)));
  if (!/^0x[0-9a-fA-F]{40}$/.test(token ?? '')) {
    return NextResponse.json({ error: 'token must be a Base token address (0x…, 40 hex chars)' }, { status: 400 });
  }
  const wallet = searchParams.get('wallet')?.trim() || undefined;
  if (wallet && !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.json({ error: 'wallet must be a valid address' }, { status: 400 });
  }

  const report = await runRake(token, {
    hours,
    wallet,
    llm: false, // deterministic JSON for machine callers; the webapp has the analyst
    fundingCap: 1000,
    deep: true,
    onProgress: () => {},
  });
  return NextResponse.json({ tier: 'deep-pass', ...report });
}

let handler;
if (PAY_TO) {
  const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
  const resourceServer = new x402ResourceServer(facilitator).register(NETWORK, new ExactEvmScheme());
  handler = withX402(
    deepHandler,
    {
      accepts: { scheme: 'exact', price: PRICE, network: NETWORK, payTo: PAY_TO, maxTimeoutSeconds: 300 },
      description:
        'RAKE deep pass: full funding walk of every eligible seller plus two-hop funding graphs on cluster funders. Deterministic receipt JSON.',
      mimeType: 'application/json',
    },
    resourceServer,
  );
} else {
  handler = async (req) => {
    const res = await deepHandler(req);
    res.headers.set('x-rake-deeppass', 'dev-mode-unpaid: set X402_PAY_TO to enable x402 payment');
    return res;
  };
}

export const GET = handler;
