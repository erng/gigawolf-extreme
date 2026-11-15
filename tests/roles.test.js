import test from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../js/game/engine.js';
import { viewFor } from '../js/game/views.js';
import { presetFor, validate, roleList } from '../js/game/setup.js';
import { game, act, submitNight, resolveNight, everyoneVotes, lobby, T0 } from './helpers.js';
import { reduce } from '../js/game/engine.js';
import { createRng } from '../js/util/rng.js';

const host = (g, kind) => act(g, { kind, by: 'p0' });
const alive = (g, id) => g.s.players.find((p) => p.id === id).alive;
const startVote = (g) => host(g, 'startVote');

// 8 players: p0,p1 wolves, p2 seer, p3 bodyguard, p4 hunter, p5 witch, p6 prince, p7 jester
const R8 = ['werewolf', 'werewolf', 'seer', 'bodyguard', 'hunter', 'witch', 'prince', 'jester'];

// Everyone but the listed roles does a harmless night. Wolves hit `victim`.
function quietNight(g, { victim, extra = {} }) {
  const picks = { p0: victim, p1: victim, p2: 'p0', p3: 'p3', p5: 'pass', ...extra };
  for (const p of g.s.players) {
    if (p.alive && p.id in picks && p.id in g.s.night.picks === false) {
      act(g, { kind: 'nightPick', by: p.id, targetId: picks[p.id] });
    }
  }
  submitNight(g, picks);
  return resolveNight(g);
}

test('presets stay the original classic sets; the host may override them at any size', () => {
  assert.deepEqual(presetFor(5), { wolves: 1, seer: 1, bodyguard: 1, villagers: 2 });
  assert.deepEqual(presetFor(8), { wolves: 2, seer: 1, bodyguard: 1, villagers: 4 });
  // extras are fine even with 5 players
  assert.ok(validate({ wolves: 1, seer: 1, hunter: 1, witch: 1, villagers: 1 }, 5).ok);
  assert.ok(validate({ wolves: 1, wolfcub: 0, jester: 1, prince: 1, seer: 1, villagers: 1 }, 5).ok);
  // wolf cubs count on the wolf side for the parity rule
  assert.ok(!validate({ wolves: 1, wolfcub: 2, villagers: 3 }, 6).ok);
  assert.deepEqual(roleList({ wolves: 1, wolfcub: 1, hunter: 1, witch: 1, prince: 1, jester: 1, seer: 0, bodyguard: 0, villagers: 0 }).sort(),
    ['hunter', 'jester', 'prince', 'werewolf', 'witch', 'wolfcub']);
});

test('game-breaking setups are rejected, with a reason', () => {
  const errs = (c, n) => validate(c, n).errors.join(' | ');
  // instant win / loss
  assert.match(errs({ wolves: 0, seer: 1, villagers: 4 }, 5), /at least 1 werewolf/);
  assert.match(errs({ wolves: 3, villagers: 2 }, 5), /fewer than non-wolves/);
  // one night kill and the wolves win; nothing can stop it
  assert.match(errs({ wolves: 2, seer: 1, villagers: 2 }, 5), /win on the first night/);
  assert.match(errs({ wolves: 1, wolfcub: 1, villagers: 3 }, 5), /win on the first night/);
  assert.match(errs({ wolves: 2, seer: 1, bodyguard: 1, villagers: 1 }, 5), /win on the first night/, 'a bodyguard only guesses');
  assert.ok(validate({ wolves: 2, witch: 1, seer: 1, villagers: 1 }, 5).ok, 'a witch can reliably save the victim');
  assert.ok(validate({ wolves: 2, seer: 1, villagers: 3 }, 6).ok, 'one more player and it is playable');
  // a village that is only Jesters: the first vote hands the Jester the win
  assert.match(errs({ wolves: 1, jester: 4 }, 5), /not a Jester/);
  assert.ok(validate({ wolves: 1, jester: 3, villagers: 1 }, 5).ok);
  // a lone wolf vs only Hunters: the shots chain until the wolf is hit
  assert.match(errs({ wolves: 1, hunter: 4 }, 5), /lone wolf/);
  assert.match(errs({ wolfcub: 1, hunter: 5 }, 6), /lone wolf/);
  assert.ok(validate({ wolves: 1, hunter: 3, villagers: 1 }, 5).ok);
  assert.ok(validate({ wolves: 2, hunter: 4 }, 6).ok, 'two wolves can survive the chain');
});

