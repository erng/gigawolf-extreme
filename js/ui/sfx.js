// Sound effects for public moments: nightfall, the outcome cards and the end of the game.
// Only things every phone is already shown get a sound, so nothing secret can be heard across the room.
// Each phone turns effects on or off with its own Effects button, separate from Music and Narrator.
// Speech waits for the sounds to finish (afterSfx). The music only plays in the lobby, so it never meets a sound.
//
// Web Audio, not <audio>: a sound must start when a view arrives, long after the last tap, and only an
// AudioContext that was started from a tap may do that on phones. The files are only fetched once a
// phone first turns effects on.
import { APP_VERSION } from '../config.js';

export const SOUNDS = ['nightfall', 'voteCall', 'nightDeath', 'calm', 'voteOut', 'tie', 'shot', 'spared', 'prince', 'jester', 'villageWin', 'wolvesWin'];
const VOLUME = 0.8;
const TOO_LATE_MS = 600; // a sound that loads after its moment has passed is skipped, not played late
const SPEECH_GAP_MS = 250; // quiet beat between the last sound and the spoken line

let on = false;
let ctx = null;
let loading = null;
let busyUntil = 0; // performance.now() when the last scheduled sound ends
const buffers = {};

// Called from sound.js, including from inside taps (where a suspended context may resume).
export function setEffects(want) {
  on = !!want;
  if (!on || typeof window === 'undefined') return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  // iPhone: play like media, through the silent switch, the same as the music.
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* older iOS */ }
  try { ctx ??= new AC(); } catch { return; }
  if (ctx.state === 'suspended') ctx.resume().catch(() => { /* retried on the next tap */ });
  loading ??= Promise.all(SOUNDS.map(async (name) => {
    try {
      const res = await fetch(`assets/sfx/${name}.mp3?v=${APP_VERSION}`);
      buffers[name] = await ctx.decodeAudioData(await res.arrayBuffer());
    } catch { /* that one sound stays silent */ }
  }));
}

export function playSfx(name, delayMs = 0) {
  if (!on || !ctx || !SOUNDS.includes(name)) return;
  const due = performance.now() + delayMs;
  const go = () => {
    const buf = buffers[name];
    const wait = due - performance.now();
    if (!on || !buf || wait < -TOO_LATE_MS) return;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const gain = ctx.createGain(); gain.gain.value = VOLUME;
    src.connect(gain).connect(ctx.destination);
    src.start(ctx.currentTime + Math.max(0, wait) / 1000);
    busyUntil = Math.max(busyUntil, performance.now() + Math.max(0, wait) + buf.duration * 1000);
  };
  if (buffers[name]) go(); else loading?.then(go);
}

// Runs fn once every sound scheduled so far has finished (plus a short gap), so a spoken line never
// talks over its sound effect. With effects off there is nothing to wait for. Call it after the
// playSfx calls for the same view: sounds still loading are queued first, so they count.
export function afterSfx(fn) {
  const run = () => {
    const wait = busyUntil - performance.now();
    if (wait > 0) setTimeout(fn, wait + SPEECH_GAP_MS); else fn();
  };
  if (on && loading) loading.then(run); else run();
}

// The sound for a change of phase (nightfall, the call to vote, the winner), or null. Only real changes count: the first view after joining or
// reconnecting has no previous view, so a phone that rejoins mid-night stays quiet.
// The Jester's win has no sound of its own: the Jester card on the vote result already played it.
export function phaseSfx(prev, next) {
  if (!prev || !next || prev.phase === next.phase) return null;
  if (next.phase === 'night') return 'nightfall';
  if (next.phase === 'vote') return 'voteCall';
  if (next.phase === 'gameover') return { village: 'villageWin', wolves: 'wolvesWin' }[next.winner] ?? null;
  return null;
}
