// Background music. One <audio> element lives outside #app, so re-rendering screens never touches it
// and the track never restarts between phases or games. Turning it off only pauses it, so turning it
// back on continues where it left off. The file is only fetched once a phone first turns music on.
//
// Fading: while a sound effect plays the music fades out completely, then fades back in slowly once the
// sound is over. iPhones ignore an <audio> element's volume, so once the effects' AudioContext exists the
// music is routed through it and faded with a gain node there (the same context the effects use, so the
// timing lines up exactly).
import { APP_VERSION } from '../config.js';

export const DUCK_LEVEL = 0;            // music level under a sound effect: silent
export const DUCK_LEAD_S = 0.15;        // start fading out this long before the sound (when there is time)
const DUCK_ATTACK_S = 0.08;             // time constant of the fade out: gone within about 0.4 s
export const DUCK_RELEASE_DELAY_S = 0.5; // silence after the sound ends before the music starts to return
const DUCK_RELEASE_S = 1.6;             // time constant of the fade in: back to about 95% after 5 s

let audio = null;
let on = false;
let ctx = null;
let gain = null;      // GainNode between the music and the speaker, once routed
let releaseAt = 0;    // context time when the music is scheduled to start coming back

function tryPlay() {
  if (gain && ctx.state === 'suspended') ctx.resume().catch(() => { /* retried on the next tap */ });
  if (!on || !audio.paused) return;
  audio.play().catch(() => { /* blocked until a tap: sound.js retries on the next tap */ });
}

// A media element can be routed through Web Audio only once, and stays routed.
function route() {
  if (!audio || !ctx || gain) return;
  try {
    const node = ctx.createGain();
    ctx.createMediaElementSource(audio).connect(node).connect(ctx.destination);
    gain = node;
  } catch { gain = null; /* no ducking, the music plays as before */ }
}

// Called by sfx.js when it creates its AudioContext.
export function attachContext(c) { ctx = c; route(); }

// Fade the music out for a sound that plays from context time `from` to `to` (seconds). Sounds that overlap
// or follow closely keep it out until the last one is over.
export function duckMusic(from, to) {
  route();
  if (!gain) return;
  const p = gain.gain;
  const down = Math.max(from - DUCK_LEAD_S, ctx.currentTime);
  const upAt = to + DUCK_RELEASE_DELAY_S;
  if (down < releaseAt) {                 // still out, or the return has not started yet: cancel it
    p.cancelScheduledValues(releaseAt);
    releaseAt = Math.max(releaseAt, upAt);
  } else {
    p.setTargetAtTime(DUCK_LEVEL, down, DUCK_ATTACK_S);
    releaseAt = upAt;
  }
  p.setTargetAtTime(1, releaseAt, DUCK_RELEASE_S);
}

export function setMusic(want) {
  on = !!want;
  if (!on) { audio?.pause(); return; }
  if (!audio) {
    audio = new Audio(`assets/night-loop.mp3?v=${APP_VERSION}`);
    audio.loop = true; audio.preload = 'auto';
    route();
  }
  tryPlay();
}