test('host can configure extra roles in the lobby and they get dealt', () => {
  const rng = createRng(4);
  let s = lobby(8, rng);
  const counts = { wolves: 1, wolfcub: 1, seer: 1, bodyguard: 0, hunter: 1, witch: 1, prince: 1, jester: 1, villagers: 1 };
  s = reduce(s, { kind: 'settings', by: 'p0', patch: { counts } }, rng).state;
  s = reduce(s, { kind: 'startGame', by: 'p0', now: T0 }, rng).state;
  assert.deepEqual(s.players.map((p) => p.role).sort(), roleList(counts).sort());
  assert.deepEqual(s.players.find((p) => p.role === 'witch').potions, { heal: true, poison: true });
});

// ---------- hunter ----------
test('hunter killed at night takes a last shot before the day starts', () => {
  const g = game(R8);
  quietNight(g, { victim: 'p4' });
  assert.equal(g.s.phase, PHASE.SHOT);
  assert.equal(viewFor(g.s, 'p4').prompt.kind, 'shoot');
  assert.equal(viewFor(g.s, 'p2').prompt, null);
  assert.equal(act(g, { kind: 'shoot', by: 'p2', targetId: 'p0' }).error.code, 'forbidden');
  assert.equal(act(g, { kind: 'shoot', by: 'p4', targetId: 'p4' }).error.code, 'badTarget'); // dead target
  assert.ok(!act(g, { kind: 'shoot', by: 'p4', targetId: 'p1' }).error);
  assert.equal(alive(g, 'p1'), false);
  assert.equal(g.s.phase, PHASE.DAY);
  assert.equal(g.s.lines.length, 2);
});

test('the host can skip a hunter who never shoots', () => {
  const g = game(R8);
  quietNight(g, { victim: 'p4' });
  host(g, 'nextPhase');
  assert.equal(g.s.phase, PHASE.DAY);
  assert.equal(g.s.players.filter((p) => !p.alive).length, 1);
});

test('hunter voted out shoots, then the vote result screen returns', () => {
  const g = game(R8);
  quietNight(g, { victim: 'p7' });
  startVote(g);
  const votes = Object.fromEntries(['p0', 'p1', 'p2', 'p3', 'p5', 'p6'].map((id) => [id, 'p4']));
  votes.p4 = 'p0';
  everyoneVotes(g, votes);
  assert.equal(g.s.phase, PHASE.SHOT);
  act(g, { kind: 'shoot', by: 'p4', targetId: 'p1' });
  assert.equal(g.s.phase, PHASE.VOTE);
  assert.equal(g.s.vote.stage, 'result');
  assert.equal(viewFor(g.s, 'p2').announce.length, 2);
  assert.equal(g.s.winner, null);
  host(g, 'nextPhase');
  assert.equal(g.s.phase, PHASE.NIGHT);
});

test('a hunter shot can win the game for the village', () => {
  // p0 wolf, p1 hunter, p2 seer, p3 bodyguard, p4 villager, p5 villager
  const g = game(['werewolf', 'hunter', 'seer', 'bodyguard', 'villager', 'villager']);
  submitNight(g, { p0: 'p1', p2: 'p4', p3: 'p4' });
  resolveNight(g);
  assert.equal(g.s.phase, PHASE.SHOT);
  act(g, { kind: 'shoot', by: 'p1', targetId: 'p0' });
  assert.equal(g.s.phase, PHASE.GAMEOVER);
  assert.equal(g.s.winner, 'village');
});

test('a hunter who dies when nobody is left alive has nobody to shoot, and the game still ends', () => {
  // cub (revenge night, two kills) + two witches poisoning each other and the hunter: everyone dies at once
  const g = game(['wolfcub', 'hunter', 'witch', 'witch', 'villager']);
  g.s.players[4].alive = false;
  g.s.night.doubleKill = true;
  act(g, { kind: 'nightPick', by: 'p0', targetId: 'p2', targetId2: 'p3' });
  act(g, { kind: 'nightPick', by: 'p2', targetId: 'poison:p1' });
  act(g, { kind: 'nightPick', by: 'p3', targetId: 'poison:p0' });
  act(g, { kind: 'nightPick', by: 'p1', targetId: null });
  assert.ok(!resolveNight(g).error);
  assert.equal(g.s.players.filter((p) => p.alive).length, 0);
  assert.equal(g.s.phase, PHASE.GAMEOVER);
  assert.deepEqual(g.s.shots, []);
});

