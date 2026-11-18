import test from 'node:test';
import assert from 'node:assert/strict';

// The music fades out under sound effects through a gain node on the effects' AudioContext.
function setup() {
  const calls = [];
  const gainParam = { setTargetAtTime: (...a) => calls.push(['target', ...a]), cancelScheduledValues: (...a) => calls.push(['cancel', ...a]) };
  const node = () => ({ connect: (n) => n });
  const ctx = {
    currentTime: 0, state: 'running', destination: node(), resume: () => Promise.resolve(),
    createGain: () => ({ ...node(), gain: gainParam }),
    createMediaElementSource: () => node(),
  };
  globalThis.Audio = class { paused = true; play() { this.paused = false; return Promise.resolve(); } pause() { this.paused = true; } };
  return { ctx, calls };
}
const near = (a, b) => Math.abs(a - b) < 1e-9;

test('music fades out completely for a sound and comes back slowly after it', async () => {
  const { setMusic, attachContext, duckMusic, DUCK_LEVEL, DUCK_LEAD_S, DUCK_RELEASE_DELAY_S } = await import('../js/ui/music.js');
  const { ctx, calls } = setup();
  setMusic(true);
  attachContext(ctx);
  assert.equal(DUCK_LEVEL, 0, 'fully silent, not just quieter');

  duckMusic(1, 3);                         // one sound from 1 s to 3 s
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], 'target'); assert.equal(calls[0][1], DUCK_LEVEL); assert.ok(near(calls[0][2], 1 - DUCK_LEAD_S), 'starts fading out just before it');
  assert.equal(calls[1][0], 'target'); assert.equal(calls[1][1], 1); assert.ok(near(calls[1][2], 3 + DUCK_RELEASE_DELAY_S), 'stays silent a beat after it ends, then returns');
  assert.ok(calls[1][3] >= 1, 'the return is slow: a time constant of a second or more');

  calls.length = 0;
  duckMusic(2, 5);                         // a second sound overlapping the first
  assert.equal(calls[0][0], 'cancel', 'the first return is cancelled');
  assert.ok(!calls.some((c) => c[0] === 'target' && c[1] === DUCK_LEVEL), 'already ducked: no second drop');
  const back = calls.at(-1);
  assert.equal(back[1], 1); assert.ok(near(back[2], 5 + DUCK_RELEASE_DELAY_S), 'returns once, after the last sound');

  calls.length = 0;
  duckMusic(20, 22);                       // much later: a fresh drop and return
  assert.equal(calls[0][1], DUCK_LEVEL); assert.ok(near(calls[0][2], 20 - DUCK_LEAD_S));
  assert.equal(calls.at(-1)[1], 1);
});
