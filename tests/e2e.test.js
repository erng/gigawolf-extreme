// End-to-end headless games: real Host + real Clients (bots) over the in-memory fake PeerJS.
// The host's own phone is driven like a human host: it plays its role and presses every advance button.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Host } from '../js/net/host.js';
import { Client } from '../js/net/client.js';
import { addBots } from '../js/dev/bots.js';
import { createFakeNetwork } from '../js/dev/fakepeer.js';
import { createRng } from '../js/util/rng.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function playGame({ n, counts, seed }) {
  const net = createFakeNetwork();
  const host = new Host({ Peer: net.Peer, hostPlayerId: 'hostplayer', peerOptions: {}, seed });
  await host.start();
  const me = { view: null, errors: [] };
  const client = new Client({
    playerId: 'hostplayer', name: 'Hosty', visibilityReconnect: false,
    connector: async () => host.attachLoopback(),
    onView: (v) => { me.view = v; }, onError: (e) => me.errors.push(e),
  });
  client.start();
  const rng = createRng(seed);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const bots = addBots(host, n - 1, { minDelay: 1, maxDelay: 6, rand: createRng(seed + 1) });
  const wait = async (fn, ms = 5000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timeout'); await sleep(2); } };

  await wait(() => me.view?.players.length === n);
  client.send('settings', { patch: { counts } });
  await wait(() => JSON.stringify(me.view.settings.counts) === JSON.stringify({ ...counts }));
  assert.ok(me.view.setup.ok, me.view.setup.errors.join(' '));
  client.send('startGame');

  const seen = new Set(); const phases = new Set();
  const once = (key, fn) => { if (seen.has(key)) return; seen.add(key); fn(); };
  const start = Date.now();
  while (me.view.phase !== 'gameover') {
    if (Date.now() - start > 30000) throw new Error(`stuck in ${me.view.phase} round ${me.view.round} ${JSON.stringify(me.view.progress)}`);
    const v = me.view; const p = v.prompt; const r = v.round; phases.add(v.phase);
    const id = `${v.phase}:${r}:${v.vote ? 1 : 0}`;
    if (v.phase === 'reveal') {
      once('ready', () => client.send('ready'));
      if (v.progress.done === v.progress.total) once(`start`, () => client.send('nextPhase'));
    } else if (v.phase === 'night') {
      if (v.you.alive && p && !p.done) {
        if (p.kind === 'witch') {
          if (p.healTargets !== null) once(`w${r}`, () => client.send('nightPick', { targetId: p.healTargets.length ? `heal:${p.healTargets[0]}` : 'pass' }));
        } else if (!p.required) once(`n${r}`, () => client.send('nightPick', { targetId: null }));
        else once(`n${r}`, () => {
          const a = pick(p.targets);
          client.send('nightPick', { targetId: a, ...(p.picks === 2 ? { targetId2: pick(p.targets.filter((x) => x !== a)) } : {}) });
        });
      }
      if (v.progress.done === v.progress.total) once(`dawn${r}`, () => client.send('nextPhase'));
    } else if (v.phase === 'day') {
      await sleep(3);
      once(`day${r}`, () => client.send(r === 0 ? 'nextPhase' : 'startVote'));
    } else if (v.phase === 'vote') {
      if (v.voteResult) once(`res${r}`, () => client.send('nextPhase'));
      else if (!v.you.alive && p?.haunt && !p.done) once(`h${r}`, () => client.send('vote', { targetId: pick([...p.targets, 'skip', 'pass']) }));
      else if (v.you.alive && p && !p.done) once(`v${r}`, () => client.send('vote', { targetId: pick([...p.targets, 'skip']) }));
    } else if (v.phase === 'shot') {
      if (p?.kind === 'shoot') once(`shot${r}${v.shooter.id}`, () => client.send('shoot', { targetId: pick(p.targets) }));
      else await sleep(20); // a bot hunter is aiming
    }
    // Revisit a step if the game moved on to a state that needs the same action again (e.g. second shot).
    if (v.phase === 'shot' && p?.kind !== 'shoot') seen.delete(`shot${r}${v.shooter?.id}`);
    await sleep(2);
  }
  const final = me.view;
  assert.deepEqual(me.errors, [], 'host client got no errors');
  assert.ok(['village', 'wolves', 'jester'].includes(final.winner));
  assert.equal(final.roles.length, n);
  // every player sees the same ending
  for (const b of bots) assert.equal(b.view?.winner ?? final.winner, final.winner);
  bots.forEach((b) => b.stop());
  client.stop(); host.close();
  return { winner: final.winner, rounds: final.round, phases };
}

const ALL = { wolves: 1, wolfcub: 1, seer: 1, bodyguard: 1, hunter: 1, witch: 1, prince: 1, diseased: 1, apprentice: 1, poltergeist: 1, jester: 1, villagers: 0 };
const withVillagers = (c, n) => ({ ...c, villagers: n - Object.entries(c).filter(([k]) => k !== 'villagers').reduce((s, [, v]) => s + v, 0) });

test('e2e: full games over the network with every new role in play', async () => {
  const results = [];
  for (const [i, n] of [11, 12, 13, 14, 15].entries()) {
    for (let k = 0; k < 4; k++) {
      results.push(await playGame({ n, counts: withVillagers(ALL, n), seed: 1000 + i * 10 + k }));
    }
  }
  console.log('e2e results', results.map((r) => `${r.winner}/${r.rounds}`).join(' '));
  assert.ok(results.every((r) => r.phases.has('night') && r.phases.has('vote')));
  assert.ok(results.some((r) => r.phases.has('shot')), 'at least one hunter shot over the wire');
});

test('e2e: classic 5-player game still works with default roles', async () => {
  const counts = { wolves: 1, wolfcub: 0, seer: 1, bodyguard: 1, hunter: 0, witch: 0, prince: 0, diseased: 0, apprentice: 0, poltergeist: 0, jester: 0, villagers: 2 };
  for (let k = 0; k < 3; k++) {
    const r = await playGame({ n: 5, counts, seed: 50 + k });
    assert.ok(['village', 'wolves'].includes(r.winner));
  }
});