test('the last shot can kill the last player without leaving a dangling shot', () => {
  const g = game(['werewolf', 'hunter', 'witch', 'villager', 'villager']);
  g.s.players[3].alive = false; g.s.players[4].alive = false;
  act(g, { kind: 'nightPick', by: 'p0', targetId: 'p2' }); // wolf kills the witch
  act(g, { kind: 'nightPick', by: 'p2', targetId: 'poison:p1' }); // the witch poisons the hunter
  act(g, { kind: 'nightPick', by: 'p1', targetId: null });
  resolveNight(g);
  assert.equal(g.s.phase, PHASE.SHOT);
  act(g, { kind: 'shoot', by: 'p1', targetId: 'p0' });
  assert.equal(g.s.phase, PHASE.GAMEOVER);
  assert.equal(g.s.winner, 'village');
});

// ---------- wolf cub ----------
// p0 wolf, p1 cub, p2 seer, p3 bodyguard, p4..p7 villagers
const RC = ['werewolf', 'wolfcub', 'seer', 'bodyguard', 'villager', 'villager', 'villager', 'villager'];

test('wolf cub looks like a wolf to the seer and joins the pack', () => {
  const g = game(RC);
  assert.deepEqual(viewFor(g.s, 'p0').you.private.teammates.map((t) => t.id), ['p1']);
  assert.deepEqual(viewFor(g.s, 'p1').you.private.teammates.map((t) => t.id), ['p0']);
  act(g, { kind: 'nightPick', by: 'p2', targetId: 'p1' });
  assert.equal(viewFor(g.s, 'p2').you.private.seerResult.isWolf, true);
});

test('when the cub dies the wolves kill two people the next night', () => {
  const g = game(RC);
  submitNight(g, { p0: 'p4', p1: 'p4', p2: 'p0', p3: 'p3' });
  resolveNight(g);
  startVote(g);
  everyoneVotes(g, Object.fromEntries(g.s.players.filter((p) => p.alive && p.id !== 'p1').map((p) => [p.id, 'p1'])));
  host(g, 'nextPhase'); // result -> night 2
  assert.equal(g.s.phase, PHASE.NIGHT);
  assert.equal(g.s.night.doubleKill, true);
  const wolf = viewFor(g.s, 'p0').prompt;
  assert.equal(wolf.picks, 2);
  assert.equal(act(g, { kind: 'nightPick', by: 'p0', targetId: 'p5' }).error.code, 'badTarget'); // needs two
  assert.equal(act(g, { kind: 'nightPick', by: 'p0', targetId: 'p5', targetId2: 'p5' }).error.code, 'badTarget');
  assert.ok(!act(g, { kind: 'nightPick', by: 'p0', targetId: 'p5', targetId2: 'p6' }).error);
  submitNight(g, { p2: 'p0', p3: 'p2' });
  resolveNight(g);
  assert.equal(alive(g, 'p5'), false);
  assert.equal(alive(g, 'p6'), false);
  // ...and only once: the next night is a normal single kill
  startVote(g); everyoneVotes(g, {}); host(g, 'nextPhase');
  assert.equal(g.s.night.doubleKill, false);
});

test('a cub killed in the night also triggers the revenge on the following night', () => {
  const g = game(['werewolf', 'wolfcub', 'witch', 'seer', 'villager', 'villager', 'villager', 'villager']);
  // wolves hit a villager; the witch poisons the cub
  act(g, { kind: 'nightPick', by: 'p0', targetId: 'p4' });
  act(g, { kind: 'nightPick', by: 'p1', targetId: 'p4' });
  act(g, { kind: 'nightPick', by: 'p2', targetId: 'poison:p1' });
  submitNight(g, { p3: 'p0' });
  resolveNight(g);
  assert.equal(alive(g, 'p1'), false);
  startVote(g); everyoneVotes(g, {}); host(g, 'nextPhase');
  assert.equal(g.s.night.doubleKill, true);
});

