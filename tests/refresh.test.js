import test from 'node:test';
import assert from 'node:assert/strict';
import { refetchAll } from '../js/util/refresh.js';

const BASE = 'https://example.test/game/';
const u = (p) => new URL(p, BASE).href;
// A fake site: main imports 22 modules, each of those imports 1 shared leaf, and a.js also imports its sibling.
const FILES = { 'js/main.js': Array.from({ length: 22 }, (_, i) => `import { x } from './m${i}.js';`).join('\n') + "\nimport('./lazy.js');" };
for (let i = 0; i < 22; i++) FILES[`js/m${i}.js`] = `import { y } from './util/leaf.js';\nexport { z } from "./m${(i + 1) % 22}.js";`;
FILES['js/util/leaf.js'] = 'export const y = 1;';
FILES['js/lazy.js'] = 'export const q = 1;';
FILES['css/style.css'] = '@import url("./no.css");';
FILES['index.html'] = '<html></html>';

function fakeFetch({ delay = 20, hang = null } = {}) {
  const calls = []; let inflight = 0; let peak = 0;
  const fn = async (url, opts) => {
    calls.push({ url, cache: opts.cache });
    inflight++; peak = Math.max(peak, inflight);
    try {
      await new Promise((res, rej) => {
        const done = setTimeout(res, delay);
        opts.signal?.addEventListener('abort', () => { clearTimeout(done); rej(new Error('aborted')); });
        if (url === hang) { clearTimeout(done); } // never answers, only the signal ends it
      });
    } finally { inflight--; }
    const path = url.slice(BASE.length);
    if (!(path in FILES)) return { ok: false, text: async () => '' };
    return { ok: true, text: async () => FILES[path] };
  };
  return { fn, calls, peak: () => peak };
}

test('force refresh asks for every file once, bypassing the cache, level by level at the same time', async () => {
  const f = fakeFetch();
  const t0 = Date.now();
  const urls = await refetchAll([u('js/main.js'), u('css/style.css'), u('index.html'), u('')], { fetchFn: f.fn, signal: new AbortController().signal });
  const took = Date.now() - t0;
  assert.equal(f.calls.length, new Set(f.calls.map((c) => c.url)).size, 'no file twice');
  assert.equal(f.calls.length, urls.length);
  assert.ok(f.calls.every((c) => c.cache === 'reload'));
  for (const p of ['js/main.js', 'css/style.css', 'index.html', '', 'js/lazy.js', 'js/util/leaf.js', 'js/m0.js', 'js/m21.js']) assert.ok(urls.includes(u(p)), p);
  assert.equal(f.calls.length, 4 + 22 + 1 + 1, 'entries, 22 modules, the shared leaf, the lazy import');
  assert.ok(f.peak() >= 20, `a level goes out at once (peak ${f.peak()})`);
  assert.ok(took < 20 * 8, `about one delay per level, not per file (${took} ms)`);
});

test('a request that never answers ends at the deadline and the rest still finishes', async () => {
  const f = fakeFetch({ hang: u('js/m3.js') });
  const t0 = Date.now();
  const stop = new AbortController(); setTimeout(() => stop.abort(), 150); // AbortSignal.timeout's timer is unref'd and would let Node exit early
  const urls = await refetchAll([u('js/main.js')], { fetchFn: f.fn, signal: stop.signal });
  const took = Date.now() - t0;
  assert.ok(took >= 140 && took < 600, `stopped at the deadline (${took} ms)`);
  assert.ok(urls.includes(u('js/m0.js')), 'the other files of that level were asked for');
});

test('a failed or missing file is skipped without throwing', async () => {
  const f = fakeFetch();
  const urls = await refetchAll([u('nope.js'), u('js/lazy.js')], { fetchFn: f.fn, signal: new AbortController().signal });
  assert.deepEqual(urls.sort(), [u('js/lazy.js'), u('nope.js')].sort());
  await assert.doesNotReject(refetchAll([u('js/main.js')], { fetchFn: async () => { throw new Error('offline'); }, signal: new AbortController().signal }));
});
