import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../js/game/engine.js';
import { viewFor } from '../js/game/views.js';
import { setLang, tr } from '../js/i18n.js';
import { game, act, T0 } from './helpers.js';

// p0, p1 wolves, p2 seer, p3..p6 have no night power. The wolves always kill the seer (p2).
const ROLES = ['werewolf', 'werewolf', 'seer', 'villager', 'villager', 'villager', 'villager'];
const base = { p0: 'p2', p1: 'p2', p2: 'p3' };

function night(g, suspects, { resolve = true } = {}) {
  const picks = { ...base, ...suspects };
  for (const p of g.s.players.filter((x) => x.alive)) {
    const r = act(g, { kind: 'nightPick', by: p.id, targetId: picks[p.id] ?? null });
    assert.ok(!r.error, `${p.id}: ${r.error?.message}`);
  }
  if (resolve) act(g, { kind: 'nextPhase', by: 'p0' });
  return g.s.lines;
}

test('suspicions: on by default, host can turn it off, and nothing is announced while off', () => {
  assert.equal(DEFAULT_SETTINGS.suspicions, true);
  const on = night(game(ROLES), { p3: 'p0', p4: 'p0', p5: 'p0' });
  assert.ok(on.includes('Most suspected: Player0.'), 'announced with the default settings');
  const g = game(ROLES, { settings: { suspicions: false } });
  assert.equal(g.s.settings.suspicions, false);
  const lines = night(g, { p3: 'p0', p4: 'p0', p5: 'p0' });
  assert.ok(!lines.some((l) => l.startsWith('Most suspected')));
});

test('suspicions: the most suspected living player is announced once two or more agree', () => {
  const g = game(ROLES, { settings: { suspicions: true } });
  const lines = night(g, { p3: 'p0', p4: 'p0', p5: 'p6', p6: 'p0' });
  assert.ok(lines.includes('Most suspected: Player0.'), lines.join(' | '));
  assert.ok(g.s.log.some((l) => l.text === 'Most suspected: Player0.'));
});

test('suspicions: one lone answer is not announced', () => {
  const g = game(ROLES, { settings: { suspicions: true } });
  const lines = night(g, { p3: 'p0' });
  assert.ok(!lines.some((l) => l.startsWith('Most suspected')), lines.join(' | '));
});

test('suspicions: a tie names everyone tied, in seating order', () => {
  const g = game(ROLES, { settings: { suspicions: true } });
  const lines = night(g, { p3: 'p1', p4: 'p1', p5: 'p0', p6: 'p0' });
  assert.ok(lines.includes('Most suspected: Player0 and Player1.'), lines.join(' | '));
});

test('suspicions: answers about a player who died in the night are dropped', () => {
  const g = game(ROLES, { settings: { suspicions: true } });
  const lines = night(g, { p3: 'p2', p4: 'p2', p5: 'p2' });
  assert.ok(lines.some((l) => l.startsWith('Player2 was killed')), 'the seer died');
  assert.ok(!lines.some((l) => l.startsWith('Most suspected')), lines.join(' | '));
});

test('suspicions: an invalid answer is ignored, never an error', () => {
  const g = game(ROLES, { settings: { suspicions: true } });
  const r = act(g, { kind: 'nightPick', by: 'p3', targetId: 'p3' }); // self is not a valid target
  assert.ok(!r.error);
  assert.deepEqual(g.s.night.suspects, {});
});

test('suspicions: answers stay on the host, no player view contains them', () => {
  const g = game(ROLES, { settings: { suspicions: true } });
  night(g, { p3: 'p0', p4: 'p0', p5: 'p0' }, { resolve: false });
  for (const p of g.s.players) assert.ok(!JSON.stringify(viewFor(g.s, p.id, T0)).includes('"suspects"'), `${p.id} view leaks`);
});

test('suspicions: the dawn line is fully translated to Thai', () => {
  setLang('th');
  const out = tr('P1 was killed in the night. Most suspected: P3 and P4.').replace(/\bRIP\b/g, '');
  assert.ok(!/[A-Za-z]{3,}/.test(out), out);
  setLang('en');
});
