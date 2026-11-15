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
        const key = `${view.phase}:${view.round}:${p?.done}:${view.you.alive}:${view.you.private?.submitted}`;
        if (key === lastKey) return;
        lastKey = key;
        clearTimeout(timer);
        if (!view.you.alive) return;
        if (view.phase === 'reveal') {
          timer = setTimeout(() => client.send('ready'), delay());
        } else if ((view.phase === 'night' || view.phase === 'vote') && p && !p.done) {
          timer = setTimeout(() => {
            if (view.phase === 'night') {
              const t = p.targets;
              client.send('nightPick', { targetId: p.required ? t[Math.floor(rand() * t.length)] : null });
            } else {
              const opts = [...p.targets, 'skip'];
              client.send('vote', { targetId: opts[Math.floor(rand() * opts.length)] });
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
