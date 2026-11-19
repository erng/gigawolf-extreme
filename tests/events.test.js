// Random events: Lucky Horseshoe.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PHASE, rollEvent, EVENT_CHANCE, EVENT_LINES, DEFAULT_SETTINGS } from '../js/game/engine.js';
import { viewFor } from '../js/game/views.js';
import { createRng } from '../js/util/rng.js';
import { setLang, tr } from '../js/i18n.js';
import { parseLine, parseLines, sfxPlan } from '../js/ui/fx.js';
import { SOUNDS } from '../js/ui/sfx.js';
import { game, act, everyoneVotes, T0 } from './helpers.js';

const host = (g, kind) => act(g, { kind, by: 'p0' });
const alive = (g, id) => g.s.players.find((p) => p.id === id).alive;
// p0, p1 wolves; p2 Seer; p3 Bodyguard; p4 Witch; p5-p7 villagers
const R8 = ['werewolf', 'werewolf', 'seer', 'bodyguard', 'witch', 'villager', 'villager', 'villager'];

// Force the game's event (helpers start games with events off).
function withEvent(kind, round, roles = R8, settings = {}) {
  const g = game(roles, { settings });
  g.s.event = { kind, round, fired: false };
  return g;
}

// One night. Wolves go for `victim`; the Bodyguard protects `bg` (or nobody); the Witch does `witch`.
function night(g, { victim, bg = null, witch = 'pass' }) {
  const pick = (by, targetId) => { const p = g.s.players.find((x) => x.id === by); if (p.alive) { const r = act(g, { kind: 'nightPick', by, targetId }); assert.ok(!r.error, `${by}: ${r.error?.message}`); } };
  pick('p0', victim); pick('p1', victim);
  for (const p of g.s.players.filter((x) => x.alive && !(x.id in g.s.night.picks))) {
    if (p.role === 'witch') pick(p.id, witch);
    else if (p.role === 'seer') pick(p.id, 'p0');
    else if (p.role === 'bodyguard') { if (bg) pick(p.id, bg); }
    else pick(p.id, alive(g, 'p0') ? 'p0' : null); // the no-power players suspect p0, so a suspicion line shows
  }
  return host(g, 'nextPhase');
}

// Day: the vote. Living players vote as given (default Skip); ghosts vote as given or pass.
function day(g, votes = {}, ghostVotes = {}) {
  host(g, 'startVote');
  for (const id of g.s.vote.ghosts) if (id in ghostVotes) act(g, { kind: 'vote', by: id, targetId: ghostVotes[id] });
  everyoneVotes(g, votes);
}

test('rollEvent: about 1 game in 5, on dawn 1 or 2', () => {
  assert.equal(EVENT_CHANCE, 0.2);
  assert.equal(DEFAULT_SETTINGS.randomEvents, true, 'on by default');
  const rng = createRng(7);
  let fired = 0; const rounds = new Set();
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const e = rollEvent({ randomEvents: true }, rng);
    if (!e) continue;
    fired++; rounds.add(e.round);
    assert.deepEqual({ kind: e.kind, fired: e.fired }, { kind: 'horseshoe', fired: false });
  }
  assert.ok(Math.abs(fired / N - 0.2) < 0.015, `event rate ${fired / N}`);
  assert.deepEqual([...rounds].sort(), [1, 2]);
  for (let i = 0; i < 200; i++) assert.equal(rollEvent({ randomEvents: false }, rng), null);
});

test('the event is rolled at start, kept from every phone, and cleared by play again', () => {
  let found = false;
  for (let seed = 1; seed < 80 && !found; seed++) {
    const g = game(R8, { settings: { randomEvents: true }, rng: createRng(seed) });
    // game() starts with the rolled event; it is host state only
    if (!g.s.event) continue;
    found = true;
    for (const p of g.s.players) assert.ok(!/"(event|horseshoe|fired)"/.test(JSON.stringify(viewFor(g.s, p.id))), 'no phone learns an event is coming');
    host(g, 'endEarly'); host(g, 'playAgain');
    assert.equal(g.s.event, null); assert.equal(g.s.horseshoe, null);
  }
  assert.ok(found, 'some seed rolls an event');
});

test('Lucky Horseshoe: announced at its dawn after the deaths; only the holder is told', () => {
  const g = withEvent('horseshoe', 1);
  night(g, { victim: 'p7' });
  assert.equal(g.s.phase, PHASE.DAY);
  assert.equal(g.s.lines[0], 'Player7 was killed in the night.');
  assert.equal(g.s.lines[1], EVENT_LINES.horseshoe, 'after the deaths');
  assert.deepEqual(g.s.lines.slice(2), ['Most suspected: Player0.'], 'before the suspicion line');
  const hs = g.s.horseshoe;
  assert.ok(hs && alive(g, hs.id), 'a living player holds it');
  for (const p of g.s.players) {
    const v = viewFor(g.s, p.id);
    assert.ok(v.announce.includes(EVENT_LINES.horseshoe), 'everyone hears the dawn line');
    const told = p.id === hs.id && !['werewolf'].includes(p.role);
    assert.equal(!!v.you.private.horseshoe, told);
    if (told) assert.deepEqual(v.you.private.horseshoe, { used: false, fresh: true });
  }
  assert.ok(g.s.history.some((e) => /found the lucky horseshoe/.test(e.text)));
});

