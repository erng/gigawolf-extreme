import test from 'node:test';
import assert from 'node:assert/strict';
import { reduce, PHASE } from '../js/game/engine.js';
import { MAX_BOTS, MAX_HUMANS, isBotId } from '../js/game/setup.js';
import { Host } from '../js/net/host.js';
import { Client } from '../js/net/client.js';
import { createFakeNetwork } from '../js/dev/fakepeer.js';
import { lobby, T0 } from './helpers.js';
import { createRng } from '../js/util/rng.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (fn()) return; await sleep(5); }
  throw new Error('timeout waiting for condition');
};

test('setBots: host only, lobby only, 0..MAX_BOTS, replaces the old bots', () => {
  const rng = createRng(1);
  const s0 = lobby(3, rng);
  const set = (s, by, count) => reduce(s, { kind: 'setBots', by, count, now: T0 }, rng);
  assert.equal(set(s0, 'p1', 5).error?.code, 'forbidden');
  assert.equal(set(s0, 'p0', MAX_BOTS + 1).error?.code, 'badBots');
  assert.equal(set(s0, 'p0', -1).error?.code, 'badBots');
  assert.equal(set(s0, 'p0', 1.5).error?.code, 'badBots');
  let s = set(s0, 'p0', 7).state;
  assert.equal(s.players.length, 10);
  assert.deepEqual(s.players.slice(0, 3).map((p) => p.id), ['p0', 'p1', 'p2'], 'humans keep their seats');
  assert.deepEqual(s.players[3], { id: 'bot-1', name: 'Bot 1', connected: true, role: null, alive: true, ready: false, revealed: false, potions: null });
  s = set(s, 'p0', 2).state;
  assert.deepEqual(s.players.map((p) => p.id), ['p0', 'p1', 'p2', 'bot-1', 'bot-2']);
  s = set(s, 'p0', 0).state;
  assert.equal(s.players.length, 3);
  s = set(s0, 'p0', MAX_BOTS).state;
  assert.equal(s.players.length, 3 + MAX_BOTS);
  const started = reduce(set(s0, 'p0', 4).state, { kind: 'startGame', by: 'p0', now: T0 }, rng);
  assert.equal(started.state.phase, PHASE.REVEAL);
  assert.equal(set(started.state, 'p0', 1).error?.code, 'badPhase');
});

test('the 15-human limit still holds, and bots do not use up human seats', () => {
  const rng = createRng(1);
  let s = lobby(MAX_HUMANS, rng);
  s = reduce(s, { kind: 'setBots', by: 'p0', count: MAX_BOTS, now: T0 }, rng).state;
  assert.equal(reduce(s, { kind: 'join', by: 'late', name: 'Late', now: T0 }, rng).error?.code, 'roomFull');
  let t = lobby(MAX_HUMANS - 1, rng);
  t = reduce(t, { kind: 'setBots', by: 'p0', count: MAX_BOTS, now: T0 }, rng).state;
  assert.ok(!reduce(t, { kind: 'join', by: 'late', name: 'Late', now: T0 }, rng).error, 'the 15th human still fits next to bots');
});

test('a full 20-bot lobby is valid and starts', () => {
  const rng = createRng(2);
  let s = lobby(1, rng);
  s = reduce(s, { kind: 'setBots', by: 'p0', count: MAX_BOTS, now: T0 }, rng).state;
  for (const randomize of [false, true]) {
    const t = reduce(s, { kind: 'settings', by: 'p0', patch: randomize ? { randomize: true } : { counts: null }, now: T0 }, rng).state;
    const r = reduce(t, { kind: 'startGame', by: 'p0', now: T0 }, rng);
    assert.ok(!r.error, r.error?.message);
    assert.equal(r.state.players.length, 1 + MAX_BOTS);
    assert.equal(new Set(r.state.players.map((p) => p.id)).size, 1 + MAX_BOTS);
  }
});

async function runBotGame(botCount, settings = {}) {
  const net = createFakeNetwork();
  const host = new Host({ Peer: net.Peer, hostPlayerId: 'hostplayer', peerOptions: {}, botDelays: { minDelay: 1, maxDelay: 20 } });
  await host.start();
  const h = { view: null };
  h.client = new Client({ playerId: 'hostplayer', name: 'Hosty', visibilityReconnect: false, connector: async () => host.attachLoopback(), onView: (v) => { h.view = v; } });
  h.client.start();
  await until(() => h.view);
  host.setBots(botCount);
  if (Object.keys(settings).length) host.apply({ kind: 'settings', by: 'hostplayer', patch: settings });
  await until(() => h.view.players.length === botCount + 1);
  assert.ok(h.view.players.filter((p) => isBotId(p.id)).length === botCount);
  h.client.send('startGame');
  await until(() => h.view.phase === 'reveal');
  // The host (a human here) plays too, like the real host UI: it is the only one who taps through phases.
  const deadline = Date.now() + 60000;
  while (h.view.phase !== 'gameover') {
    if (Date.now() > deadline) throw new Error(`stuck in ${h.view.phase} round ${h.view.round}`);
    const v = h.view; const p = v.prompt;
    if (v.phase === 'reveal') { if (!v.players.find((x) => x.id === v.you.id).ready) h.client.send('ready'); if (v.progress.done === v.progress.total) h.client.send('nextPhase'); }
    else if (v.phase === 'night') { if (p && !p.done && v.you.alive) h.client.send('nightPick', { targetId: p.required ? p.targets[0] : null }); else if (v.progress.done >= v.progress.total - 0) h.client.send('nextPhase'); }
    else if (v.phase === 'day') h.client.send('startVote');
    else if (v.phase === 'vote') { if (v.voteResult) h.client.send('nextPhase'); else if (p?.kind === 'vote' && !p.done) h.client.send('vote', { targetId: 'skip' }); else if (v.progress && v.progress.done >= v.progress.total) h.client.send('nextPhase'); }
    else if (v.phase === 'shot') { if (v.prompt?.kind === 'shoot') h.client.send('shoot', { targetId: p.targets[0] }); else if (v.isHost) h.client.send('nextPhase'); }
    await sleep(25);
  }
  const winner = h.view.winner;
  host.close();
  return { winner, rounds: h.view.round };
}

test('host-run bots play a whole game (host + 9 bots)', async () => {
  const r = await runBotGame(9);
  assert.ok(r.winner, 'someone won');
});

test('host-run bots play a whole game with random chaos (host + 20 bots)', async () => {
  const r = await runBotGame(20, { randomize: true });
  assert.ok(r.winner);
});
