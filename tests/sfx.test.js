import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { SOUNDS, phaseSfx } from '../js/ui/sfx.js';
import { parseLines, sfxPlan } from '../js/ui/fx.js';

test('every sound effect has a file', () => {
  for (const name of SOUNDS) assert.ok(existsSync(new URL(`../assets/sfx/${name}.mp3`, import.meta.url)), name);
});

test('each outcome card has its sound, deaths timed to the grave landing', () => {
  const plan = (lines) => sfxPlan(parseLines(lines));
  assert.deepEqual(plan(['Ann was killed in the night.']), [{ name: 'nightDeath', at: 870 }]);
  assert.deepEqual(plan(['Ann was killed in the night.', 'Bob was killed in the night.']).map((s) => s.at), [870, 1870]);
  assert.deepEqual(plan(['Nobody died.']), [{ name: 'calm', at: 450 }]);
  assert.equal(plan(['Ann was eliminated by vote.'])[0].name, 'voteOut');
  assert.equal(plan(['Nobody was eliminated.'])[0].name, 'tie');
  assert.equal(plan(['Gus shot Dev.'])[0].name, 'shot');
  assert.equal(plan(['Gus lowered the gun.'])[0].name, 'spared');
  assert.equal(plan(['Hal is the Prince! The village cannot eliminate them.'])[0].name, 'prince');
  assert.deepEqual(plan(['Most suspected: Bob.']), [], 'plain lines are silent');
});

test('a voted-out Jester plays the Jester sound, once, whether or not roles are shown', () => {
  assert.deepEqual(sfxPlan(parseLines(['Eli was eliminated by vote.', 'Eli was the Jester!'])).map((s) => s.name), ['jester']);
  assert.deepEqual(sfxPlan(parseLines(['Eli was eliminated by vote. They were a Jester.'])).map((s) => s.name), ['jester']);
});

test('nightfall and the winner sound only on a real change of phase', () => {
  assert.equal(phaseSfx({ phase: 'vote' }, { phase: 'night' }), 'nightfall');
  assert.equal(phaseSfx({ phase: 'reveal' }, { phase: 'night' }), 'nightfall');
  assert.equal(phaseSfx(null, { phase: 'night' }), null, 'joining or reconnecting mid-night is quiet');
  assert.equal(phaseSfx({ phase: 'night' }, { phase: 'night' }), null);
  assert.equal(phaseSfx({ phase: 'day' }, { phase: 'gameover', winner: 'village' }), 'villageWin');
  assert.equal(phaseSfx({ phase: 'night' }, { phase: 'gameover', winner: 'wolves' }), 'wolvesWin');
  assert.equal(phaseSfx({ phase: 'vote' }, { phase: 'gameover', winner: 'jester' }), null, 'the Jester card already played');
  assert.equal(phaseSfx({ phase: 'day' }, { phase: 'gameover', winner: 'ended' }), null);
});