// ---------- witch ----------
test('witch sees the wolf victim only after every wolf has chosen, and can heal them', () => {
  const g = game(R8);
  assert.equal(viewFor(g.s, 'p5').prompt.healTargets, null);
  assert.equal(act(g, { kind: 'nightPick', by: 'p5', targetId: 'heal:p7' }).error.code, 'tooEarly');
  act(g, { kind: 'nightPick', by: 'p0', targetId: 'p7' });
  assert.equal(viewFor(g.s, 'p5').prompt.healTargets, null, 'one wolf still undecided');
  act(g, { kind: 'nightPick', by: 'p1', targetId: 'p7' });
  assert.deepEqual(viewFor(g.s, 'p5').prompt.healTargets, ['p7']);
  for (const id of ['p0', 'p1', 'p2', 'p3', 'p4', 'p6', 'p7']) {
    assert.ok(!('healTargets' in (viewFor(g.s, id).prompt ?? {})), `${id} must not see the victim`);
  }
  assert.equal(act(g, { kind: 'nightPick', by: 'p5', targetId: 'heal:p6' }).error.code, 'badTarget');
  assert.ok(!act(g, { kind: 'nightPick', by: 'p5', targetId: 'heal:p7' }).error);
  submitNight(g, { p2: 'p0', p3: 'p3' });
  resolveNight(g);
  assert.equal(alive(g, 'p7'), true);
  assert.equal(g.s.lines[0], 'Nobody died.');
  assert.deepEqual(viewFor(g.s, 'p5').you.private.potions, { heal: false, poison: true });
});

test('witch potions are single-use and poison kills', () => {
  const g = game(R8);
  quietNight(g, { victim: 'p7', extra: { p5: 'poison:p6' } });
  assert.equal(alive(g, 'p6'), false);
  assert.equal(alive(g, 'p7'), false);
  startVote(g); everyoneVotes(g, {}); host(g, 'nextPhase');
  assert.equal(act(g, { kind: 'nightPick', by: 'p5', targetId: 'poison:p2' }).error.code, 'noPotion');
  act(g, { kind: 'nightPick', by: 'p0', targetId: 'p3' });
  act(g, { kind: 'nightPick', by: 'p1', targetId: 'p3' });
  assert.deepEqual(viewFor(g.s, 'p5').prompt.healTargets, ['p3'], 'heal potion kept: she can still save tonight\'s victim');
});

test('bodyguard and witch cannot both be wasted: protected victim survives, heal stays usable', () => {
  const g = game(R8);
  act(g, { kind: 'nightPick', by: 'p0', targetId: 'p2' });
  act(g, { kind: 'nightPick', by: 'p1', targetId: 'p2' });
  submitNight(g, { p2: 'p0', p3: 'p2', p5: 'pass' });
  resolveNight(g);
  assert.equal(alive(g, 'p2'), true);
  assert.deepEqual(g.s.players.find((p) => p.id === 'p5').potions, { heal: true, poison: true });
});

// ---------- prince ----------
test('prince survives the first vote, is revealed to all, and can die the second time', () => {
  const g = game(R8);
  quietNight(g, { victim: 'p7' });
  startVote(g);
  const others = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'];
  everyoneVotes(g, Object.fromEntries(others.map((id) => [id, 'p6'])));
  assert.equal(alive(g, 'p6'), true);
  assert.equal(g.s.vote.result.princeId, 'p6');
  const v = viewFor(g.s, 'p0');
  assert.equal(v.players.find((p) => p.id === 'p6').role, 'prince');
  assert.equal(v.players.find((p) => p.id === 'p6').revealed, true);
  host(g, 'nextPhase');
  submitNight(g, { p0: 'p2', p1: 'p2', p2: 'p0', p3: 'p2', p5: 'pass' }); // the bodyguard saves the seer
  resolveNight(g);
  startVote(g);
  everyoneVotes(g, Object.fromEntries(['p0', 'p1', 'p2', 'p3', 'p5'].map((id) => [id, 'p6'])));
  assert.equal(alive(g, 'p6'), false);
});

