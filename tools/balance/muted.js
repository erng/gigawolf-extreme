// Do muted players die more often? Compares muted and talking players in the same games.
//   node tools/balance/muted.js <low|mid|high> <games per cell> <out.json>
// Scenarios per table size n: base (nobody muted), s1/d1 (one silent / dumb player), sH/dH (half the table).
// 'silent' = no day tells, no claims, but still reasons and votes; 'dumb' = also random votes and checks.
import { playGame } from './model.js';
import fs from 'fs';
const alphaCal = JSON.parse(fs.readFileSync(new URL('./alpha.json', import.meta.url), 'utf8'));
const REG = { low: [0.1, 0.15], mid: [0.25, 0.35], high: [0.5, 0.6] };
const [regime, N, out] = [process.argv[2], Number(process.argv[3]), process.argv[4]];
const [muPub, muPriv] = REG[regime];
const alpha = alphaCal.hidden;
const SCEN = {
  base: () => ({ muted: 0 }),
  s1: () => ({ muted: 1, muteMode: 'silent' }),
  d1: () => ({ muted: 1, muteMode: 'dumb' }),
  sH: (n) => ({ muted: Math.floor(n / 2), muteMode: 'silent' }),
  dH: (n) => ({ muted: Math.floor(n / 2), muteMode: 'dumb' }),
};
const res = {};
for (const n of [6, 8, 10, 12]) for (const [name, mk] of Object.entries(SCEN)) {
  const o = mk(n);
  const g = { village: 0, days: 0 };
  // per group (muted/talk) x side (vill/wolf): players seen, died by night, died by vote
  const c = {}; const cell = (k) => (c[k] ??= { players: 0, night: 0, vote: 0 });
  for (let s = 1; s <= N; s++) {
    const r = playGame({ n, muPub, muPriv, reveal: false, alpha, event: null, ...o }, s * 104729 + n);
    if (r.win === 'village') g.village++; g.days += r.days;
    const died = new Map(r.deaths.map(([j, cause]) => [j, cause]));
    for (let j = 0; j < n; j++) {
      const k = `${j < (o.muted ?? 0) ? 'muted' : 'talk'}_${r.wolf[j] ? 'wolf' : 'vill'}`;
      const x = cell(k); x.players++;
      const cause = died.get(j); if (cause === 'night') x.night++; else if (cause === 'vote') x.vote++;
    }
  }
  res[`${n}/${name}`] = { n, scen: name, village: g.village / N, days: g.days / N, N, groups: c };
}
fs.writeFileSync(out, JSON.stringify({ regime, res }, null, 1));
console.log('done', out);
