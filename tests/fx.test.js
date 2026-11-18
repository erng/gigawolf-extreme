import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLine, parseLines } from '../js/ui/fx.js';
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
  assert.equal(parseLine('Gus lowered the gun.').type, 'spared');
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
  const keys = ['fx.night', 'fx.vote', 'fx.shot', 'fx.prince', 'fx.jester', 'fx.jesterTwist', 'fx.capNight', 'fx.capVote', 'fx.capShot'];
  setLang('en'); const en = keys.map((k) => t(k));
  setLang('th');
  keys.forEach((k, i) => {
    assert.notEqual(t(k), k, `${k} missing`);
    assert.notEqual(t(k), en[i], `${k} not translated`);
  });
  setLang('en');
});
