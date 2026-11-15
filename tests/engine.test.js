import test from 'node:test';
import assert from 'node:assert/strict';
import { reduce, PHASE, nightTargets } from '../js/game/engine.js';
import { presetFor, validate, roleList } from '../js/game/setup.js';
import { createRng } from '../js/util/rng.js';
import { lobby, game, act, submitNight, resolveNight, everyoneVotes, T0 } from './helpers.js';

// 7 players: p0 wolf, p1 wolf, p2 seer, p3 bodyguard, p4..p6 villagers
const R7 = ['werewolf', 'werewolf', 'seer', 'bodyguard', 'villager', 'villager', 'villager'];
// 5 players: p0 wolf, p1 seer, p2 bodyguard, p3,p4 villagers
const R5 = ['werewolf', 'seer', 'bodyguard', 'villager', 'villager'];

test('presets by player count', () => {
  assert.deepEqual(presetFor(5), { wolves: 1, seer: 1, bodyguard: 1, villagers: 2 });
  assert.deepEqual(presetFor(6), { wolves: 1, seer: 1, bodyguard: 1, villagers: 3 });
  assert.deepEqual(presetFor(7), { wolves: 2, seer: 1, bodyguard: 1, villagers: 3 });
  assert.deepEqual(presetFor(10), { wolves: 2, seer: 1, bodyguard: 1, villagers: 6 });
  assert.deepEqual(presetFor(11), { wolves: 3, seer: 1, bodyguard: 1, villagers: 6 });
  assert.deepEqual(presetFor(15), { wolves: 3, seer: 1, bodyguard: 1, villagers: 10 });
  assert.equal(presetFor(4), null);
  assert.equal(presetFor(36), null);
  assert.deepEqual(presetFor(35), { wolves: 7, seer: 1, bodyguard: 1, villagers: 26 }); // past 15 (bots): ~1 wolf in 5
  assert.ok(validate(presetFor(35), 35).ok);
});

test('validation rules', () => {
  assert.ok(validate(presetFor(8), 8).ok);
  assert.ok(!validate({ wolves: 0, seer: 1, bodyguard: 1, villagers: 3 }, 5).ok, 'needs a wolf');
  assert.ok(!validate({ wolves: 3, seer: 1, bodyguard: 0, villagers: 1 }, 5).ok, 'wolves < non-wolves');
  assert.ok(!validate({ wolves: 2, seer: 1, bodyguard: 1, villagers: 3 }, 8).ok, 'total mismatch');
  assert.ok(!validate(presetFor(5), 4).ok, 'too few players');
});

test('lobby: start needs host, 5+ players, valid counts', () => {
  const rng = createRng(3);
  let s = lobby(4, rng);
  assert.equal(reduce(s, { kind: 'startGame', by: 'p0', now: T0 }, rng).error.code, 'badSetup');
  s = reduce(s, { kind: 'join', by: 'p4', name: 'E', now: T0 }, rng).state;
  assert.equal(reduce(s, { kind: 'startGame', by: 'p1', now: T0 }, rng).error.code, 'forbidden');
  const bad = reduce(s, { kind: 'settings', by: 'p0', patch: { counts: { wolves: 3, seer: 1, bodyguard: 0, villagers: 1 } } }, rng).state;
  assert.equal(reduce(bad, { kind: 'startGame', by: 'p0', now: T0 }, rng).error.code, 'badSetup');
  const r = reduce(s, { kind: 'startGame', by: 'p0', now: T0 }, rng);
  assert.equal(r.state.phase, PHASE.REVEAL);
  const roles = r.state.players.map((p) => p.role).sort();
  assert.deepEqual(roles, ['bodyguard', 'seer', 'villager', 'villager', 'werewolf']);
});

test('role deal is repeatable with the same seed', () => {
  const a = lobby(7, createRng(9)); const b = lobby(7, createRng(9));
  const ra = reduce(a, { kind: 'startGame', by: 'p0', now: T0 }, createRng(5)).state;
  const rb = reduce(b, { kind: 'startGame', by: 'p0', now: T0 }, createRng(5)).state;
  assert.deepEqual(ra.players.map((p) => p.role), rb.players.map((p) => p.role));
});

