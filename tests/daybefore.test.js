// The Day Before: one talk round between the role reveal and the first night. Bots talk as on any day,
// humans talk in person, and the host starts night 1. No deaths, no news, no vote.
import test from 'node:test';
import assert from 'node:assert/strict';
import { reduce, PHASE } from '../js/game/engine.js';
import { viewFor } from '../js/game/views.js';
import { BotMind } from '../js/bots/mind.js';
import { Host } from '../js/net/host.js';
import { Client } from '../js/net/client.js';
import { createFakeNetwork } from '../js/dev/fakepeer.js';
import { createRng } from '../js/util/rng.js';
import { setLang, t } from '../js/i18n.js';
import { lobby, T0 } from './helpers.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SEER_KEYS = ['claimWolf', 'claimClean', 'reportWolf', 'reportClean', 'counter'];

// Host p0 plus bots bot-1.., roles forced by seat, standing in The Day Before.
function dayBefore(roles, { seed = 5, settings = {} } = {}) {
  const rng = createRng(seed);
  let s = lobby(1, rng);
  const step = (a) => { const r = reduce(s, { now: T0, ...a }, rng); if (r.error) throw new Error(r.error.message); s = r.state; return r; };
  step({ kind: 'setBots', by: 'p0', count: roles.length - 1 });
  step({ kind: 'settings', by: 'p0', patch: { randomEvents: false, ...settings } });
  step({ kind: 'startGame', by: 'p0' });
  s.players.forEach((p, i) => { p.role = roles[i]; p.potions = p.role === 'witch' ? { heal: true, poison: true } : null; });
  step({ kind: 'nextPhase', by: 'p0' });
  return { get s() { return s; }, rng, step, tryAct: (a) => reduce(s, { now: T0, ...a }, rng) };
}
const R6 = ['villager', 'werewolf', 'seer', 'bodyguard', 'villager', 'villager'];

test('the reveal leads to The Day Before (day, round 0), then the host starts night 1', () => {
  const g = dayBefore(R6);
  assert.equal(g.s.phase, PHASE.DAY);
  assert.equal(g.s.round, 0);
  assert.ok(g.s.players.every((p) => p.alive));
  assert.deepEqual(g.s.lines, []);
  assert.equal(g.tryAct({ kind: 'nextPhase', by: 'bot-1' }).error?.code, 'forbidden', 'only the host');
  g.step({ kind: 'nextPhase', by: 'p0' });
  assert.equal(g.s.phase, PHASE.NIGHT);
  assert.equal(g.s.round, 1);
});

test('there is no vote before the first night, and nothing is announced', () => {
  const g = dayBefore(R6);
  assert.equal(g.tryAct({ kind: 'startVote', by: 'p0' }).error?.code, 'badPhase');
  for (const p of g.s.players) {
    const v = viewFor(g.s, p.id);
    assert.equal(v.phase, 'day');
    assert.equal(v.round, 0);
    assert.deepEqual(v.announce, []);
    assert.equal(v.prompt, null);
    assert.equal(v.voteResult, undefined);
  }
});

test('later days still start the vote and still cannot be skipped to night', () => {
  const g = dayBefore(R6);
  g.step({ kind: 'nextPhase', by: 'p0' }); // night 1
  g.step({ kind: 'nextPhase', by: 'p0' }); // dawn
  assert.equal(g.s.round, 1);
  assert.equal(g.tryAct({ kind: 'nextPhase', by: 'p0' }).error?.code, 'badPhase', 'a normal day is left through the vote');
  g.step({ kind: 'startVote', by: 'p0' });
  assert.equal(g.s.phase, PHASE.VOTE);
});

test('bots can talk in The Day Before, with the same per-round cap, and dumb bots cannot', () => {
  const g = dayBefore(R6);
  const r = g.tryAct({ kind: 'botSay', by: 'bot-1', key: 'accuse', v: 0, ids: ['bot-2'] });
  assert.ok(!r.error);
  assert.deepEqual(r.state.chat.map((c) => c.round), [0]);
  const dumb = dayBefore(R6, { settings: { dumbBots: true } });
  assert.ok(dumb.tryAct({ kind: 'botSay', by: 'bot-1', key: 'filler', v: 0, ids: [] }).error);
});

