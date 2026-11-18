import { playGame } from './model.js';
import fs from 'fs';
// Listener trust for pointing signals, written by calibrate.js.
const alphaCal = JSON.parse(fs.readFileSync(new URL('./alpha.json', import.meta.url), 'utf8'));
const GULLIBLE = { letterW: 3, letterC: 1 / 3, letterSW: 3, letterSC: 1 / 3, whisper: 3, lwNight: 3, lwVote: 3 };
const REG = { low: [0.1, 0.15], mid: [0.25, 0.35], high: [0.5, 0.6] };
const [regime, reveal, trust, N, out, evList] = [process.argv[2], process.argv[3] === 'reveal', process.argv[4], Number(process.argv[5]), process.argv[6], process.argv[7]];
const EVENTS = (evList ?? 'base,horseshoe,horseshoeClaimed,rumor,letter,seance,whispers,lastwords,lastwordsVote,secret,open,mayor,silence').split(',');
const [muPub, muPriv] = REG[regime];
const alpha = trust === 'gullible' ? GULLIBLE : alphaCal[reveal ? 'reveal' : 'hidden'];
const res = {};
for (const n of [6, 8, 10, 12]) for (const ev of EVENTS) {
  let v = 0, days = 0, fired = 0;
  for (let s = 1; s <= N; s++) {
    const g = playGame({ n, muPub, muPriv, reveal, alpha, event: ev === 'base' ? null : ev, eventChance: 1 }, s * 104729 + n);
    if (g.win === 'village') v++; days += g.days; if (g.fired) fired++;
  }
  (res[ev] ??= {})[n] = { village: v / N, days: days / N, fired: fired / N, N };
}
fs.writeFileSync(out, JSON.stringify({ regime, reveal, trust, res }, null, 1));
console.log('done', out);
