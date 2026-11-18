import { playGame } from './model.js';
const [n, N, ev, muPub, muPriv] = [Number(process.argv[2]), Number(process.argv[3]), process.argv[4] === '-' ? null : process.argv[4], Number(process.argv[5] ?? 0.25), Number(process.argv[6] ?? 0.35)];
const t0 = Date.now(); let v = 0, days = 0, fired = 0, stall = 0;
for (let s = 1; s <= N; s++) { const g = playGame({ n, event: ev, muPub, muPriv }, s * 7919 + n); if (g.win === 'village') v++; if (g.win === 'stall') stall++; days += g.days; if (g.fired) fired++; }
console.log(`n=${n} ev=${ev} village=${(100 * v / N).toFixed(1)}% days=${(days / N).toFixed(2)} fired=${(100 * fired / N).toFixed(0)}% stall=${stall} ${Date.now() - t0}ms`);
