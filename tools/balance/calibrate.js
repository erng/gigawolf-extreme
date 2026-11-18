// How much should a sensible table trust an anonymous "X is a wolf"? Measure how often the named
// player really is a wolf, against what the table already believed, and turn that into a likelihood ratio.
import { playGame } from './model.js';
const odds = (p) => p / (1 - p);
const out = {};
for (const [ev, types] of [['letter', ['letterW', 'letterC']], ['letterSmart', ['letterSW', 'letterSC']], ['whispers', ['whisper']], ['lastwords', ['lwNight', 'lwVote']]]) {
  for (const reveal of [false, true]) {
    const calib = [];
    for (const n of [6, 8, 10, 12]) for (let s = 1; s <= 3000; s++) playGame({ n, event: ev, eventChance: 1, reveal, calib }, s * 31 + n);
    for (const t of types) {
      const xs = calib.filter((c) => c.type === t); if (!xs.length) continue;
      const hit = xs.filter((c) => c.isWolf).length / xs.length; const prior = xs.reduce((a, c) => a + c.prior, 0) / xs.length;
      const alpha = odds(hit) / odds(prior);
      (out[reveal ? 'reveal' : 'hidden'] ??= {})[t] = +alpha.toFixed(2);
      console.log(`${reveal ? 'reveal' : 'hidden'} ${t}: n=${xs.length} named player is a wolf ${(100 * hit).toFixed(1)}% vs table's prior ${(100 * prior).toFixed(1)}% -> trust x${alpha.toFixed(2)}`);
    }
  }
}
import('fs').then((fs) => fs.writeFileSync(new URL('./alpha.json', import.meta.url), JSON.stringify(out, null, 1)));
