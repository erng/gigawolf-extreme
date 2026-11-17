import test from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../js/game/engine.js';
import { NIGHT_LINES, DAY_LINES, VOTE_LINES } from '../js/game/lines.js';
import { setLang, tr } from '../js/i18n.js';
import { game, act } from './helpers.js';

test('every narrator line is unique and has a Thai translation', () => {
  setLang('th');
  const all = [...NIGHT_LINES, ...DAY_LINES, ...VOTE_LINES];
  assert.equal(new Set(all.map((l) => l.en)).size, all.length, 'duplicate English line');
  for (const { en, th } of all) assert.equal(tr(en), th);
  // A day opener is spoken together with the dawn announcement; the whole text must come out Thai.
  for (const { en } of DAY_LINES) assert.ok(!/[A-Za-z]/.test(tr(`${en} P1 was killed in the night.`).replace(/\bRIP\b|P1/g, '')));
});

test('night, day and vote openers change from round to round', () => {
  const g = game(['werewolf', 'werewolf', 'seer', ...Array(6).fill('villager')]);
  const said = { night: [], day: [], vote: [] };
  const run = (a) => { const r = act(g, a); assert.ok(!r.error, r.error?.message); return r.effects.filter((e) => e.type === 'narrate').map((e) => e.text); };
  for (let i = 0; i < 10 && g.s.phase !== PHASE.GAMEOVER; i++) {
    const alive = g.s.players.filter((p) => p.alive);
    const victim = alive.find((p) => p.role !== 'werewolf');
    for (const p of alive) {
      const targetId = p.role === 'werewolf' ? victim.id : p.role === 'seer' ? alive.find((x) => x.id !== p.id).id : null;
      run({ kind: 'nightPick', by: p.id, targetId });
    }
    const dawn = run({ kind: 'nextPhase', by: 'p0' });
    if (g.s.phase !== PHASE.DAY) break;
    said.day.push(...dawn);
    said.vote.push(...run({ kind: 'startVote', by: 'p0' }));
    for (const p of g.s.players.filter((x) => x.alive)) run({ kind: 'vote', by: p.id, targetId: 'skip' });
    said.night.push(...run({ kind: 'nextPhase', by: 'p0' }));
  }
  assert.ok(said.night.length >= 3 && said.day.length >= 3 && said.vote.length >= 3, 'game ran long enough');
  for (const [kind, lines, texts] of [['night', NIGHT_LINES, said.night], ['day', DAY_LINES, said.day], ['vote', VOTE_LINES, said.vote]]) {
    assert.ok(texts.every((x) => lines.some((l) => x.startsWith(l.en))), `${kind}: unknown line`);
    assert.equal(new Set(texts).size, texts.length, `${kind}: a line repeated`);
  }
});
