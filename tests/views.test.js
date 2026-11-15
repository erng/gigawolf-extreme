import test from 'node:test';
import assert from 'node:assert/strict';
import { PHASE, nightTargets } from '../js/game/engine.js';
import { viewFor } from '../js/game/views.js';
import { createRng } from '../js/util/rng.js';
import { presetFor } from '../js/game/setup.js';
import { roleList } from '../js/game/setup.js';
import { game, act, submitNight, resolveNight, everyoneVotes, T0 } from './helpers.js';

const R7 = ['werewolf', 'werewolf', 'seer', 'bodyguard', 'villager', 'villager', 'villager'];

// Every view, for every player, at this moment.
const allViews = (s) => s.players.map((p) => [p, viewFor(s, p.id, T0)]);

// Core secrecy invariants, checked for every viewer.
function assertSecrecy(s, label) {
  for (const [me, v] of allViews(s)) {
    const json = JSON.stringify(v);
    for (const other of s.players) {
      if (other.id === me.id) continue;
      const entry = v.players.find((p) => p.id === other.id);
      const publiclyRevealed =
        s.phase === PHASE.GAMEOVER || (!other.alive && s.settings.revealOnDeath);
      const teammate = me.role === 'werewolf' && other.role === 'werewolf';
      if (!publiclyRevealed) {
        assert.equal(entry.role, null, `${label}: ${me.id} sees ${other.id}'s role in players[]`);
      }
      if (!publiclyRevealed && !teammate && s.phase !== PHASE.LOBBY) {
        // no other private path should name their role either
        assert.ok(!('role' in (v.you.private.teammates?.find?.((t) => t.id === other.id) ?? {})), label);
      }
    }
    // night pick data of other teams must never appear
    if (s.phase === PHASE.NIGHT) {
      for (const other of s.players) {
        if (other.id === me.id) continue;
        const sameWolfTeam = me.role === 'werewolf' && other.role === 'werewolf';
        if (!sameWolfTeam) {
          assert.ok(!(`${other.id}` in (v.night?.picks ?? {})), label);
        }
      }
      assert.equal(v.night, undefined);
      assert.ok(!('resolveAt' in v));
    }
    if (me.role !== 'seer') assert.equal(v.you.private.seerResult, undefined, label);
    if (me.role !== 'werewolf') assert.equal(v.you.private.teammates, undefined, label);
    assert.ok(!json.includes('"nonces"'), label);
  }
}

test('lobby views contain no roles', () => {
  const g = game(R7);
  const rng = createRng(1);
  // go back: build a fresh lobby view
  const s0 = structuredClone(g.s); s0.phase = PHASE.LOBBY; s0.players.forEach((p) => { p.role = null; });
  for (const [, v] of allViews(s0)) {
    assert.equal(v.you.role, null);
    assert.ok(v.players.every((p) => p.role === null));
  }
});

test('a Villager view contains no other role (every phase)', () => {
  const g = game(R7, { settings: { revealOnDeath: false } });
  const villagerView = () => viewFor(g.s, 'p4', T0);
  const check = (label) => {
    const v = villagerView();
    assert.equal(v.you.role, 'villager', label);
    assert.ok(v.players.filter((p) => p.id !== 'p4').every((p) => p.role === null), label);
    assert.equal(v.you.private.teammates, undefined, label);
    assert.equal(v.you.private.seerResult, undefined, label);
    assert.equal(v.you.private.seerLog, undefined, label);
    const json = JSON.stringify(v);
    for (const r of ['werewolf', 'seer', 'bodyguard']) {
      assert.ok(!json.includes(`"role":"${r}"`) && !json.includes(`"team":"wolves"`), `${label}: leaks "${r}"`);
    }
  };
  check('night');
  submitNight(g, { p0: 'p5', p1: 'p5', p2: 'p0', p3: 'p6' });
  check('night submitted');
  resolveNight(g);
  check('day');
  act(g, { kind: 'startVote', by: 'p0' });
  check('vote');
  everyoneVotes(g, { p0: 'p6', p1: 'p6', p2: 'p0', p3: 'p0', p4: 'p0', p6: 'p0' });
  check('vote result');
});

