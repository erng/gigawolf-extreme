// Which sounds a phone plays. Pure (storage is passed in) so it can be tested in Node.
// Three switches: music, narrator and effects. Defaults: on for the host, off for everyone else, so a
// table full of phones in one room doesn't play the same track, lines and effects over each other.
// Remote players can turn any of them on. Choices saved before effects existed get the default for it.
// The host's choice is kept across games; a player's choice only for the room they set it in.
// Music is for waiting around: it plays while the lobby is up (and before the first view arrives, so the
// Host or Join tap can start it) and stops once a game begins, so it never clashes with the sound effects.
export const musicAllowed = (phase) => phase == null || phase === 'lobby';

const HOST_KEY = 'gigawolf.sound.host';
const PLAYER_KEY = 'gigawolf.sound.player';
const OLD_MUSIC_MUTE_KEY = 'gigawolf.music.muted'; // before 1.16.0: host music mute only

export function loadSoundPrefs(store, { isHost, roomCode }) {
  if (isHost) {
    const saved = store.get(HOST_KEY);
    if (saved) return { music: !!saved.music, narrator: !!saved.narrator, effects: saved.effects ?? true };
    return { music: store.get(OLD_MUSIC_MUTE_KEY) !== true, narrator: true, effects: true };
  }
  const saved = store.get(PLAYER_KEY);
  if (saved && saved.roomCode === roomCode) return { music: !!saved.music, narrator: !!saved.narrator, effects: !!saved.effects };
  return { music: false, narrator: false, effects: false };
}

export function saveSoundPrefs(store, { isHost, roomCode }, prefs) {
  const p = { music: !!prefs.music, narrator: !!prefs.narrator, effects: !!prefs.effects };
  if (isHost) store.set(HOST_KEY, p);
  else store.set(PLAYER_KEY, { roomCode, ...p });
}
