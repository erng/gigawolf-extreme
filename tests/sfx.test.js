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
  assert.equal(plan(['Gus lowered the bow.'])[0].name, 'spared');
  assert.equal(plan(['Hal is the Prince! The village cannot eliminate them.'])[0].name, 'prince');
  assert.deepEqual(plan(['Most suspected: Bob.']), [], 'plain lines are silent');
});

test('a voted-out Jester plays the Jester sound, once, whether or not roles are shown', () => {
  assert.deepEqual(sfxPlan(parseLines(['Eli was eliminated by vote.', 'Eli was the Jester!'])).map((s) => s.name), ['jester']);
  assert.deepEqual(sfxPlan(parseLines(['Eli was eliminated by vote. They were a Jester.'])).map((s) => s.name), ['jester']);
});

test('game start, nightfall, the call to vote and the winner sound only on a real change of phase', () => {
  assert.equal(phaseSfx({ phase: 'lobby' }, { phase: 'reveal' }), 'gameStart');
  assert.equal(phaseSfx(null, { phase: 'reveal' }), null, 'joining or reconnecting during the reveal is quiet');
  assert.equal(phaseSfx({ phase: 'reveal' }, { phase: 'reveal' }), null, 'a player getting ready is not a new start');
  assert.equal(phaseSfx({ phase: 'gameover' }, { phase: 'lobby' }), null, 'Play again is quiet until the next start');
  assert.equal(phaseSfx({ phase: 'day' }, { phase: 'vote' }), 'voteCall');
  assert.equal(phaseSfx(null, { phase: 'vote' }), null, 'joining or reconnecting mid-vote is quiet');
  assert.equal(phaseSfx({ phase: 'vote' }, { phase: 'vote' }), null, 'the vote result is not a new call');
  assert.equal(phaseSfx({ phase: 'vote' }, { phase: 'night' }), 'nightfall');
  assert.equal(phaseSfx({ phase: 'reveal' }, { phase: 'night' }), 'nightfall');
  assert.equal(phaseSfx(null, { phase: 'night' }), null, 'joining or reconnecting mid-night is quiet');
  assert.equal(phaseSfx({ phase: 'night' }, { phase: 'night' }), null);
  assert.equal(phaseSfx({ phase: 'day' }, { phase: 'gameover', winner: 'village' }), 'villageWin');
  assert.equal(phaseSfx({ phase: 'night' }, { phase: 'gameover', winner: 'wolves' }), 'wolvesWin');
  assert.equal(phaseSfx({ phase: 'vote' }, { phase: 'gameover', winner: 'jester' }), 'jesterWin');
  assert.equal(phaseSfx(null, { phase: 'gameover', winner: 'jester' }), null, 'rejoining at game over is quiet');
  assert.equal(phaseSfx({ phase: 'day' }, { phase: 'gameover', winner: 'ended' }), null);
});

// A fake AudioContext: every sound lasts SOUND_MS, and starts are recorded.
const SOUND_MS = 30;
function fakeAudio() {
  const starts = [];
  const param = () => ({ value: 1, calls: [], setTargetAtTime(...a) { this.calls.push(['target', ...a]); }, cancelScheduledValues(...a) { this.calls.push(['cancel', ...a]); } });
  const node = () => ({ connect(n) { return n; } });
  class Ctx {
    currentTime = 0; state = 'running'; destination = node();
    resume() { return Promise.resolve(); }
    decodeAudioData() { return Promise.resolve({ duration: SOUND_MS / 1000 }); }
    createBufferSource() { return { ...node(), start(t) { starts.push(t); } }; }
    createGain() { return { ...node(), gain: param() }; }
    createMediaElementSource() { return node(); }
  }
  globalThis.window = { AudioContext: Ctx };
  globalThis.fetch = async () => ({ arrayBuffer: async () => new ArrayBuffer(8) });
  return starts;
}

test('speech waits for the sound effects to finish; with effects off it does not wait', async () => {
  const { setEffects, playSfx, afterSfx } = await import('../js/ui/sfx.js');
  const starts = fakeAudio();
  let spoken = 0;
  afterSfx(() => { spoken++; });
  assert.equal(spoken, 1, 'effects never turned on: nothing to wait for');

  setEffects(true);
  await new Promise((r) => setImmediate(r)); // let the files "load"
  playSfx('nightDeath', 0);
  playSfx('voteOut', 40);                    // a second card's sound, 40 ms later
  assert.equal(starts.length, 2);
  afterSfx(() => { spoken++; });
  assert.equal(spoken, 1, 'not while the sounds play');
  await new Promise((r) => setTimeout(r, 40 + SOUND_MS - 10));
  assert.equal(spoken, 1, 'not before the last sound has ended');
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(spoken, 2, 'after the last sound plus a short gap');

  setEffects(false);
  afterSfx(() => { spoken++; });
  assert.equal(spoken, 3, 'effects off again: immediate');
});
