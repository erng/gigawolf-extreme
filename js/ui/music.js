// Host background music. One <audio> element lives outside #app, so re-rendering screens never touches it
// and the track never restarts between phases or games. Leaving a room only pauses it; hosting again resumes.
import { t } from '../i18n.js';
import { storage } from '../util/storage.js';
import { APP_VERSION } from '../config.js';

const VOL_KEY = 'gigawolf.music.vol';
const MUTE_KEY = 'gigawolf.music.muted';

let audio = null, panel = null, btn = null, slider = null;
let wanted = false; // host session active
// Volume lives in our own state: iOS Safari ignores audio.volume, so loudness goes through a Web Audio gain node
// when available (created on the first user gesture) and falls back to audio.volume otherwise.
let vol = 1, muted = false, ctx = null, gain = null;

function apply() {
  if (gain) { gain.gain.value = muted ? 0 : vol; audio.muted = false; audio.volume = 1; }
  else { audio.volume = vol; audio.muted = muted; }
}

function ensureGain() {
  if (gain || ctx === false) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    gain = ctx.createGain();
    ctx.createMediaElementSource(audio).connect(gain).connect(ctx.destination);
    apply();
  } catch { ctx = false; gain = null; }
}

function icon() { return muted || vol === 0 ? '🔇' : '🔊'; }

function sync() {
  if (!panel) return;
  btn.textContent = icon();
  const label = muted ? t('music.unmute') : t('music.mute');
  btn.setAttribute('aria-label', label); btn.title = label;
  slider.setAttribute('aria-label', t('music.volume'));
  slider.value = String(vol);
  panel.hidden = !wanted;
}

function tryPlay() {
  if (!wanted) return;
  ensureGain();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  if (!audio.paused) return;
  audio.play().catch(() => { /* blocked until a tap: the next tap on the panel retries */ });
}

export function initMusic() {
  if (audio) return;
  audio = new Audio(`assets/night-loop.mp3?v=${APP_VERSION}`);
  audio.loop = true; audio.preload = 'auto';
  const saved = storage.get(VOL_KEY);
  vol = typeof saved === 'number' && saved >= 0 && saved <= 1 ? saved : 1;
  muted = storage.get(MUTE_KEY) === true;
  apply();

  panel = document.createElement('div');
  panel.id = 'music'; panel.hidden = true;
  btn = document.createElement('button');
  btn.type = 'button';
  btn.addEventListener('click', () => {
    muted = !muted;
    if (!muted && vol === 0) vol = 1;
    apply(); storage.set(MUTE_KEY, muted); storage.set(VOL_KEY, vol);
    tryPlay(); sync();
  });
  slider = document.createElement('input');
  slider.type = 'range'; slider.min = '0'; slider.max = '1'; slider.step = '0.05';
  slider.addEventListener('input', () => {
    vol = Number(slider.value);
    if (vol > 0 && muted) { muted = false; storage.set(MUTE_KEY, false); }
    apply(); storage.set(VOL_KEY, vol);
    tryPlay(); sync();
  });
  panel.append(btn, slider);
  (document.getElementById('tools') || document.body).append(panel);
  sync();
}

// Call from a user gesture (the Host button) so autoplay is allowed.
export function startMusic() { wanted = true; initMusic(); tryPlay(); sync(); }
// Pause (not rewind) so hosting again continues where it left off.
export function stopMusic() { wanted = false; if (audio) { audio.pause(); sync(); } }
export function refreshMusicLabels() { if (audio) sync(); }
