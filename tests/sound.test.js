import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSoundPrefs, saveSoundPrefs, musicAllowed } from '../js/ui/soundprefs.js';

const memStorage = () => { const m = new Map(); return { get: (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), set: (k, v) => m.set(k, JSON.stringify(v)), remove: (k) => m.delete(k) }; };
const HOST = { isHost: true, roomCode: null };
const room = (roomCode) => ({ isHost: false, roomCode });

test('sound defaults: music and effects on, narrator off, for host and players', () => {
  const s = memStorage();
  assert.deepEqual(loadSoundPrefs(s, HOST), { music: true, narrator: false, effects: true });
  assert.deepEqual(loadSoundPrefs(s, room('ABCDEFGH')), { music: true, narrator: false, effects: true });
});

test('host choices are kept across games', () => {
  const s = memStorage();
  saveSoundPrefs(s, HOST, { music: false, narrator: true, effects: false });
  assert.deepEqual(loadSoundPrefs(s, HOST), { music: false, narrator: true, effects: false });
  assert.deepEqual(loadSoundPrefs(s, room('ABCDEFGH')), { music: true, narrator: false, effects: true }, 'host choice does not leak to playing');
});

test('a player choice is kept across rooms', () => {
  const s = memStorage();
  saveSoundPrefs(s, room('ABCDEFGH'), { music: false, narrator: true, effects: false });
  assert.deepEqual(loadSoundPrefs(s, room('ABCDEFGH')), { music: false, narrator: true, effects: false });
  assert.deepEqual(loadSoundPrefs(s, room('ZZZZYYYY')), { music: false, narrator: true, effects: false }, 'a new game keeps music off');
  assert.deepEqual(loadSoundPrefs(s, HOST), { music: true, narrator: false, effects: true }, 'player choice does not change host defaults');
});

test('a player choice saved by an older version (with a room code) still applies in any room', () => {
  const s = memStorage();
  s.set('gigawolf.sound.player', { roomCode: 'ABCDEFGH', music: false, narrator: false, effects: true });
  assert.deepEqual(loadSoundPrefs(s, room('ZZZZYYYY')), { music: false, narrator: false, effects: true });
});

test('old host music mute carries over', () => {
  const s = memStorage();
  s.set('gigawolf.music.muted', true);
  assert.deepEqual(loadSoundPrefs(s, HOST), { music: false, narrator: false, effects: true });
});

test('effects are their own switch, and choices saved before effects existed get its default', () => {
  const s = memStorage();
  s.set('gigawolf.sound.host', { music: false, narrator: false });
  assert.deepEqual(loadSoundPrefs(s, HOST), { music: false, narrator: false, effects: true });
  s.set('gigawolf.sound.player', { roomCode: 'ABCDEFGH', music: true, narrator: true });
  assert.deepEqual(loadSoundPrefs(s, room('ABCDEFGH')), { music: true, narrator: true, effects: true });
  saveSoundPrefs(s, HOST, { music: true, narrator: true, effects: false });
  assert.deepEqual(loadSoundPrefs(s, HOST), { music: true, narrator: true, effects: false }, 'muting effects leaves music and narrator alone');
});

test('music plays in the lobby only: not once a game starts, back on Play again', () => {
  assert.equal(musicAllowed('lobby'), true);
  assert.equal(musicAllowed(null), true, 'before the first view arrives, so the Host or Join tap can start it');
  for (const phase of ['reveal', 'night', 'day', 'vote', 'shot', 'gameover']) assert.equal(musicAllowed(phase), false, phase);
});
