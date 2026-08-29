// One patrol pass for GitHub Actions: rake every watched pool, alert on crossings, exit.

import { tgApi, sendMessage, checkOnce, isBreach, isCalm, formatAlert, alertKeyboard } from '../src/watchcore.js';
import { storeEnabled, loadWatches, saveWatches } from '../src/watchstore.js';

const BOT = process.env.TELEGRAM_BOT_TOKEN;
const PUBLIC_URL = process.env.RAKE_PUBLIC_URL || 'http://localhost:3000';

// Missing optional config is a skip, not a failure: the scheduled run stays green.
if (!BOT || !storeEnabled()) {
  const missing = [
    !BOT && 'TELEGRAM_BOT_TOKEN',
    !process.env.UPSTASH_REDIS_REST_URL && 'UPSTASH_REDIS_REST_URL',
    !process.env.UPSTASH_REDIS_REST_TOKEN && 'UPSTASH_REDIS_REST_TOKEN',
  ].filter(Boolean);
  console.log(`patrol skipped - watch storage not configured (missing: ${missing.join(', ')})`);
  process.exit(0);
}

const tg = tgApi(BOT);
const watches = await loadWatches();
console.log(`patrol: ${watches.length} watch(es)`);

for (const token of [...new Set(watches.map((w) => w.token))]) {
  let s;
  try {
    s = await checkOnce(token);
  } catch (err) {
    console.error(`patrol ${token}: ${err.message}`);
    continue;
  }
  if (s.rakePct == null) continue;
  for (const w of watches.filter((w) => w.token === token)) {
    if (isBreach(s, w.threshold) && w.armed && s.status === 'OK') {
      w.armed = false;
      await sendMessage(tg, w.chatId, formatAlert(s, token, PUBLIC_URL), alertKeyboard(PUBLIC_URL, token));
      console.log(`alerted chat ${w.chatId}: ${s.symbol} rake ${s.rakePct?.toFixed(1)}%`);
    } else if (!isBreach(s, w.threshold) && !w.armed && isCalm(s, w.threshold)) {
      w.armed = true;
    }
  }
}

await saveWatches(watches);
console.log('patrol done');