test('reveal: night starts only when the host advances (even if not everyone is ready)', () => {
  const rng = createRng(1);
  let s = lobby(5, rng);
  s = reduce(s, { kind: 'startGame', by: 'p0', now: T0 }, rng).state;
  for (const p of s.players) s = reduce(s, { kind: 'ready', by: p.id, now: T0 }, rng).state;
  assert.equal(s.phase, PHASE.REVEAL, 'all ready does not auto-start');
  assert.equal(reduce(s, { kind: 'nextPhase', by: 'p2' }, rng).error.code, 'forbidden');
  s = reduce(s, { kind: 'nextPhase', by: 'p0' }, rng).state;
  assert.equal(s.phase, PHASE.NIGHT);
  assert.equal(s.round, 1);
  const idle = reduce(lobby(5, rng), { kind: 'startGame', by: 'p0', now: T0 }, rng).state;
  assert.equal(reduce(idle, { kind: 'nextPhase', by: 'p0' }, rng).state.phase, PHASE.NIGHT);
});

test('wolves kill the target; non-wolves cannot be targeted wrongly', () => {
  const g = game(R7);
  assert.equal(act(g, { kind: 'nightPick', by: 'p0', targetId: 'p1' }).error.code, 'badTarget'); // wolf
  assert.equal(act(g, { kind: 'nightPick', by: 'p0', targetId: 'p4' }).error, undefined);
  assert.equal(act(g, { kind: 'nightPick', by: 'p0', targetId: 'p5' }).error.code, 'alreadyActed');
  submitNight(g, { p1: 'p4', p2: 'p0', p3: 'p2' });
  resolveNight(g);
  assert.equal(g.s.players[4].alive, false);
  assert.equal(g.s.phase, PHASE.DAY);
});

test('wolf vote tie is broken at random among top-voted, repeatably by seed', () => {
  const outcomes = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const g = game(R7, { rng: createRng(seed) });
    submitNight(g, { p0: 'p4', p1: 'p5', p2: 'p0', p3: 'p2' });
    resolveNight(g);
    const dead = g.s.players.filter((p) => !p.alive).map((p) => p.id);
    assert.equal(dead.length, 1);
    assert.ok(['p4', 'p5'].includes(dead[0]));
    outcomes.add(dead[0]);
    const g2 = game(R7, { rng: createRng(seed) });
    submitNight(g2, { p0: 'p4', p1: 'p5', p2: 'p0', p3: 'p2' });
    resolveNight(g2);
    assert.deepEqual(g2.s.players.map((p) => p.alive), g.s.players.map((p) => p.alive));
  }
  assert.equal(outcomes.size, 2, 'both tied targets should occur across seeds');
});

test('majority beats minority among wolves', () => {
  const g = game(['werewolf', 'werewolf', 'werewolf', 'seer', 'bodyguard', 'villager', 'villager', 'villager', 'villager']);
  submitNight(g, { p0: 'p5', p1: 'p5', p2: 'p6', p3: 'p0', p4: 'p3' });
  resolveNight(g);
  assert.equal(g.s.players[5].alive, false);
  assert.equal(g.s.players[6].alive, true);
});

test('no wolf pick means no kill (host ends the night)', () => {
  const g = game(R7);
  assert.equal(g.s.phase, PHASE.NIGHT);
  resolveNight(g);
  assert.equal(g.s.phase, PHASE.DAY);
  assert.equal(g.s.players.filter((p) => !p.alive).length, 0);
  assert.equal(g.s.log.at(-1).text, 'Nobody died.');
});

test('bodyguard blocks the kill', () => {
  const g = game(R7);
  submitNight(g, { p0: 'p4', p1: 'p4', p2: 'p0', p3: 'p4' });
  resolveNight(g);
  assert.ok(g.s.players.every((p) => p.alive));
  assert.equal(g.s.log.at(-1).text, 'Nobody died.');
});

