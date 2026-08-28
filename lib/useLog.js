'use client';

// The public log, fetched once and shared by ticker + leaderboard.

import { useEffect, useState } from 'react';
import { LOG_RAW_URL } from './links.js';

let cache = null;

export function useLogEvents() {
  const [data, setData] = useState(cache ?? { rows: [], checked: 0 });
  useEffect(() => {
    if (cache) return;
    fetch(LOG_RAW_URL)
      .then((r) => r.text())
      .then((text) => {
        const events = text.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
        const latest = {};
        for (const e of events) latest[e.token] = e;
        cache = {
          rows: Object.values(latest)
            .filter((e) => e.status === 'OK' && e.rakePct != null)
            .sort((a, b) => b.rakePct - a.rakePct)
            .slice(0, 10),
          checked: events.filter((e) => e.checked).length,
        };
        setData(cache);
      })
      .catch(() => {});
  }, []);
  return data;
}