test('an unrevealed prince is secret', () => {
  const g = game(R8);
  assert.equal(viewFor(g.s, 'p0').players.find((p) => p.id === 'p6').role, null);
});

// ---------- jester ----------
test('jester voted out wins alone', () => {
  const g = game(R8);
  quietNight(g, { victim: 'p4' });
  act(g, { kind: 'shoot', by: 'p4', targetId: 'p3' });
  startVote(g);
  everyoneVotes(g, Object.fromEntries(['p0', 'p1', 'p2', 'p5', 'p6'].map((id) => [id, 'p7'])));
  assert.equal(g.s.phase, PHASE.VOTE);
  assert.equal(g.s.winner, 'jester');
  host(g, 'nextPhase');
  assert.equal(g.s.phase, PHASE.GAMEOVER);
  assert.equal(viewFor(g.s, 'p7').winner, 'jester');
  assert.equal(viewFor(g.s, 'p7').you.team, 'jester');
  assert.equal(g.s.log.at(-1).text, 'The Jester wins!');
});

test('jester killed by the wolves does not win, and jester loses when others win', () => {
  const g = game(R8);
  quietNight(g, { victim: 'p7' });
  assert.equal(alive(g, 'p7'), false);
  assert.equal(g.s.winner, null);

  // village wins while a jester is alive: jester is not the winner
  const h = game(['werewolf', 'seer', 'bodyguard', 'jester', 'villager', 'villager']);
  submitNight(h, { p0: 'p4', p1: 'p0', p2: 'p4' });
  resolveNight(h);
  startVote(h);
  everyoneVotes(h, Object.fromEntries(['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => [id, 'p0'])));
  host(h, 'nextPhase');
  assert.equal(h.s.phase, PHASE.GAMEOVER);
  assert.equal(h.s.winner, 'village');
  assert.notEqual(viewFor(h.s, 'p3').you.team, h.s.winner);
});

test('a living jester counts as a non-wolf for parity', () => {
  // 1 wolf vs jester + villager: wolf needs to be >= others to win
  const g = game(['werewolf', 'jester', 'villager', 'villager', 'villager', 'seer']);
  submitNight(g, { p0: 'p2', p5: 'p0' });
  resolveNight(g);
  assert.equal(g.s.winner, null);
});

// ---------- secrecy ----------
test('night views never leak roles of the new characters', () => {
  const g = game(R8);
  for (const me of g.s.players) {
    const v = viewFor(g.s, me.id);
    for (const p of v.players) {
      if (p.id !== me.id) assert.equal(p.role, null, `${me.id} sees ${p.id}'s role`);
    }
  }
  assert.equal(viewFor(g.s, 'p6').prompt.kind, 'night'); // prince gets a decoy prompt like a villager
  assert.equal(viewFor(g.s, 'p6').prompt.required, false);
  assert.equal(viewFor(g.s, 'p7').prompt.required, false);
  assert.equal(viewFor(g.s, 'p4').prompt.required, false);
});

test('randomize: always valid for every player count, and the mix is never exposed', async () => {
  const { randomCounts } = await import('../js/game/setup.js');
  const rng = createRng(7);
  for (let n = 5; n <= 15; n++) {
    for (let i = 0; i < 300; i++) {
      const c = randomCounts(n, rng);
      assert.ok(validate(c, n).ok, `n=${n} ${JSON.stringify(c)}`);
    }
  }
  const g = { s: lobby(6), rng: createRng(3) };
  act(g, { kind: 'settings', by: 'p0', patch: { randomize: true } });
  for (const p of g.s.players) assert.equal(viewFor(g.s, p.id).settings.counts, null);
  host(g, 'startGame');
  assert.equal(g.s.phase, PHASE.REVEAL);
  assert.ok(validate(Object.fromEntries(Object.entries({ wolves: 'werewolf', wolfcub: 'wolfcub', seer: 'seer', bodyguard: 'bodyguard', hunter: 'hunter', witch: 'witch', prince: 'prince', jester: 'jester', villagers: 'villager' }).map(([k, r]) => [k, g.s.players.filter((p) => p.role === r).length])), 6).ok);
  for (const p of g.s.players) assert.equal(viewFor(g.s, p.id).settings.counts, null);
});
