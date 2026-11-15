// Host background music. One <audio> element lives outside #app, so re-rendering screens never touches it
// and the track never restarts between phases or games. Leaving a room only pauses it; hosting again resumes.
import { t } from '../i18n.js';
import { storage } from '../util/storage.js';
import { APP_VERSION } from '../config.js';

const VOL_KEY = 'gigawolf.music.vol';
const MUTE_KEY = 'gigawolf.music.muted';

let audio = null, panel = null, btn = null, slider = null;
let wanted = false; // host session active

function icon() { return audio.muted || audio.volume === 0 ? '🔇' : '🔊'; }

function sync() {
  if (!panel) return;
  btn.textContent = icon();
  const label = audio.muted ? t('music.unmute') : t('music.mute');
  btn.setAttribute('aria-label', label); btn.title = label;
  slider.setAttribute('aria-label', t('music.volume'));
  slider.value = String(audio.volume);
  panel.hidden = !wanted;
}

function tryPlay() {
  if (!wanted || !audio.paused) return;
  audio.play().catch(() => { /* blocked until a tap: the next tap on the panel retries */ });
}

export function initMusic() {
  if (audio) return;
  audio = new Audio(`assets/night-loop.mp3?v=${APP_VERSION}`);
  audio.loop = true; audio.preload = 'auto';
  const vol = storage.get(VOL_KEY);
  audio.volume = typeof vol === 'number' && vol >= 0 && vol <= 1 ? vol : 0.4;
  audio.muted = storage.get(MUTE_KEY) === true;

  panel = document.createElement('div');
  panel.id = 'music'; panel.hidden = true;
  btn = document.createElement('button');
  btn.type = 'button';
  btn.addEventListener('click', () => {
    audio.muted = !audio.muted;
    if (!audio.muted && audio.volume === 0) audio.volume = 0.4;
    storage.set(MUTE_KEY, audio.muted); storage.set(VOL_KEY, audio.volume);
    tryPlay(); sync();
  });
  slider = document.createElement('input');
  slider.type = 'range'; slider.min = '0'; slider.max = '1'; slider.step = '0.05';
  slider.addEventListener('input', () => {
    audio.volume = Number(slider.value);
    if (audio.volume > 0 && audio.muted) { audio.muted = false; storage.set(MUTE_KEY, false); }
    storage.set(VOL_KEY, audio.volume);
    tryPlay(); sync();
  });
  panel.append(btn, slider);
  document.body.append(panel);
  sync();
}

// Call from a user gesture (the Host button) so autoplay is allowed.
export function startMusic() { wanted = true; initMusic(); tryPlay(); sync(); }
// Pause (not rewind) so hosting again continues where it left off.
export function stopMusic() { wanted = false; if (audio) { audio.pause(); sync(); } }
export function refreshMusicLabels() { if (audio) sync(); }