test('secrecy: every role, every phase', () => {
  const g = game(R7);
  assertSecrecy(g.s, 'night start');
  act(g, { kind: 'nightPick', by: 'p0', targetId: 'p4' });
  act(g, { kind: 'nightPick', by: 'p2', targetId: 'p0' });
  act(g, { kind: 'nightPick', by: 'p3', targetId: 'p5' });
  assertSecrecy(g.s, 'night partial');
  submitNight(g, { p1: 'p4' });
  resolveNight(g);
  assertSecrecy(g.s, 'day');
  act(g, { kind: 'startVote', by: 'p0' });
  assertSecrecy(g.s, 'vote');
  act(g, { kind: 'vote', by: 'p0', targetId: 'p1' });
  assertSecrecy(g.s, 'vote partial');
  everyoneVotes(g, { p1: 'p0', p2: 'p0', p3: 'p0', p5: 'p0', p6: 'p0' });
  assertSecrecy(g.s, 'vote result');
});

test('secrecy: revealOnDeath off hides dead roles until game over', () => {
  const g = game(R7, { settings: { revealOnDeath: false } });
  submitNight(g, { p0: 'p4', p1: 'p4', p2: 'p0', p3: 'p5' });
  resolveNight(g);
  const v = viewFor(g.s, 'p6', T0);
  assert.equal(v.players.find((p) => p.id === 'p4').alive, false);
  assert.equal(v.players.find((p) => p.id === 'p4').role, null);
  assert.ok(!v.log.some((l) => l.text.includes('Villager')));
  assertSecrecy(g.s, 'day, reveal off');
});

test('revealOnDeath on shows the dead role to everyone', () => {
  const g = game(R7);
  submitNight(g, { p0: 'p4', p1: 'p4', p2: 'p0', p3: 'p5' });
  resolveNight(g);
  const v = viewFor(g.s, 'p6', T0);
  assert.equal(v.players.find((p) => p.id === 'p4').role, 'villager');
  assert.ok(v.log.at(-1).text.includes('Villager'));
});

test('wolves see teammates and their live picks, no one else does', () => {
  const g = game(R7);
  act(g, { kind: 'nightPick', by: 'p0', targetId: 'p4' });
  const w1 = viewFor(g.s, 'p1', T0);
  assert.deepEqual(w1.you.private.teammates, [{ id: 'p0', name: 'Player0', pick: 'p4' }]);
  for (const id of ['p2', 'p3', 'p4', 'p5', 'p6']) {
    assert.equal(viewFor(g.s, id, T0).you.private.teammates, undefined);
  }
  // wolves' players[] still hides teammate roles from the public list
  assert.equal(w1.players.find((p) => p.id === 'p0').role, null);
});

test('during reveal, wolves know teammates (private), others do not', () => {
  const rng = createRng(1);
  const g = game(R7);
  g.s.phase = PHASE.REVEAL; g.s.night = null;
  assert.equal(viewFor(g.s, 'p0', T0).you.private.teammates.length, 1);
  assert.equal(viewFor(g.s, 'p4', T0).you.private.teammates, undefined);
});

test('seer sees only their own result; others never do', () => {
  const g = game(R7);
  act(g, { kind: 'nightPick', by: 'p2', targetId: 'p0' });
  assert.deepEqual(viewFor(g.s, 'p2', T0).you.private.seerResult, { targetId: 'p0', isWolf: true });
  for (const id of ['p0', 'p1', 'p3', 'p4']) assert.equal(viewFor(g.s, id, T0).you.private.seerResult, undefined);
});

test('seer result is not leaked into the shared state of a later phase', () => {
  const g = game(R7);
  act(g, { kind: 'nightPick', by: 'p2', targetId: 'p0' });
  submitNight(g, { p0: 'p4', p1: 'p4', p3: 'p5' });
  resolveNight(g);
  assert.equal(viewFor(g.s, 'p2', T0).you.private.seerResult, undefined);
  assert.equal(viewFor(g.s, 'p2', T0).you.private.seerLog.length, 1);
});

test('votes stay hidden until everyone has voted; only own vote is visible', () => {
  const g = game(R7);
  submitNight(g, { p0: 'p4', p1: 'p4', p2: 'p0', p3: 'p5' });
  resolveNight(g);
  act(g, { kind: 'startVote', by: 'p0' });
  act(g, { kind: 'vote', by: 'p1', targetId: 'p2' });
  act(g, { kind: 'vote', by: 'p6', targetId: 'p0' });
  const v = viewFor(g.s, 'p1', T0);
  assert.equal(v.you.private.vote, 'p2');
  assert.equal(v.voteResult, undefined);
  assert.ok(!JSON.stringify(viewFor(g.s, 'p2', T0)).includes('"votes"'));
  assert.equal(viewFor(g.s, 'p2', T0).you.private.vote, null);
  everyoneVotes(g, {});
  const r = viewFor(g.s, 'p2', T0).voteResult;
  assert.equal(r.votes.p1, 'p2');
  assert.equal(r.votes.p6, 'p0');
});

