// Watch state in Upstash Redis (free REST API): serverless webhook and Action patrol share it.

const url = () => process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '');
const token = () => process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = 'rake:watches';

export const storeEnabled = () => Boolean(url() && token());

async function redis(cmd) {
  const r = await fetch(`${url()}/${cmd.map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!r.ok) throw new Error(`Upstash ${r.status}`);
  return (await r.json()).result;
}

export async function loadWatches() {
  const raw = await redis(['GET', KEY]);
  return raw ? JSON.parse(raw) : [];
}

export async function saveWatches(watches) {
  await redis(['SET', KEY, JSON.stringify(watches)]);
}
