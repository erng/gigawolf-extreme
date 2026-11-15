// Fake players for testing. Each bot is a real Client on a host loopback connection,
// so it goes through exactly the same code path as a human's phone.
import { Client } from '../net/client.js';

export function addBots(host, count, { minDelay = 600, maxDelay = 2500, rand = Math.random, namePrefix = 'Bot' } = {}) {
  const bots = [];
  for (let i = 1; i <= count; i++) {
    const delay = () => minDelay + rand() * (maxDelay - minDelay);
    let timer = null; let lastKey = null;
    const client = new Client({
      playerId: `bot-${i}`,
      name: `${namePrefix} ${i}`,
      visibilityReconnect: false,
      connector: async () => host.attachLoopback(),
      onView: (view) => {
        const p = view.prompt;
        const key = [view.phase, view.round, p?.done, view.you.alive, view.you.private?.submitted,
          JSON.stringify(p?.healTargets), view.shooter?.id].join(':');
        if (key === lastKey) return;
        lastKey = key;
        clearTimeout(timer);
        const pick = (arr) => arr[Math.floor(rand() * arr.length)];
        if (view.phase === 'shot') { // a dead hunter shoots
          if (p?.kind === 'shoot') timer = setTimeout(() => client.send('shoot', { targetId: pick(p.targets) }), delay());
          return;
        }
        if (!view.you.alive) {
          if (view.phase === 'vote' && p?.haunt && !p.done) { // a dead Poltergeist may haunt once, or pass
            timer = setTimeout(() => client.send('vote', { targetId: pick([...p.targets, 'skip', 'pass']) }), delay());
          }
          return;
        }
        if (view.phase === 'reveal') {
          timer = setTimeout(() => client.send('ready'), delay());
        } else if ((view.phase === 'night' || view.phase === 'vote') && p && !p.done) {
          if (p.kind === 'witch') {
            if (p.healTargets === null) return; // wait until the wolves have chosen; the next view retriggers
            timer = setTimeout(() => {
              const opts = ['pass'];
              if (p.healTargets.length) opts.push(`heal:${pick(p.healTargets)}`);
              if (p.canPoison && p.targets.length) opts.push(`poison:${pick(p.targets)}`);
              client.send('nightPick', { targetId: pick(opts) });
            }, delay());
            return;
          }
          timer = setTimeout(() => {
            if (view.phase === 'night') {
              const t = p.targets;
              if (!p.required) { client.send('nightPick', { targetId: null }); return; }
              const first = pick(t);
              const extra = p.picks === 2 ? { targetId2: pick(t.filter((x) => x !== first)) } : {};
              client.send('nightPick', { targetId: first, ...extra });
            } else {
              const opts = [...p.targets, 'skip'];
              client.send('vote', { targetId: pick(opts) });
            }
          }, delay());
        }
      },
    });
    client.start();
    bots.push(client);
  }
  return bots;
}
