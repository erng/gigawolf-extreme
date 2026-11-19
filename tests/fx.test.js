import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLine, parseLines, finalLines } from '../js/ui/fx.js';
import { winSfx } from '../js/ui/sfx.js';
import { viewFor } from '../js/game/views.js';
import { PHASE } from '../js/game/engine.js';
import { game, act, submitNight, resolveNight } from './helpers.js';
import { setLang, t } from '../js/i18n.js';
import { ROLES } from '../js/game/roles.js';

test('outcome cards read every announcement form, with and without the role', () => {
  assert.deepEqual(parseLine('Ann was killed in the night.'), { type: 'night', name: 'Ann', role: null, text: 'Ann was killed in the night.' });
  for (const r of Object.values(ROLES)) {
    assert.equal(parseLine(`Ann was killed in the night. They were a ${r.name}.`).role, r.id);
    assert.equal(parseLine(`Ann was eliminated by vote. They were a ${r.name}.`).role, r.id);
  }
  assert.deepEqual(parseLine('Gus shot Dev. They were a Werewolf.'), { type: 'shot', by: 'Gus', name: 'Dev', role: 'werewolf', text: 'Gus shot Dev. They were a Werewolf.' });
  assert.equal(parseLine('Nobody died.').type, 'calm');
  assert.equal(parseLine('Nobody was eliminated.').type, 'tie');
  assert.equal(parseLine('Hal is the Prince! The village cannot eliminate them.').type, 'prince');
  assert.equal(parseLine('Gus lowered the bow.').type, 'spared');
  assert.equal(parseLine('Most suspected: Bob.').type, 'info');
});

test('a hidden Jester folds into the vote-out card', () => {
  const cards = parseLines(['Eli was eliminated by vote.', 'Eli was the Jester!']);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].role, 'jester');
  assert.equal(cards[0].jester, true);
});

test('night deaths look the same whatever the cause', () => {
  // The engine says the same line for a wolf kill and for poison; the card must not add anything.
  const a = parseLine('Ann was killed in the night.');
  assert.deepEqual(Object.keys(a).sort(), ['name', 'role', 'text', 'type']);
});

test('every outcome card label has a Thai version', () => {
  const keys = ['fx.night', 'fx.vote', 'fx.shot', 'fx.prince', 'fx.jester', 'fx.jesterTwist', 'fx.capNight', 'fx.capVote', 'fx.capShot', 'over.last'];
  setLang('en'); const en = keys.map((k) => t(k));
  setLang('th');
  keys.forEach((k, i) => {
    assert.notEqual(t(k), k, `${k} missing`);
    assert.notEqual(t(k), en[i], `${k} not translated`);
  });
  setLang('en');
});

test('finalLines keeps the deaths that ended the game and drops the rest', () => {
  const v = { announce: ['Hal was killed in the night.', 'Hal shot Wes.', 'Most suspected: Bob.', 'Nobody died.', 'Someone found a lucky horseshoe.'] };
  assert.deepEqual(finalLines(v), ['Hal was killed in the night.', 'Hal shot Wes.']);
  assert.deepEqual(finalLines({}), []);
});

test('a game the Hunter ends keeps both the night death and the shot for the game-over screen', () => {
  const g = game(['werewolf', 'hunter', 'seer', 'bodyguard', 'villager', 'villager']);
  submitNight(g, { p0: 'p1', p2: 'p4', p3: 'p4' });
  resolveNight(g);
  act(g, { kind: 'shoot', by: 'p1', targetId: 'p0' });
  assert.equal(g.s.phase, PHASE.GAMEOVER);
  for (const id of ['p0', 'p2', 'p5']) {
    const v = viewFor(g.s, id);
    assert.deepEqual(finalLines(v).map((l) => parseLine(l).type), ['night', 'shot'], `${id} sees both`);
  }
});

test('a game the wolves win at dawn keeps the dawn death for the game-over screen', () => {
  const g = game(['werewolf', 'werewolf', 'villager', 'villager', 'villager']);
  submitNight(g, { p0: 'p2', p1: 'p2' });
  resolveNight(g);
  assert.equal(g.s.phase, PHASE.GAMEOVER);
  assert.equal(g.s.winner, 'wolves');
  assert.deepEqual(finalLines(viewFor(g.s, 'p3')).map((l) => parseLine(l).type), ['night']);
});

test('the win sound is picked from the winner, and a host-ended game has none', () => {
  assert.equal(winSfx({ winner: 'village' }), 'villageWin');
  assert.equal(winSfx({ winner: 'wolves' }), 'wolvesWin');
  assert.equal(winSfx({ winner: 'jester' }), 'jester');
  assert.equal(winSfx({ winner: 'ended' }), null);
});
