// Force refresh: re-download every file the page loads, bypassing the HTTP cache, so a plain reload
// can't reuse stale JS or CSS. Starts from a few entry files and follows each module's imports one
// level at a time, fetching every file in a level at the same time. The import graph is only a few
// levels deep, so this takes a handful of round trips, not one per file. A shared signal ends every
// request still running when time is up. Resolves with the URLs it asked for; never throws.
export const REFRESH_TIMEOUT_MS = 10_000;
const IMPORT_RE = /(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;

export function timeoutSignal(ms) {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; // older browsers
}

export async function refetchAll(entries, { fetchFn = fetch, signal = timeoutSignal(REFRESH_TIMEOUT_MS) } = {}) {
  const seen = new Set(entries);
  let level = [...seen];
  while (level.length) {
    const next = [];
    await Promise.all(level.map(async (url) => {
      try {
        const res = await fetchFn(url, { cache: 'reload', signal });
        if (!res.ok || !url.endsWith('.js')) return;
        const src = await res.text();
        for (const m of src.matchAll(IMPORT_RE)) {
          const dep = new URL(m[1], url).href;
          if (!seen.has(dep)) { seen.add(dep); next.push(dep); }
        }
      } catch { /* timed out, offline or one bad file: skip it, the reload goes ahead */ }
    }));
    if (signal.aborted) break;
    level = next;
  }
  return [...seen];
}
