// SSE endpoint: streams the live trace, then the full receipt.

import { runRake } from '../../../src/report.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // engine runs are RPC-bound; give them room on Vercel

const cache = new Map(); // per-instance; good enough to absorb demo traffic bursts
const CACHE_TTL_MS = 10 * 60 * 1000;
let running = 0;
const MAX_CONCURRENT = 2;

const sseHeaders = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
};

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token')?.trim();
  const hours = Math.min(24, Math.max(1, Number(searchParams.get('hours') || 4)));
  const wallet = searchParams.get('wallet')?.trim() || undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let closed = false;
      const send = (event, data) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const finish = () => {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {}
        }
      };

      if (!/^0x[0-9a-fA-F]{40}$/.test(token ?? '')) {
        send('fatal', { message: 'Enter a valid Base token address (0x…, 40 hex chars).' });
        return finish();
      }
      if (wallet && !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
        send('fatal', { message: 'Wallet must be a valid address (0x…, 40 hex chars).' });
        return finish();
      }

      const key = `${token.toLowerCase()}|${hours}|${wallet?.toLowerCase() ?? ''}`;
      const hit = cache.get(key);
      if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
        send('progress', { message: 'serving cached receipt (≤10 min old)' });
        send('result', hit.report);
        return finish();
      }
      if (running >= MAX_CONCURRENT) {
        send('fatal', { message: 'RAKE is busy with other runs - try again in a minute.' });
        return finish();
      }

      running++;
      try {
        const report = await runRake(token, {
          hours,
          wallet,
          onProgress: (message) => send('progress', { message }),
        });
        cache.set(key, { ts: Date.now(), report });
        send('result', report);
      } catch (err) {
        send('fatal', { message: err.message });
      } finally {
        running--;
        finish();
      }
    },
  });

  return new Response(stream, { headers: sseHeaders });
}