test('removing a player in The Day Before works like on any day', () => {
  const g = dayBefore(R6);
  assert.equal(g.s.players.length, 6);
  const human = reduce(g.s, { kind: 'join', by: 'x', name: 'X', now: T0 }, g.rng); // lobby only: refused
  assert.equal(human.error?.code, 'gameStarted');
  g.s.players.push({ id: 'p9', name: 'Stuck', connected: false, role: 'villager', alive: true, ready: true, revealed: false, potions: null });
  g.step({ kind: 'kick', by: 'p0', targetId: 'p9' });
  assert.equal(g.s.phase, PHASE.DAY);
  assert.ok(g.s.lines.some((l) => l.startsWith('Stuck was removed')));
});

test('leak check: no bot of any role claims Seer or reports checks before the first night', () => {
  const roles = ['werewolf', 'seer', 'bodyguard', 'witch', 'villager', 'hunter', 'jester', 'wolfcub'];
  for (let seed = 1; seed <= 150; seed++) {
    const g = dayBefore(roles, { seed });
    for (let i = 0; i < roles.length; i++) {
      const id = i === 0 ? 'p0' : `bot-${i}`;
      if (id === 'p0') continue;
      const mind = new BotMind(id, ['sheep', 'hothead', 'quiet', 'detective'][seed % 4], createRng(seed * 31 + i));
      for (const moment of ['day', 'reply', 'day', 'reply']) {
        const line = mind.talk(viewFor(g.s, id), moment);
        if (line) assert.ok(!SEER_KEYS.includes(line.key), `${roles[i]} said ${line.key} on day 0`);
      }
    }
  }
});

test('host-run bots talk during The Day Before, and dumb bots stay silent', async () => {
  for (const dumbBots of [false, true]) {
    const net = createFakeNetwork();
    const host = new Host({ Peer: net.Peer, hostPlayerId: 'hostplayer', peerOptions: {}, botDelays: { minDelay: 1, maxDelay: 12 } });
    await host.start();
    let view = null;
    const client = new Client({ playerId: 'hostplayer', name: 'Hosty', visibilityReconnect: false, connector: async () => host.attachLoopback(), onView: (v) => { view = v; } });
    client.start();
    while (!view) await sleep(2);
    host.setBots(8);
    host.apply({ kind: 'settings', by: 'hostplayer', patch: { dumbBots, randomEvents: false } });
    while (view.players.length < 9) await sleep(2);
    client.send('startGame');
    while (view.phase !== 'reveal') await sleep(2);
    client.send('nextPhase');
    while (view.phase !== 'day') await sleep(2);
    assert.equal(view.round, 0);
    const until = Date.now() + 4000;
    while (!view.chat.length && Date.now() < until) await sleep(20);
    await sleep(300);
    if (dumbBots) assert.equal(view.chat.length, 0, 'dumb bots never talk');
    else {
      assert.ok(view.chat.length > 0, 'smart bots talk');
      assert.ok(view.chat.every((c) => c.round === 0 && !SEER_KEYS.includes(c.key)));
    }
    assert.equal(view.phase, 'day', 'the talk never advances the game by itself');
    host.close();
  }
});

test('the Day Before has Thai text, and the reveal button now starts the discussion', () => {
  for (const lang of ['en', 'th']) {
    setLang(lang);
    for (const k of ['day.title0', 'day.sub0', 'host.startTalk']) assert.notEqual(t(k), k, `${k} in ${lang}`);
  }
  setLang('en');
  assert.equal(t('day.title0'), 'The Day Before');
  assert.notEqual(t('day.title0'), (setLang('th'), t('day.title0')));
  setLang('en');
});