test('bodyguard cannot protect the same player two nights in a row', () => {
  const g = game(R7);
  submitNight(g, { p0: 'p5', p1: 'p5', p2: 'p0', p3: 'p4' });
  resolveNight(g);
  act(g, { kind: 'startVote', by: 'p0' });
  everyoneVotes(g, {}); // all skip
  act(g, { kind: 'nextPhase', by: 'p0' }); // result -> night 2
  assert.equal(g.s.round, 2);
  assert.equal(act(g, { kind: 'nightPick', by: 'p3', targetId: 'p4' }).error.code, 'badTarget');
  assert.equal(act(g, { kind: 'nightPick', by: 'p3', targetId: 'p6' }).error, undefined);
});

test('bodyguard restriction resets after a skipped night', () => {
  const g = game(R7);
  submitNight(g, { p0: 'p5', p1: 'p5', p2: 'p0', p3: 'p4' });
  resolveNight(g);
  act(g, { kind: 'startVote', by: 'p0' });
  everyoneVotes(g, {});
  act(g, { kind: 'nextPhase', by: 'p0' });
  resolveNight(g); // night 2: bodyguard skips
  assert.equal(g.s.phase, PHASE.DAY);
  assert.equal(g.s.bodyguardLast, null);
});

test('bodyguard self-protect is on by default and can be disabled', () => {
  const g = game(R7);
  assert.equal(act(g, { kind: 'nightPick', by: 'p3', targetId: 'p3' }).error, undefined);
  const g2 = game(R7, { settings: { bodyguardSelfProtect: false } });
  assert.equal(act(g2, { kind: 'nightPick', by: 'p3', targetId: 'p3' }).error.code, 'badTarget');
});

test('seer learns wolf / not wolf immediately after picking', () => {
  const g = game(R7);
  act(g, { kind: 'nightPick', by: 'p2', targetId: 'p0' });
  assert.deepEqual(g.s.night.seerResult, { targetId: 'p0', isWolf: true });
  const g2 = game(R7);
  act(g2, { kind: 'nightPick', by: 'p2', targetId: 'p4' });
  assert.deepEqual(g2.s.night.seerResult, { targetId: 'p4', isWolf: false });
  assert.equal(act(g2, { kind: 'nightPick', by: 'p2', targetId: 'p2' }).error.code, 'alreadyActed');
});

test('night never ends by itself; only the host ends it', () => {
  const g = game(R7);
  submitNight(g, { p0: 'p4', p1: 'p4', p2: 'p0', p3: 'p5' });
  assert.equal(g.s.phase, PHASE.NIGHT, 'everyone confirmed but still night');
  assert.equal(act(g, { kind: 'nextPhase', by: 'p2' }).error.code, 'forbidden');
  resolveNight(g);
  assert.equal(g.s.phase, PHASE.DAY);
});

test('day vote: most votes eliminated', () => {
  const g = game(R7);
  submitNight(g, { p0: 'p4', p1: 'p4', p2: 'p0', p3: 'p5' });
  resolveNight(g);
  act(g, { kind: 'startVote', by: 'p0' });
  assert.equal(g.s.phase, PHASE.VOTE);
  everyoneVotes(g, { p0: 'p6', p1: 'p6', p2: 'p0', p3: 'p0', p5: 'p0', p6: 'p0' });
  assert.equal(g.s.vote.result.eliminatedId, 'p0');
  assert.equal(g.s.players[0].alive, false);
});

test('day vote: tie means no elimination', () => {
  const g = game(R7);
  submitNight(g, { p0: 'p4', p1: 'p4', p2: 'p0', p3: 'p5' });
  resolveNight(g);
  act(g, { kind: 'startVote', by: 'p0' });
  everyoneVotes(g, { p0: 'p6', p1: 'p6', p2: 'p0', p3: 'p0', p5: 'skip', p6: 'skip' });
  assert.equal(g.s.vote.result.eliminatedId, null);
  assert.ok(g.s.players.filter((p) => p.alive).length === 6);
});

