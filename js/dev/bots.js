// Fake players for testing. Each bot is a real Client on a host loopback connection,
// so it goes through exactly the same code path as a human's phone.
import { Client } from '../net/client.js';

// What a bot does with the view it was just given: { kind, extra } to send, null to do nothing,
// or 'wait' (a Witch before the wolves have chosen: look again later). `pick(arr)` chooses at random.
export function botAction(view, pick) {
  const p = view.prompt;
  if (view.phase === 'shot') { // a dead hunter shoots
    return p?.kind === 'shoot' ? { kind: 'shoot', extra: { targetId: pick(p.targets) } } : null;
  }
  if (!view.you.alive) {
    if (view.phase === 'vote' && p?.haunt && !p.done) { // a dead Poltergeist may haunt once, or pass
      return { kind: 'vote', extra: { targetId: pick([...p.targets, 'skip', 'pass']) } };
    }
    return null;
  }
  if (view.phase === 'reveal') return { kind: 'ready', extra: {} };
  if ((view.phase === 'night' || view.phase === 'vote') && p && !p.done) {
    if (p.kind === 'witch') {
      if (p.healTargets === null) return 'wait'; // wait until the wolves have chosen
      const opts = ['pass'];
      if (p.healTargets.length) opts.push(`heal:${pick(p.healTargets)}`);
      if (p.canPoison && p.targets.length) opts.push(`poison:${pick(p.targets)}`);
      return { kind: 'nightPick', extra: { targetId: pick(opts) } };
    }
    if (view.phase === 'night') {
      const t = p.targets;
      if (!p.required) return { kind: 'nightPick', extra: { targetId: null } };
      const first = pick(t);
      const extra = p.picks === 2 ? { targetId2: pick(t.filter((x) => x !== first)) } : {};
      return { kind: 'nightPick', extra: { targetId: first, ...extra } };
    }
    return { kind: 'vote', extra: { targetId: pick([...p.targets, 'skip']) } };
  }
  return null;
}

// Test helper: bots as real Clients on host loopback connections, so they go through exactly the same
// code path as a human's phone. (The app itself uses the much lighter HostBots in js/net/hostbots.js.)
export function addBots(host, count, { minDelay = 600, maxDelay = 2500, rand = Math.random, namePrefix = 'Bot' } = {}) {
  const bots = [];
  for (let i = 1; i <= count; i++) {
    const delay = () => minDelay + rand() * (maxDelay - minDelay);
    let timer = null; let lastKey = null;
    const client = new Client({
      playerId: `cbot-${i}`,
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
        const a = botAction(view, pick);
        if (a && a !== 'wait') timer = setTimeout(() => client.send(a.kind, a.extra), delay());
      },
    });
    client.start();
    bots.push(client);
  }
  return bots;
}