test('night prompt: bodyguard self option follows setting; villager gets a prompt; dead get none', () => {
  const g = game(R7);
  assert.equal(viewFor(g.s, 'p4', T0).prompt.text, 'Who do you suspect?');
  assert.equal(viewFor(g.s, 'p0', T0).prompt.text, 'Who do you want to kill?');
  assert.equal(viewFor(g.s, 'p2', T0).prompt.text, 'Who do you want to check?');
  const bg = viewFor(g.s, 'p3', T0).prompt;
  assert.equal(bg.text, 'Who do you want to protect?');
  assert.ok(bg.targets.includes('p3'), 'self-protect is on by default');
  const gOff = game(R7, { settings: { bodyguardSelfProtect: false } });
  assert.ok(!viewFor(gOff.s, 'p3', T0).prompt.targets.includes('p3'));
  assert.ok(!viewFor(g.s, 'p0', T0).prompt.targets.includes('p1'), 'wolves cannot target wolves');
  submitNight(g, { p0: 'p5', p1: 'p5', p2: 'p0', p3: 'p4' });
  resolveNight(g);
  assert.equal(viewFor(g.s, 'p5', T0).prompt, null, 'dead player has no prompt');
});

test('game over reveals all roles and the winner', () => {
  const g = game(['werewolf', 'werewolf', 'seer', 'bodyguard', 'villager']);
  submitNight(g, { p0: 'p4', p1: 'p4', p2: 'p0', p3: 'p2' });
  resolveNight(g);
  const v = viewFor(g.s, 'p3', T0);
  assert.equal(v.phase, PHASE.GAMEOVER);
  assert.equal(v.winner, 'wolves');
  assert.equal(v.players.find((p) => p.id === 'p0').role, 'werewolf');
});

test('view carries hostNow and the deadline', () => {
  const g = game(R7);
  const v = viewFor(g.s, 'p0', 12345);
  assert.equal(v.hostNow, 12345);
  assert.equal(v.deadline, g.s.deadline);
  assert.equal(v.deadline, T0 + 45_000);
});

test('unknown player gets no view', () => {
  assert.equal(viewFor(game(R7).s, 'nobody', T0), null);
});

test('views are fully JSON-serialisable and do not alias engine state', () => {
  const g = game(R7);
  const v = viewFor(g.s, 'p0', T0);
  assert.deepEqual(JSON.parse(JSON.stringify(v)), v);
  v.log.push({ text: 'x' }); v.players[0].name = 'hacked';
  assert.equal(g.s.players[0].name, 'Player0');
});

test('secrecy holds across full random games for every player count', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const n = 5 + (seed % 11);
    const rng = createRng(seed);
    const g = game(roleList(presetFor(n)), { rng });
    let now = T0, guard = 0;
    while (g.s.phase !== PHASE.GAMEOVER && guard++ < 100) {
      assertSecrecy(g.s, `seed ${seed} ${g.s.phase}`);
      const alive = g.s.players.filter((p) => p.alive);
      if (g.s.phase === PHASE.NIGHT) {
        for (const p of alive) {
          const t = nightTargets(g.s, p);
          act(g, { kind: 'nightPick', by: p.id, targetId: t.length ? t[Math.floor(rng() * t.length)] : null, now });
          assertSecrecy(g.s, `seed ${seed} night partial`);
        }
        now += 10_000; act(g, { kind: 'tick', now });
      } else if (g.s.phase === PHASE.DAY) {
        now = g.s.deadline; act(g, { kind: 'tick', now });
      } else {
        for (const p of alive) {
          const o = alive.filter((x) => x.id !== p.id);
          act(g, { kind: 'vote', by: p.id, targetId: o[Math.floor(rng() * o.length)].id, now });
          assertSecrecy(g.s, `seed ${seed} vote partial`);
        }
        now = g.s.deadline; act(g, { kind: 'tick', now });
      }
    }
  }
});