test('Lucky Horseshoe: blocks one wolf attack on its holder, then it is gone', () => {
  const g = withEvent('horseshoe', 1);
  night(g, { victim: 'p7' });
  g.s.horseshoe.id = 'p6'; // make the holder a villager for the test
  day(g);
  host(g, 'nextPhase'); // vote result -> night 2
  assert.equal(viewFor(g.s, 'p6').you.private.horseshoe.fresh, false, 'news only on its day');
  night(g, { victim: 'p6' });
  assert.ok(alive(g, 'p6'), 'saved');
  assert.deepEqual(g.s.lines.filter((l) => !l.startsWith('Most suspected')), ['Nobody died.'], 'the save looks like any quiet night');
  assert.equal(g.s.horseshoe.used, true);
  assert.deepEqual(viewFor(g.s, 'p6').you.private.horseshoe, { used: true, fresh: true });
  assert.ok(g.s.history.some((e) => e.text === 'Player6 (Villager) was attacked but the lucky horseshoe saved them.'));
  day(g);
  host(g, 'nextPhase');
  night(g, { victim: 'p6' });
  assert.ok(!alive(g, 'p6'), 'a second attack kills');
});

test('Lucky Horseshoe: not spent when the Bodyguard or the Witch already saved the holder; poison still kills', () => {
  let g = withEvent('horseshoe', 1);
  night(g, { victim: 'p7', bg: 'p3' });
  g.s.horseshoe.id = 'p6';
  day(g); host(g, 'nextPhase');
  night(g, { victim: 'p6', bg: 'p6' });
  assert.ok(alive(g, 'p6')); assert.equal(g.s.horseshoe.used, false, 'Bodyguard saved them first');

  g = withEvent('horseshoe', 1);
  night(g, { victim: 'p7' });
  g.s.horseshoe.id = 'p6';
  day(g); host(g, 'nextPhase');
  night(g, { victim: 'p6', witch: 'heal:p6' });
  assert.ok(alive(g, 'p6')); assert.equal(g.s.horseshoe.used, false, 'the heal saved them first');

  g = withEvent('horseshoe', 1);
  night(g, { victim: 'p7' });
  g.s.horseshoe.id = 'p6';
  day(g); host(g, 'nextPhase');
  night(g, { victim: 'p5', witch: 'poison:p6' });
  assert.ok(!alive(g, 'p6'), 'it blocks wolves only');
  assert.equal(g.s.horseshoe.used, false);
});

test('Lucky Horseshoe: on a wolf it is wasted and nobody is told', () => {
  const g = withEvent('horseshoe', 1);
  night(g, { victim: 'p7' });
  g.s.horseshoe.id = 'p1';
  for (const p of g.s.players) assert.equal(viewFor(g.s, p.id).you.private.horseshoe, undefined);
  day(g, { p2: 'p1', p3: 'p1', p4: 'p1', p5: 'p1', p6: 'p1' });
  assert.ok(!alive(g, 'p1'), 'no help against a vote');
});

test('Lucky Horseshoe: does not happen when the game ends at its dawn', () => {
  const g = withEvent('horseshoe', 1, ['werewolf', 'seer', 'villager', 'villager', 'villager'], {});
  g.s.players.find((p) => p.id === 'p2').alive = false; g.s.players.find((p) => p.id === 'p3').alive = false; // 1 wolf vs 3
  const r1 = act(g, { kind: 'nightPick', by: 'p0', targetId: 'p4' });
  assert.ok(!r1.error);
  host(g, 'nextPhase');
  assert.equal(g.s.phase, PHASE.GAMEOVER);
  assert.equal(g.s.event.fired, false);
  assert.ok(!g.s.log.some((l) => l.text === EVENT_LINES.horseshoe));
});

test('event lines: cards with the event sound, fully translated to Thai', () => {
  for (const [kind, text] of Object.entries(EVENT_LINES)) {
    assert.equal(parseLine(text).type, kind);
    assert.deepEqual(sfxPlan(parseLines([text])).map((s) => s.name), ['event']);
  }
  assert.ok(SOUNDS.includes('event'));
  setLang('th');
  try {
    const lines = [...Object.values(EVENT_LINES),
      'P3 (Villager) found the lucky horseshoe.',
      'P3 (Werewolf) found the lucky horseshoe, but wolves are never attacked, so it did nothing.',
      'P3 (Villager) was attacked but the lucky horseshoe saved them.'];
    for (const l of lines) assert.ok(!/[A-Za-z]{3,}/.test(tr(l)), `untranslated: ${l} -> ${tr(l)}`);
  } finally { setLang('en'); }
});

test('the host can turn random events off in the lobby; then no game gets one', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const g = game(R8, { rng: createRng(seed) }); // the helper turns them off
    assert.equal(g.s.settings.randomEvents, false);
    assert.equal(g.s.event, null);
  }
  const g = game(R8);
  host(g, 'endEarly'); host(g, 'playAgain');
  assert.ok(act(g, { kind: 'settings', by: 'p2', patch: { randomEvents: true } }).error, 'only the host');
  assert.ok(!act(g, { kind: 'settings', by: 'p0', patch: { randomEvents: true } }).error);
  assert.equal(viewFor(g.s, 'p2').settings.randomEvents, true, 'every phone sees the setting, like the other options');
});

void T0;
