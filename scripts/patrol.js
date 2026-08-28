// One patrol pass for GitHub Actions: rake every watched pool, alert on crossings, exit.

import { tgApi, sendMessage, checkOnce, isBreach, isCalm, formatAlert } from '../src/watchcore.js';
import { storeEnabled, loadWatches, saveWatches } from '../src/watchstore.js';

const BOT = process.env.TELEGRAM_BOT_TOKEN;
const PUBLIC_URL = process.env.RAKE_PUBLIC_URL || 'http://localhost:3000';

if (!BOT || !storeEnabled()) {
  console.error('Needs TELEGRAM_BOT_TOKEN + UPSTASH_REDIS_REST_URL/TOKEN.');
  process.exit(1);
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
      await sendMessage(tg, w.chatId, formatAlert(s, token, PUBLIC_URL));
      console.log(`alerted chat ${w.chatId}: ${s.symbol} rake ${s.rakePct?.toFixed(1)}%`);
    } else if (!isBreach(s, w.threshold) && !w.armed && isCalm(s, w.threshold)) {
      w.armed = true;
    }
  }
}

await saveWatches(watches);
console.log('patrol done');
