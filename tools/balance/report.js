// Village win-rate change (percentage points) vs the no-event baseline, per table size.
import fs from 'fs';
const files = process.argv.slice(2);
for (const f of files) {
  const { regime, reveal, trust, res } = JSON.parse(fs.readFileSync(f, 'utf8'));
  console.log(`\n== skill=${regime} reveal=${reveal} trust=${trust} ==`);
  const sizes = Object.keys(res.base);
  console.log('event'.padEnd(18) + sizes.map((n) => `n=${n}`.padStart(8)).join('') + '   avg   days  fired');
  console.log('baseline %'.padEnd(18) + sizes.map((n) => (100 * res.base[n].village).toFixed(1).padStart(8)).join(''));
  for (const [ev, by] of Object.entries(res)) {
    if (ev === 'base') continue;
    const d = sizes.map((n) => 100 * (by[n].village - res.base[n].village));
    const avg = d.reduce((a, b) => a + b, 0) / d.length;
    const days = sizes.reduce((a, n) => a + by[n].days - res.base[n].days, 0) / sizes.length;
    const fired = sizes.reduce((a, n) => a + by[n].fired, 0) / sizes.length;
    const flag = Math.max(...d.map(Math.abs)) > 5 ? ' RED' : Math.max(...d.map(Math.abs)) > 2.5 ? ' amber' : '';
    console.log(ev.padEnd(18) + d.map((x) => ((x >= 0 ? '+' : '') + x.toFixed(1)).padStart(8)).join('') + ((avg >= 0 ? '+' : '') + avg.toFixed(1)).padStart(7) + ((days >= 0 ? '+' : '') + days.toFixed(2)).padStart(7) + `${(100 * fired).toFixed(0)}%`.padStart(6) + flag);
  }
}
console.log('\n(SE of each cell about 0.5 points at 20,000 games; differences under ~1.5 are noise)');
