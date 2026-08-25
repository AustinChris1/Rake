export const usd = (n) => '$' + Math.round(n).toLocaleString('en-US');
export const short = (a) => (a?.length > 12 ? a.slice(0, 6) + '…' + a.slice(-4) : a);
export const addrUrl = (a) => `https://basescan.org/address/${a}`;
export const txUrl = (h) => `https://basescan.org/tx/${h}`;
export const isAddress = (s) => /^0x[0-9a-fA-F]{40}$/.test(s ?? '');
