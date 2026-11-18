import test from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../js/game/engine.js';
import { game, act } from './helpers.js';

const said = (r) => r.effects.filter((e) => e.type === 'narrate').map((e) => e.text);
const run = (g, a) => { const r = act(g, a); assert.ok(!r.error, r.error?.message); return said(r); };

// Night picks for everyone alive: the wolves take the first non-wolf, the seer looks at someone.
function nightPicks(g) {
  const alive = g.s.players.filter((p) => p.alive);
  const victim = alive.find((p) => p.role !== 'werewolf');
  for (const p of alive) {
    const targetId = p.role === 'werewolf' ? victim.id : p.role === 'seer' ? alive.find((x) => x.id !== p.id).id : null;
    run(g, { kind: 'nightPick', by: p.id, targetId });
  }
}

test('only deaths are spoken: nightfall and the start of voting say nothing', () => {
  const g = game(['werewolf', 'werewolf', 'seer', ...Array(6).fill('villager')]);
  nightPicks(g);
  const dawn = run(g, { kind: 'nextPhase', by: 'p0' });
  assert.equal(g.s.phase, PHASE.DAY);
  assert.deepEqual(dawn, [g.s.lines.join(' ')], 'dawn speaks the announcement and nothing else');
  assert.match(dawn[0], /was killed in the night\./);
  assert.deepEqual(run(g, { kind: 'startVote', by: 'p0' }), [], 'the vote start has a sound, not a line');
  // The result is announced as soon as the last vote is in.
  const result = g.s.players.filter((x) => x.alive).flatMap((p) => run(g, { kind: 'vote', by: p.id, targetId: 'skip' }));
  assert.deepEqual(result, [g.s.lines.join(' ')], 'the vote result is spoken');
  assert.deepEqual(run(g, { kind: 'nextPhase', by: 'p0' }), [], 'the next nightfall is silent');
  assert.equal(g.s.phase, PHASE.NIGHT);
});

test('the win is never spoken; the deaths that ended the game are', () => {
  const g = game(['werewolf', 'werewolf', 'villager', 'villager', 'villager']);
  nightPicks(g);
  const end = run(g, { kind: 'nextPhase', by: 'p0' });
  assert.equal(g.s.phase, PHASE.GAMEOVER, 'two wolves against two villagers ends it at dawn');
  assert.equal(end.length, 1);
  assert.match(end[0], /was killed in the night\./);
  assert.ok(!/wins/.test(end[0]), 'no "The wolves win!"');
});

test('a win after a vote adds no second line, and an early end is silent', () => {
  const g = game(['werewolf', 'seer', ...Array(5).fill('villager')]);
  nightPicks(g);
  run(g, { kind: 'nextPhase', by: 'p0' });
  run(g, { kind: 'startVote', by: 'p0' });
  const result = g.s.players.filter((x) => x.alive).flatMap((p) => run(g, { kind: 'vote', by: p.id, targetId: p.id === 'p0' ? 'p2' : 'p0' }));
  assert.equal(result.length, 1, 'the vote result');
  assert.match(result[0], /was eliminated by vote\./);
  assert.equal(g.s.phase, PHASE.VOTE, 'result screen first');
  assert.deepEqual(run(g, { kind: 'nextPhase', by: 'p0' }), [], 'the village win is not spoken');
  assert.equal(g.s.phase, PHASE.GAMEOVER);

  const e = game(['werewolf', 'seer', ...Array(5).fill('villager')]);
  assert.deepEqual(run(e, { kind: 'endEarly', by: 'p0' }), []);
});

test('the hunter shot line is still spoken', () => {
  const g = game(['werewolf', 'hunter', ...Array(6).fill('villager')]);
  for (const p of g.s.players) run(g, { kind: 'nightPick', by: p.id, targetId: p.role === 'werewolf' ? 'p1' : null });
  const dawn = run(g, { kind: 'nextPhase', by: 'p0' });
  assert.equal(g.s.phase, PHASE.SHOT);
  assert.match(dawn.join(' '), /one last shot/i);
});
