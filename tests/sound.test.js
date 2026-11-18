import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSoundPrefs, saveSoundPrefs } from '../js/ui/soundprefs.js';

const memStorage = () => { const m = new Map(); return { get: (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), set: (k, v) => m.set(k, JSON.stringify(v)), remove: (k) => m.delete(k) }; };
const HOST = { isHost: true, roomCode: null };
const room = (roomCode) => ({ isHost: false, roomCode });

test('sound defaults: on for the host, off for players', () => {
  const s = memStorage();
  assert.deepEqual(loadSoundPrefs(s, HOST), { music: true, narrator: true, effects: true });
  assert.deepEqual(loadSoundPrefs(s, room('ABCDEFGH')), { music: false, narrator: false, effects: false });
});

test('host choices are kept across games', () => {
  const s = memStorage();
  saveSoundPrefs(s, HOST, { music: false, narrator: true, effects: false });
  assert.deepEqual(loadSoundPrefs(s, HOST), { music: false, narrator: true, effects: false });
  assert.deepEqual(loadSoundPrefs(s, room('ABCDEFGH')), { music: false, narrator: false, effects: false }, 'host choice does not leak to playing');
});

test('a player choice lasts only for the room it was set in', () => {
  const s = memStorage();
  saveSoundPrefs(s, room('ABCDEFGH'), { music: true, narrator: false, effects: true });
  assert.deepEqual(loadSoundPrefs(s, room('ABCDEFGH')), { music: true, narrator: false, effects: true });
  assert.deepEqual(loadSoundPrefs(s, room('ZZZZYYYY')), { music: false, narrator: false, effects: false });
  assert.deepEqual(loadSoundPrefs(s, HOST), { music: true, narrator: true, effects: true }, 'player choice does not change host defaults');
});

test('old host music mute carries over', () => {
  const s = memStorage();
  s.set('gigawolf.music.muted', true);
  assert.deepEqual(loadSoundPrefs(s, HOST), { music: false, narrator: true, effects: true });
});

test('effects are their own switch, and choices saved before effects existed get its default', () => {
  const s = memStorage();
  s.set('gigawolf.sound.host', { music: false, narrator: false });
  assert.deepEqual(loadSoundPrefs(s, HOST), { music: false, narrator: false, effects: true });
  s.set('gigawolf.sound.player', { roomCode: 'ABCDEFGH', music: true, narrator: true });
  assert.deepEqual(loadSoundPrefs(s, room('ABCDEFGH')), { music: true, narrator: true, effects: false });
  saveSoundPrefs(s, HOST, { music: true, narrator: true, effects: false });
  assert.deepEqual(loadSoundPrefs(s, HOST), { music: true, narrator: true, effects: false }, 'muting effects leaves music and narrator alone');
});
