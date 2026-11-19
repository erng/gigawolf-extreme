// Prints the muted-vs-talking comparison written by muted.js.
//   node tools/balance/mutedreport.js out-low.json out-mid.json ...
// vill / wolf = the player's side. Death % = share of those players who die during the game (night + vote).
import fs from 'fs';
const pct = (x, tot) => (tot ? (100 * x / tot).toFixed(1) : '-').padStart(5);
for (const f of process.argv.slice(2)) {
  const { regime, res } = JSON.parse(fs.readFileSync(f, 'utf8'));
  console.log(`\n== skill=${regime} (N=${Object.values(res)[0].N} per cell) ==`);
  console.log('n  scen  village%  d%  |  muted vill: night vote total  | talk vill: night vote total  | muted wolf voted out | talk wolf voted out');
  for (const [key, v] of Object.entries(res)) {
    const [n, scen] = key.split('/');
    const g = v.groups; const mv = g.muted_vill; const tv = g.talk_vill; const mw = g.muted_wolf; const tw = g.talk_wolf;
    const base = res[`${n}/base`].village;
    const d = 100 * (v.village - base);
    const row = (x) => (x ? `${pct(x.night, x.players)} ${pct(x.vote, x.players)} ${pct(x.night + x.vote, x.players)}` : '    -     -     -');
    console.log(`${n.padStart(2)} ${scen.padEnd(5)} ${(100 * v.village).toFixed(1).padStart(7)} ${(d >= 0 ? '+' : '') + d.toFixed(1)}`.padEnd(30)
      + ` | ${row(mv)}      | ${row(tv)}      | ${mw ? pct(mw.vote, mw.players) : '    -'}               | ${tw ? pct(tw.vote, tw.players) : '    -'}`);
  }
}
console.log('\n(Per-player rates have a standard error of about 0.3 points for talkers and 0.5 to 1 for muted players; differences under ~1.5 are noise.)');
