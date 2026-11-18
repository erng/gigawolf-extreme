// Per-phone sound controls: separate Music, Narrator and Effects buttons in the tools row, shown while in a room.
// Defaults and what is remembered live in soundprefs.js.
import { t } from '../i18n.js';
import { storage } from '../util/storage.js';
import { loadSoundPrefs, saveSoundPrefs, musicAllowed } from './soundprefs.js';
import { setMusic } from './music.js';
import { setNarrator, unlock } from './narrator.js';
import { setEffects } from './sfx.js';

let room = null;   // { isHost, roomCode } while in a room
let prefs = { music: false, narrator: false, effects: false };
let phase = null;   // the game phase of the latest view, null until one arrives
let panel = null;
const buttons = {};

function apply() {
  setMusic(!!room && prefs.music && musicAllowed(phase));
  setNarrator(!!room && prefs.narrator);
  setEffects(!!room && prefs.effects);
  if (room && prefs.narrator) unlock();
  sync();
}

function sync() {
  if (!panel) return;
  panel.hidden = !room;
  for (const [kind, icon] of [['music', '🎵'], ['narrator', '🗣️'], ['effects', '💥']]) {
    const b = buttons[kind]; const label = t(`sound.${kind}`);
    b.textContent = `${icon} ${label}`;
    b.setAttribute('aria-pressed', String(prefs[kind]));
    b.classList.toggle('off', !prefs[kind]);
  }
  buttons.music.hidden = !musicAllowed(phase); // no music button while a game is on
}

function init() {
  if (panel) return;
  panel = document.createElement('div');
  panel.id = 'sound'; panel.hidden = true;
  for (const kind of ['music', 'narrator', 'effects']) {
    const b = document.createElement('button');
    b.type = 'button';
    b.addEventListener('click', () => {
      if (!room) return;
      prefs = { ...prefs, [kind]: !prefs[kind] };
      saveSoundPrefs(storage, room, prefs);
      apply();
    });
    buttons[kind] = b; panel.append(b);
  }
  (document.getElementById('tools') || document.body).append(panel);
  // Browsers only start audio and speech from a tap. Sound that was turned on without one (a phone
  // that rejoined after reloading) starts on the next tap anywhere.
  document.addEventListener('click', () => { if (room) apply(); }, true);
}

// Call from the Host or Join tap when possible, so sound that is on can start right away.
// Rooms are keyed by role and code: the host's settings are the same in every room.
export function enterRoom({ isHost, roomCode }) {
  init();
  if (room && room.isHost === isHost && (isHost || room.roomCode === roomCode)) { apply(); return; }
  room = { isHost, roomCode }; phase = null;
  prefs = loadSoundPrefs(storage, room);
  apply();
}

export function leaveRoom() { room = null; phase = null; apply(); }

// Call with each view's phase: the music plays in the lobby only, and picks up where it left off on Play again.
export function setSoundPhase(next) {
  if (next === phase) return;
  phase = next; apply();
}
export function refreshSoundLabels() { sync(); }