test('day vote: a tie means no elimination, and voting never times out', () => {
  const g = game(R7);
  submitNight(g, { p0: 'p4', p1: 'p4', p2: 'p0', p3: 'p5' });
  resolveNight(g);
  act(g, { kind: 'startVote', by: 'p0' });
  act(g, { kind: 'vote', by: 'p0', targetId: 'p6' });
  act(g, { kind: 'vote', by: 'p1', targetId: 'p6' });
  act(g, { kind: 'vote', by: 'p2', targetId: 'p6' });
  assert.equal(g.s.vote.stage, 'voting');
  assert.equal(g.s.vote.stage, 'voting', 'waits for everyone');
  for (const id of ['p3', 'p5', 'p6']) act(g, { kind: 'vote', by: id, targetId: 'skip' }); // 3 skips vs 3 for p6: tie
  assert.equal(g.s.vote.stage, 'result');
  assert.equal(g.s.vote.result.eliminatedId, null);
});

test('day vote validation and host-only startVote', () => {
  const g = game(R7);
  submitNight(g, { p0: 'p4', p1: 'p4', p2: 'p0', p3: 'p5' });
  resolveNight(g);
  assert.equal(act(g, { kind: 'startVote', by: 'p2' }).error.code, 'forbidden');
  act(g, { kind: 'startVote', by: 'p0' });
  assert.equal(act(g, { kind: 'vote', by: 'p0', targetId: 'p4' }).error.code, 'badTarget'); // dead
  assert.equal(act(g, { kind: 'vote', by: 'p0', targetId: 'p0' }).error.code, 'badTarget'); // self
  assert.equal(act(g, { kind: 'vote', by: 'p4', targetId: 'p0' }).error.code, 'dead');
});

test('a dead host can still start the vote', () => {
  const g = game(R7);
  submitNight(g, { p0: 'p4', p1: 'p4', p2: 'p0', p3: 'p5' });
  resolveNight(g);
  g.s.players.find((p) => p.id === 'p0').alive = false;
  assert.equal(act(g, { kind: 'startVote', by: 'p0' }).error, undefined);
  assert.equal(g.s.phase, PHASE.VOTE);
});

test('village wins when no wolves remain (day vote)', () => {
  const g = game(R5);
  submitNight(g, { p0: 'p3', p1: 'p0', p2: 'p4' });
  resolveNight(g);
  assert.equal(g.s.phase, PHASE.DAY);
  act(g, { kind: 'startVote', by: 'p0' });
  everyoneVotes(g, { p0: 'p1', p1: 'p0', p2: 'p0', p4: 'p0' });
  assert.equal(g.s.phase, PHASE.VOTE); // result screen first
  assert.equal(act(g, { kind: 'nextPhase', by: 'p2' }).error.code, 'forbidden');
  act(g, { kind: 'nextPhase', by: 'p0' });
  assert.equal(g.s.phase, PHASE.GAMEOVER);
  assert.equal(g.s.winner, 'village');
});

test('wolves win when living wolves >= living non-wolves (after night)', () => {
  // 5 players, 1 wolf. Kill someone at night (3 left: 1 wolf vs 3 non-wolf -> no), vote out one, kill again.
  const g = game(R5);
  submitNight(g, { p0: 'p3', p1: 'p0', p2: 'p4' });
  resolveNight(g);
  act(g, { kind: 'startVote', by: 'p0' });
  everyoneVotes(g, { p0: 'p1', p1: 'p2', p2: 'p1', p4: 'p1' }); // seer out: wolf + bg + vill left
  act(g, { kind: 'nextPhase', by: 'p0' });
  assert.equal(g.s.phase, PHASE.NIGHT);
  submitNight(g, { p0: 'p4', p2: 'p0' });
  resolveNight(g);
  assert.equal(g.s.phase, PHASE.GAMEOVER);
  assert.equal(g.s.winner, 'wolves');
});

test('wolves win by parity after a night kill (2 wolves vs 3 -> 2 v 2)', () => {
  const g = game(['werewolf', 'werewolf', 'seer', 'bodyguard', 'villager']);
  // 2 wolves vs 3 non-wolves; kill one at night -> 2v2
  submitNight(g, { p0: 'p4', p1: 'p4', p2: 'p0', p3: 'p2' });
  resolveNight(g);
  assert.equal(g.s.phase, PHASE.GAMEOVER);
  assert.equal(g.s.winner, 'wolves');
});

test('play again returns to the same lobby with the same players', () => {
  const g = game(['werewolf', 'werewolf', 'seer', 'bodyguard', 'villager']);
  submitNight(g, { p0: 'p4', p1: 'p4', p2: 'p0', p3: 'p2' });
  resolveNight(g);
  assert.equal(act(g, { kind: 'playAgain', by: 'p1' }).error.code, 'forbidden');
  act(g, { kind: 'playAgain', by: 'p0' });
  assert.equal(g.s.phase, PHASE.LOBBY);
  assert.equal(g.s.players.length, 5);
  assert.ok(g.s.players.every((p) => p.alive && p.role === null));
  assert.equal(g.s.log.length, 0);
});

test('duplicate nonce is ignored; resend is safe', () => {
  const g = game(R7);
  const r1 = act(g, { kind: 'nightPick', by: 'p0', targetId: 'p4', nonce: 'n1' });
  assert.equal(r1.error, undefined);
  const r2 = act(g, { kind: 'nightPick', by: 'p0', targetId: 'p4', nonce: 'n1' });
  assert.equal(r2.error, undefined);
  assert.equal(r2.effects.length, 0);
});

test('late join is refused once the game starts; rejoin by id works', () => {
  const g = game(R7);
  assert.equal(act(g, { kind: 'join', by: 'new', name: 'Zed' }).error.code, 'gameStarted');
  act(g, { kind: 'setConnected', by: 'p3', connected: false });
  assert.equal(g.s.players[3].connected, false);
  act(g, { kind: 'join', by: 'p3', name: 'whatever' });
  assert.equal(g.s.players[3].connected, true);
  assert.equal(g.s.players[3].name, 'Player3'); // name locked in-game
});

test('reduce does not mutate its input state', () => {
  const g = game(R7);
  const before = JSON.stringify(g.s);
  reduce(g.s, { kind: 'nightPick', by: 'p0', targetId: 'p4', now: T0 }, g.rng);
  assert.equal(JSON.stringify(g.s), before);
});

test('smoke: random play always reaches game over, for every player count', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const n = 5 + (seed % 11);
    const rng = createRng(seed);
    const g = game(roleList(presetFor(n)), { rng });
    let now = T0, guard = 0;
    while (g.s.phase !== PHASE.GAMEOVER && guard++ < 200) {
      const alive = g.s.players.filter((p) => p.alive);
      if (g.s.phase === PHASE.NIGHT) {
        for (const p of alive) {
          const t = nightTargets(g.s, p);
          act(g, { kind: 'nightPick', by: p.id, targetId: t.length ? t[Math.floor(rng() * t.length)] : null, now });
        }
        act(g, { kind: 'nextPhase', by: g.s.hostId });
      } else if (g.s.phase === PHASE.DAY) {
        act(g, { kind: 'startVote', by: g.s.hostId });
      } else if (g.s.phase === PHASE.VOTE) {
        for (const p of alive) {
          const others = alive.filter((x) => x.id !== p.id);
          act(g, { kind: 'vote', by: p.id, targetId: rng() < 0.2 ? 'skip' : others[Math.floor(rng() * others.length)].id, now });
        }
        act(g, { kind: 'nextPhase', by: g.s.hostId, now });
      }
    }
    assert.equal(g.s.phase, PHASE.GAMEOVER, `seed ${seed} (n=${n}) stalled`);
  }
});

test('host can end a running game early: nobody wins, non-hosts and lobby/gameover are refused', () => {
  const g = game(['werewolf', 'werewolf', 'seer', 'bodyguard', 'villager', 'villager', 'villager']);
  assert.ok(act(g, { kind: 'endEarly', by: 'p3' }).error, 'non-host refused');
  assert.equal(g.s.phase, PHASE.NIGHT);
  assert.ok(!act(g, { kind: 'endEarly', by: 'p0' }).error);
  assert.equal(g.s.phase, PHASE.GAMEOVER);
  assert.equal(g.s.winner, 'ended');
  assert.equal(g.s.history.at(-1).text, 'The host ended the game early.');
  assert.ok(act(g, { kind: 'endEarly', by: 'p0' }).error, 'already over');
  assert.ok(!act(g, { kind: 'playAgain', by: 'p0' }).error);
  assert.ok(act(g, { kind: 'endEarly', by: 'p0' }).error, 'lobby refused');
});
