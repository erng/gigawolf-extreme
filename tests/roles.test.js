import test from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../js/game/engine.js';
import { viewFor } from '../js/game/views.js';
import { presetFor, validate, roleList, randomCounts } from '../js/game/setup.js';
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
      // balanced: no stacked specials in small groups, enough plain villagers
      for (const k of ['seer', 'bodyguard', 'witch', 'hunter', 'prince', 'jester']) {
        assert.ok(c[k] <= (n >= 12 && k !== 'jester' ? 2 : 1), `n=${n} ${k} ${JSON.stringify(c)}`);
      }
      assert.ok(c.villagers >= Math.ceil((n - c.wolves - c.wolfcub) / 3), `n=${n} villagers ${JSON.stringify(c)}`);
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

// ---------- diseased villager ----------
// p0,p1 wolves, p2 seer, p3 witch, p4 diseased villager, p5..p7 villagers
const RD = ['werewolf', 'werewolf', 'seer', 'witch', 'diseased', 'villager', 'villager', 'villager'];

function dayToNight(g) { startVote(g); everyoneVotes(g, {}); host(g, 'nextPhase'); }

test('diseased villager: validates, is dealt, and gets the decoy prompt', () => {
  assert.ok(validate({ wolves: 1, diseased: 2, seer: 1, villagers: 1 }, 5).ok);
  assert.deepEqual(roleList({ wolves: 1, diseased: 1, villagers: 3 }).sort(), ['diseased', 'villager', 'villager', 'villager', 'werewolf']);
  const g = game(RD);
  const pr = viewFor(g.s, 'p4').prompt;
  assert.equal(pr.text, 'Who do you suspect?');
  assert.equal(pr.required, false);
  assert.equal(viewFor(g.s, 'p4').you.team, 'village');
});

test('diseased: killed by the wolves, next night the wolves cannot kill but can still confirm', () => {
  const g = game(RD);
  quietNight(g, { victim: 'p4', extra: { p3: 'pass' } });
  assert.equal(alive(g, 'p4'), false);
  assert.equal(g.s.players.filter((p) => !p.alive).length, 1);
  assert.deepEqual(viewFor(g.s, 'p5').announce, ['Player4 was killed in the night.']); // no extra hint
  dayToNight(g);
  assert.equal(g.s.phase, PHASE.NIGHT);
  assert.equal(g.s.night.noKill, true);
  const wp = viewFor(g.s, 'p0').prompt;
  assert.equal(wp.noKill, true); assert.equal(wp.required, false); assert.deepEqual(wp.targets, []);
  assert.match(wp.text, /can't kill/);
  assert.equal(viewFor(g.s, 'p5').prompt.noKill, undefined);
  // witch sees no phantom victim and is not told to wait
  assert.deepEqual(viewFor(g.s, 'p3').prompt.healTargets, []);
  // wolves confirm with no target (a sent target is ignored); the night does not stall
  assert.ok(!act(g, { kind: 'nightPick', by: 'p0', targetId: null }).error);
  assert.ok(!act(g, { kind: 'nightPick', by: 'p1', targetId: 'p5' }).error);
  submitNight(g, { p2: 'p0', p3: 'pass' });
  assert.ok(!resolveNight(g).error);
  assert.equal(g.s.phase, PHASE.DAY);
  assert.equal(g.s.players.filter((p) => !p.alive).length, 1, 'nobody died');
  assert.deepEqual(viewFor(g.s, 'p5').announce, ['Nobody died.']);
  // only one sick night
  dayToNight(g);
  assert.equal(g.s.night.noKill, false);
  assert.ok(viewFor(g.s, 'p0').prompt.targets.length > 0);
});

test('diseased: the host can end a sick night even if nobody confirmed', () => {
  const g = game(RD);
  quietNight(g, { victim: 'p4', extra: { p3: 'pass' } });
  dayToNight(g);
  assert.ok(!resolveNight(g).error);
  assert.equal(g.s.phase, PHASE.DAY);
});

test('diseased: vote-out, poison and hunter shot do not trigger the sickness', () => {
  let g = game(RD);
  quietNight(g, { victim: 'p5', extra: { p3: 'pass' } });
  startVote(g);
  everyoneVotes(g, Object.fromEntries(g.s.players.filter((p) => p.alive && p.id !== 'p4').map((p) => [p.id, 'p4'])));
  assert.equal(alive(g, 'p4'), false);
  host(g, 'nextPhase');
  assert.equal(g.s.night.noKill, false);
  // poison
  g = game(RD);
  act(g, { kind: 'nightPick', by: 'p0', targetId: 'p5' });
  act(g, { kind: 'nightPick', by: 'p1', targetId: 'p5' });
  act(g, { kind: 'nightPick', by: 'p3', targetId: 'poison:p4' });
  submitNight(g, { p2: 'p0' });
  resolveNight(g);
  assert.equal(alive(g, 'p4'), false);
  dayToNight(g);
  assert.equal(g.s.night.noKill, false);
  // hunter shot
  g = game(['werewolf', 'werewolf', 'seer', 'hunter', 'diseased', 'villager', 'villager', 'villager']);
  quietNight(g, { victim: 'p3', extra: { p3: 'p3' } });
  act(g, { kind: 'shoot', by: 'p3', targetId: 'p4' });
  assert.equal(alive(g, 'p4'), false);
  dayToNight(g);
  assert.equal(g.s.night.noKill, false);
});

test('diseased: healed by the witch or saved by the bodyguard means no sickness', () => {
  let g = game(RD);
  act(g, { kind: 'nightPick', by: 'p0', targetId: 'p4' });
  act(g, { kind: 'nightPick', by: 'p1', targetId: 'p4' });
  act(g, { kind: 'nightPick', by: 'p3', targetId: 'heal:p4' });
  submitNight(g, { p2: 'p0' });
  resolveNight(g);
  assert.equal(alive(g, 'p4'), true);
  dayToNight(g);
  assert.equal(g.s.night.noKill, false);
  g = game(['werewolf', 'werewolf', 'seer', 'bodyguard', 'diseased', 'villager', 'villager', 'villager']);
  quietNight(g, { victim: 'p4', extra: { p3: 'p4' } });
  assert.equal(alive(g, 'p4'), true);
  dayToNight(g);
  assert.equal(g.s.night.noKill, false);
});

test('diseased + cub death for the same next night: the skip wins, no kill at all', () => {
  const g = game(['werewolf', 'wolfcub', 'witch', 'seer', 'diseased', 'villager', 'villager', 'villager', 'villager']);
  act(g, { kind: 'nightPick', by: 'p0', targetId: 'p4' });
  act(g, { kind: 'nightPick', by: 'p1', targetId: 'p4' });
  act(g, { kind: 'nightPick', by: 'p2', targetId: 'poison:p1' });
  submitNight(g, { p3: 'p0' });
  resolveNight(g);
  assert.equal(alive(g, 'p4'), false); assert.equal(alive(g, 'p1'), false);
  dayToNight(g);
  assert.equal(g.s.night.noKill, true);
  assert.equal(g.s.night.doubleKill, false);
  assert.equal(viewFor(g.s, 'p0').prompt.noKill, true);
  act(g, { kind: 'nightPick', by: 'p0', targetId: null });
  const before = g.s.players.filter((p) => p.alive).length;
  submitNight(g, { p2: 'pass', p3: 'p0' });
  resolveNight(g);
  assert.equal(g.s.players.filter((p) => p.alive).length, before);
  // the revenge is consumed, not postponed
  dayToNight(g);
  assert.equal(g.s.night.noKill, false); assert.equal(g.s.night.doubleKill, false);
});

test('diseased: wolf-killed and poisoned together still triggers; play again resets it', () => {
  const g = game(RD);
  act(g, { kind: 'nightPick', by: 'p0', targetId: 'p4' });
  act(g, { kind: 'nightPick', by: 'p1', targetId: 'p4' });
  act(g, { kind: 'nightPick', by: 'p3', targetId: 'poison:p4' });
  submitNight(g, { p2: 'p0' });
  resolveNight(g);
  assert.equal(g.s.diseasedDied, true);
  g.s.phase = PHASE.GAMEOVER;
  host(g, 'playAgain');
  assert.equal(g.s.diseasedDied, false);
});

// ---------- seer's apprentice ----------
// p0,p1 wolves, p2 seer, p3 apprentice, p4 witch, p5 hunter, p6..p7 villagers
const RA = ['werewolf', 'werewolf', 'seer', 'apprentice', 'witch', 'hunter', 'villager', 'villager'];
const roleOf = (g, id) => g.s.players.find((p) => p.id === id).role;
const apprenticeNight = (g, { victim, poison, heal, extra = {} } = {}) => {
  const picks = { p0: victim, p1: victim, p2: 'p0', p4: poison ? `poison:${poison}` : heal ? `heal:${heal}` : 'pass', ...extra };
  for (const id of ['p0', 'p1', 'p4']) if (g.s.players.find((p) => p.id === id).alive && !(id in g.s.night.picks)) act(g, { kind: 'nightPick', by: id, targetId: picks[id] });
  submitNight(g, picks);
  return resolveNight(g);
};

test("seer's apprentice: validation rejects more Apprentices than Seers, with a clear message", () => {
  assert.ok(validate({ wolves: 1, seer: 1, apprentice: 1, villagers: 2 }, 5).ok);
  assert.ok(validate({ wolves: 1, seer: 2, apprentice: 2, villagers: 1 }, 6).ok);
  for (const c of [
    { wolves: 1, seer: 0, apprentice: 1, villagers: 3 },
    { wolves: 1, seer: 1, apprentice: 2, villagers: 1 },
    { wolves: 2, seer: 0, apprentice: 2, villagers: 2, witch: 1 },
  ]) {
    const v = validate(c, c.wolves + c.seer + c.apprentice + c.villagers + (c.witch ?? 0));
    assert.equal(v.ok, false);
    assert.match(v.errors.join(' '), /Seer's Apprentice needs a Seer/);
  }
  // the secret random mix goes through validate and never yields apprentice > seer
  let withApprentice = 0;
  for (let n = 5; n <= 15; n++) for (let seed = 1; seed <= 300; seed++) {
    const c = randomCounts(n, createRng(seed * 31 + n));
    assert.ok(validate(c, n).ok, 'random mix is valid');
    assert.ok(c.apprentice <= c.seer, `random mix gave ${c.apprentice} apprentice for ${c.seer} seer`);
    if (c.apprentice) withApprentice++;
  }
  assert.ok(withApprentice > 0, 'apprentices do appear in the random mix');
});

test("seer's apprentice: the lobby surfaces the error and the host cannot start an invalid pool", () => {
  let s = lobby(5); const rng = createRng(3);
  s = reduce(s, { kind: 'settings', by: 'p0', patch: { counts: { wolves: 1, seer: 0, apprentice: 1, bodyguard: 1, villagers: 2 } } }, rng).state;
  const v = viewFor(s, 'p0');
  assert.equal(v.setup.ok, false);
  assert.match(v.setup.errors.join(' '), /Seer's Apprentice needs a Seer/);
  const r = reduce(s, { kind: 'startGame', by: 'p0' }, rng);
  assert.equal(r.error.code, 'badSetup');
  assert.equal(r.state.phase, PHASE.LOBBY);
});

test("seer's apprentice: decoy prompt, village to the Seer, no tell to anyone", () => {
  const g = game(RA);
  const pr = viewFor(g.s, 'p3').prompt;
  assert.equal(pr.text, 'Who do you suspect?'); assert.equal(pr.required, false);
  assert.equal(viewFor(g.s, 'p3').you.team, 'village');
  assert.equal(viewFor(g.s, 'p3').you.private.seerLog, undefined);
  for (const id of ['p0', 'p2', 'p5']) assert.equal(viewFor(g.s, id).players.find((p) => p.id === 'p3').role, null);
  act(g, { kind: 'nightPick', by: 'p2', targetId: 'p3' });
  assert.deepEqual(viewFor(g.s, 'p2').you.private.seerResult, { targetId: 'p3', isWolf: false });
});

test("seer's apprentice: promoted when the Seer is killed at night", () => {
  const g = game(RA);
  apprenticeNight(g, { victim: 'p2', extra: { p2: 'p6' } });
  assert.equal(alive(g, 'p2'), false);
  assert.equal(roleOf(g, 'p3'), 'seer');
  const v = viewFor(g.s, 'p3');
  assert.equal(v.you.role, 'seer'); assert.equal(v.you.private.promoted, true); assert.deepEqual(v.you.private.seerLog, []);
  assert.equal(viewFor(g.s, 'p6').players.find((p) => p.id === 'p3').role, null, 'no public tell');
  assert.deepEqual(viewFor(g.s, 'p6').announce, ['Player2 was killed in the night.']);
  startVote(g); everyoneVotes(g, {}); host(g, 'nextPhase');
  const pr = viewFor(g.s, 'p3').prompt;
  assert.equal(pr.required, true); assert.ok(pr.targets.length > 0); assert.equal(pr.text, 'Who do you want to check?');
  act(g, { kind: 'nightPick', by: 'p3', targetId: 'p0' });
  assert.deepEqual(viewFor(g.s, 'p3').you.private.seerResult, { targetId: 'p0', isWolf: true });
  assert.equal(viewFor(g.s, 'p3').you.private.seerLog.length, 1);
});

test("seer's apprentice: the promoted Seer gets a fresh log, not the dead Seer's", () => {
  const g = game(RA);
  apprenticeNight(g, { victim: 'p6' });
  assert.equal(viewFor(g.s, 'p2').you.private.seerLog.length, 1);
  startVote(g); everyoneVotes(g, {}); host(g, 'nextPhase');
  apprenticeNight(g, { victim: 'p2', extra: { p2: 'p1' } });
  assert.equal(roleOf(g, 'p3'), 'seer');
  assert.deepEqual(viewFor(g.s, 'p3').you.private.seerLog, []);
});

test("seer's apprentice: promoted when the Seer is voted out", () => {
  const g = game(RA);
  apprenticeNight(g, { victim: 'p6' });
  startVote(g);
  everyoneVotes(g, Object.fromEntries(g.s.players.filter((p) => p.alive && p.id !== 'p2').map((p) => [p.id, 'p2'])));
  assert.equal(alive(g, 'p2'), false);
  assert.equal(roleOf(g, 'p3'), 'seer');
  assert.equal(viewFor(g.s, 'p3').you.private.promoted, true);
  host(g, 'nextPhase');
  assert.equal(viewFor(g.s, 'p3').prompt.required, true);
});

test("seer's apprentice: promoted when the Seer is poisoned", () => {
  const g = game(RA);
  apprenticeNight(g, { victim: 'p6', poison: 'p2' });
  assert.equal(alive(g, 'p2'), false);
  assert.equal(roleOf(g, 'p3'), 'seer');
});

test("seer's apprentice: promoted when the Seer is shot by a Hunter", () => {
  const g = game(RA);
  apprenticeNight(g, { victim: 'p5' }); // the wolves kill the hunter
  assert.equal(g.s.phase, PHASE.SHOT);
  assert.equal(roleOf(g, 'p3'), 'apprentice', 'not before the shot');
  act(g, { kind: 'shoot', by: 'p5', targetId: 'p2' });
  assert.equal(alive(g, 'p2'), false);
  assert.equal(roleOf(g, 'p3'), 'seer');
  assert.equal(g.s.phase, PHASE.DAY);
});

test("seer's apprentice: Seer and Apprentice dying the same night means no promotion", () => {
  let g = game(RA);
  apprenticeNight(g, { victim: 'p2', poison: 'p3' });
  assert.equal(alive(g, 'p2'), false); assert.equal(alive(g, 'p3'), false);
  assert.equal(g.s.players.filter((p) => p.role === 'seer').length, 1, 'only the dead original Seer');
  assert.equal(g.s.promotions, 0);
  g = game(RA);
  apprenticeNight(g, { victim: 'p3', poison: 'p2' });
  assert.equal(roleOf(g, 'p3'), 'apprentice');
});

test("seer's apprentice: if the Apprentice dies first nothing happens, and a later Seer death promotes nobody", () => {
  const g = game(RA);
  apprenticeNight(g, { victim: 'p3' });
  assert.equal(alive(g, 'p3'), false);
  assert.equal(roleOf(g, 'p2'), 'seer');
  startVote(g); everyoneVotes(g, {}); host(g, 'nextPhase');
  apprenticeNight(g, { victim: 'p2', extra: { p2: 'p6' } });
  assert.equal(g.s.players.filter((p) => p.alive && p.role === 'seer').length, 0);
  assert.equal(g.s.promotions, 0);
});

test("seer's apprentice: promotion is 1:1 with two Seers and two Apprentices", () => {
  // p2,p3 seers; p4,p5 apprentices; p6 witch
  const R = ['werewolf', 'werewolf', 'seer', 'seer', 'apprentice', 'apprentice', 'witch', 'villager', 'villager', 'villager'];
  const g = game(R);
  const picks = { p0: 'p2', p1: 'p2', p2: 'p0', p3: 'p0', p6: 'pass' };
  act(g, { kind: 'nightPick', by: 'p0', targetId: 'p2' }); act(g, { kind: 'nightPick', by: 'p1', targetId: 'p2' });
  submitNight(g, picks); resolveNight(g);
  assert.equal(alive(g, 'p2'), false);
  assert.equal(g.s.players.filter((p) => p.role === 'seer' && p.alive).length, 2, 'p3 plus exactly one promoted apprentice');
  assert.equal(g.s.players.filter((p) => p.role === 'apprentice').length, 1, 'one apprentice left');
  assert.equal(roleOf(g, 'p4'), 'seer');
  assert.equal(roleOf(g, 'p5'), 'apprentice');
  // second Seer dies: the other Apprentice is promoted
  startVote(g); everyoneVotes(g, {}); host(g, 'nextPhase');
  act(g, { kind: 'nightPick', by: 'p0', targetId: 'p3' }); act(g, { kind: 'nightPick', by: 'p1', targetId: 'p3' });
  submitNight(g, { p0: 'p3', p1: 'p3', p3: 'p0', p4: 'p0', p6: 'pass' }); resolveNight(g);
  assert.equal(roleOf(g, 'p5'), 'seer');
  // one Seer, one Apprentice: killing the Seer promotes; killing a Seer with no Apprentice left is harmless
  const g2 = game(RA);
  apprenticeNight(g2, { victim: 'p2' });
  assert.equal(g2.s.players.filter((p) => p.alive && p.role === 'seer').length, 1);
});

test("seer's apprentice: play again resets promotion state", () => {
  const g = game(RA);
  apprenticeNight(g, { victim: 'p2' });
  assert.equal(g.s.players.find((p) => p.id === 'p3').promoted, true);
  g.s.phase = PHASE.GAMEOVER;
  host(g, 'playAgain');
  assert.equal(g.s.players.find((p) => p.id === 'p3').promoted, false);
  assert.equal(g.s.promotions, 0);
});

// ---------- Graveyard Voter (internal id: poltergeist) ----------
// p0,p1 wolves, p2 seer, p3 poltergeist, p4 witch, p5..p8 villagers
const RP = ['werewolf', 'werewolf', 'seer', 'poltergeist', 'witch', 'villager', 'villager', 'villager', 'villager'];
const ghostNight = (g, victim, extra = {}) => quietNight(g, { victim, extra: { p4: 'pass', p2: 'p0', ...extra } });
const livingVotes = (g, votes) => { for (const p of g.s.players.filter((x) => x.alive)) { if (g.s.vote.stage !== 'voting') break; if (!(p.id in g.s.vote.votes)) act(g, { kind: 'vote', by: p.id, targetId: votes[p.id] ?? 'skip' }); } };
const toNextVote = (g) => { host(g, 'nextPhase'); const vic = ['p8', 'p7', 'p6', 'p5'].find((id) => alive(g, id)); submitNight(g, { p0: vic, p1: vic, p2: 'p0', p4: 'pass' }); resolveNight(g); startVote(g); };

test('Graveyard Voter: decoy prompt, village team, nobody can tell', () => {
  const g = game(RP);
  const v = viewFor(g.s, 'p3');
  assert.equal(v.prompt.text, 'Who do you suspect?'); assert.equal(v.prompt.required, false);
  assert.equal(v.you.team, 'village');
  assert.ok(validate({ wolves: 1, poltergeist: 2, seer: 1, villagers: 1 }, 5).ok);
});

test('Graveyard Voter: killed at night, gets one haunt at that day\'s vote, only they see the prompt', () => {
  const g = game(RP);
  ghostNight(g, 'p3');
  assert.equal(alive(g, 'p3'), false);
  assert.equal(viewFor(g.s, 'p3').prompt, null, 'no prompt before a vote');
  startVote(g);
  const gv = viewFor(g.s, 'p3').prompt;
  assert.equal(gv.haunt, true); assert.equal(gv.kind, 'vote'); assert.equal(gv.skippable, true);
  assert.ok(gv.targets.every((id) => g.s.players.find((p) => p.id === id).alive));
  assert.ok(!gv.targets.includes('p3'));
  for (const p of g.s.players.filter((x) => x.id !== 'p3' && !x.alive || x.id === 'p3' ? x.id !== 'p3' : false)) assert.equal(viewFor(g.s, p.id).prompt, null);
  for (const p of g.s.players.filter((x) => x.alive)) assert.equal(viewFor(g.s, p.id).prompt.haunt, undefined);
  for (const p of g.s.players) {
    const json = JSON.stringify(viewFor(g.s, p.id));
    if (p.id !== 'p3') assert.ok(!/ghosts|haunt/.test(json), `${p.id} learns nothing about haunting`);
    if (p.id !== 'p3') assert.equal(viewFor(g.s, p.id).players.find((q) => q.id === 'p3').role, null);
  }
});

test('Graveyard Voter: a haunt vote is validated (living targets only, once, no pass for the living)', () => {
  const g = game(RP);
  ghostNight(g, 'p3');
  startVote(g);
  assert.equal(act(g, { kind: 'vote', by: 'p3', targetId: 'p3' }).error.code, 'badTarget');
  assert.equal(act(g, { kind: 'vote', by: 'p3', targetId: 'p0x' }).error.code, 'badTarget');
  assert.equal(act(g, { kind: 'vote', by: 'p5', targetId: 'pass' }).error.code, 'badTarget');
  assert.equal(act(g, { kind: 'vote', by: 'p2', targetId: 'pass' }).error.code, 'badTarget');
  assert.ok(!act(g, { kind: 'vote', by: 'p3', targetId: 'p5' }).error);
  assert.equal(act(g, { kind: 'vote', by: 'p3', targetId: 'p6' }).error.code, 'alreadyActed');
  // an ordinary dead player (not a ghost) still cannot vote
});

test('Graveyard Voter: ordinary dead players never get a haunt and cannot vote', () => {
  const g = game(RP);
  act(g, { kind: 'nightPick', by: 'p0', targetId: 'p3' }); act(g, { kind: 'nightPick', by: 'p1', targetId: 'p3' });
  act(g, { kind: 'nightPick', by: 'p4', targetId: 'poison:p5' });
  submitNight(g, { p2: 'p0' }); resolveNight(g);
  assert.equal(alive(g, 'p5'), false); assert.equal(alive(g, 'p3'), false);
  startVote(g);
  assert.equal(viewFor(g.s, 'p5').prompt, null);
  assert.equal(act(g, { kind: 'vote', by: 'p5', targetId: 'p0' }).error.code, 'dead');
  assert.equal(viewFor(g.s, 'p3').prompt.haunt, true);
});

test('Graveyard Voter: killed by poison or a hunter shot also earns the haunt', () => {
  const g = game(RP);
  act(g, { kind: 'nightPick', by: 'p0', targetId: 'p5' }); act(g, { kind: 'nightPick', by: 'p1', targetId: 'p5' });
  act(g, { kind: 'nightPick', by: 'p4', targetId: 'poison:p3' });
  submitNight(g, { p2: 'p0' }); resolveNight(g);
  startVote(g);
  assert.equal(viewFor(g.s, 'p3').prompt.haunt, true);
  const h = game(['werewolf', 'werewolf', 'seer', 'poltergeist', 'hunter', 'villager', 'villager', 'villager', 'villager']);
  quietNight(h, { victim: 'p4', extra: { p4: 'p4', p5: null } });
  act(h, { kind: 'shoot', by: 'p4', targetId: 'p3' });
  assert.equal(alive(h, 'p3'), false);
  startVote(h);
  assert.equal(viewFor(h.s, 'p3').prompt.haunt, true);
});

test('Graveyard Voter: voted out at a vote, the haunt belongs to the NEXT vote only', () => {
  const g = game(RP);
  ghostNight(g, 'p5');
  startVote(g);
  livingVotes(g, Object.fromEntries(g.s.players.filter((p) => p.alive && p.id !== 'p3').map((p) => [p.id, 'p3'])));
  assert.equal(alive(g, 'p3'), false);
  assert.equal(g.s.vote.stage, 'result');
  assert.equal(viewFor(g.s, 'p3').prompt, null, 'not in the vote they just died in');
  assert.deepEqual(g.s.vote.ghosts, []);
  toNextVote(g);
  assert.equal(viewFor(g.s, 'p3').prompt.haunt, true, 'at the next vote');
  assert.ok(!act(g, { kind: 'vote', by: 'p3', targetId: 'skip' }).error);
  livingVotes(g, {});
  assert.equal(g.s.vote.stage, 'result');
  toNextVote(g);
  assert.equal(viewFor(g.s, 'p3').prompt, null, 'one haunt only');
});

test('Graveyard Voter: the vote is held for the ghost; the host sees them in the progress count', () => {
  const g = game(RP);
  ghostNight(g, 'p3');
  startVote(g);
  livingVotes(g, {});
  assert.equal(g.s.vote.stage, 'voting', 'waits for the ghost');
  const prog = viewFor(g.s, 'p0').progress;
  assert.equal(prog.total, prog.done + 1, 'ghost counted as still to act');
  assert.ok(host(g, 'nextPhase').error, 'host cannot end the vote under the ghost');
  assert.equal(g.s.vote.stage, 'voting');
  assert.ok(!act(g, { kind: 'vote', by: 'p3', targetId: 'pass' }).error);
  assert.equal(g.s.vote.stage, 'result');
});

test('Graveyard Voter: a disconnected ghost does not stall the vote; an unused haunt expires', () => {
  const g = game(RP);
  ghostNight(g, 'p3');
  startVote(g);
  livingVotes(g, {});
  assert.ok(host(g, 'nextPhase').error);
  act(g, { kind: 'setConnected', by: 'p3', connected: false });
  host(g, 'nextPhase'); // the ghost is gone: the host may end the vote
  assert.equal(g.s.vote.stage, 'result');
  assert.equal(p3in(g), false);
  toNextVote(g);
  assert.equal(viewFor(g.s, 'p3').prompt, null);
  assert.deepEqual(g.s.vote.ghosts, []);
});
const p3in = (g) => 'p3' in g.s.vote.result.votes;

test('Graveyard Voter: passing keeps them hidden and lets the vote resolve', () => {
  const g = game(RP);
  ghostNight(g, 'p3');
  startVote(g);
  livingVotes(g, Object.fromEntries(['p0', 'p1', 'p2', 'p4', 'p6'].map((id) => [id, 'p5'])));
  assert.equal(g.s.vote.stage, 'voting');
  assert.ok(!act(g, { kind: 'vote', by: 'p3', targetId: 'pass' }).error);
  assert.equal(g.s.vote.stage, 'result');
  assert.equal(p3in(g), false, 'a pass is not listed');
  assert.equal(g.s.vote.result.counts.p5, 5);
  assert.equal(alive(g, 'p5'), false);
});

test('Graveyard Voter: the haunt vote breaks a tie', () => {
  const g = game(RP);
  ghostNight(g, 'p3');
  startVote(g);
  livingVotes(g, { p0: 'p6', p1: 'p6', p2: 'p6', p4: 'p5', p7: 'p5', p8: 'p5', p5: 'skip', p6: 'skip' });
  assert.equal(g.s.vote.stage, 'voting');
  act(g, { kind: 'vote', by: 'p3', targetId: 'p5' });
  assert.equal(g.s.vote.result.eliminatedId, 'p5');
  assert.equal(g.s.vote.result.votes.p3, 'p5', 'public like other votes');
  assert.deepEqual(viewFor(g.s, 'p7').voteResult.votes.p3, 'p5');
});

test('Graveyard Voter: the haunt vote can also create a tie', () => {
  const g = game(RP);
  ghostNight(g, 'p3');
  startVote(g);
  livingVotes(g, { p0: 'p6', p1: 'p6', p2: 'p6', p4: 'p6', p5: 'p4', p7: 'p4', p8: 'p4', p6: 'skip' });
  act(g, { kind: 'vote', by: 'p3', targetId: 'p4' });
  assert.equal(g.s.vote.result.eliminatedId, null);
  assert.equal(alive(g, 'p6'), true);
});

test('Graveyard Voter: a Skip haunt counts as a skip vote', () => {
  const g = game(RP);
  ghostNight(g, 'p3');
  startVote(g);
  livingVotes(g, { p0: 'p6', p1: 'p6', p2: 'p6', p4: 'p5', p7: 'p5', p8: 'skip', p5: 'skip', p6: 'skip' });
  // p6 3, p5 2, skip 3 -> already a tie with skip; ghost on p6 makes it 4
  act(g, { kind: 'vote', by: 'p3', targetId: 'p6' });
  assert.equal(g.s.vote.result.eliminatedId, 'p6');
});

test('Graveyard Voter: the haunt vote can elect a Jester', () => {
  const g = game(['werewolf', 'werewolf', 'seer', 'poltergeist', 'witch', 'jester', 'villager', 'villager', 'villager']);
  ghostNight(g, 'p3');
  startVote(g);
  livingVotes(g, { p0: 'p5', p1: 'p5', p2: 'p5', p4: 'p7', p6: 'p7', p7: 'skip', p8: 'p7', p5: 'skip' });
  assert.equal(g.s.vote.stage, 'voting');
  act(g, { kind: 'vote', by: 'p3', targetId: 'p5' });
  assert.equal(g.s.winner, 'jester');
  host(g, 'nextPhase');
  assert.equal(g.s.phase, PHASE.GAMEOVER);
});

test('Graveyard Voter: the haunt vote still cannot beat a Prince\'s first-vote immunity', () => {
  const g = game(['werewolf', 'werewolf', 'seer', 'poltergeist', 'witch', 'prince', 'villager', 'villager', 'villager']);
  ghostNight(g, 'p3');
  startVote(g);
  livingVotes(g, { p0: 'p5', p1: 'p5', p2: 'p5', p4: 'p7', p6: 'p7', p7: 'skip', p8: 'p7', p5: 'skip' });
  act(g, { kind: 'vote', by: 'p3', targetId: 'p5' });
  assert.equal(alive(g, 'p5'), true);
  assert.equal(g.s.vote.result.princeId, 'p5');
});

test('Graveyard Voter: auto-resolves only once the living and the ghost are done; the host is held until the ghost decides', () => {
  const g = game(RP);
  ghostNight(g, 'p3');
  startVote(g);
  livingVotes(g, {});
  assert.equal(g.s.vote.stage, 'voting');
  const hv = viewFor(g.s, 'p0');
  assert.deepEqual(hv.progress, { done: 8, total: 9 }, 'host count includes the ghost (accepted leak)');
  assert.ok(host(g, 'nextPhase').error);
  act(g, { kind: 'vote', by: 'p3', targetId: 'pass' });
  assert.equal(g.s.vote.stage, 'result');
  // with no ghost nothing changes: resolves the moment the last living player votes
  const g2 = game(RP);
  ghostNight(g2, 'p5');
  startVote(g2);
  assert.deepEqual(g2.s.vote.ghosts, []);
  livingVotes(g2, {});
  assert.equal(g2.s.vote.stage, 'result');
});

test('Graveyard Voter: the host progress count includes the ghost (the vote is held for them)', () => {
  const g = game(RP);
  ghostNight(g, 'p3');
  startVote(g);
  assert.deepEqual(viewFor(g.s, 'p0').progress, { done: 0, total: 9 });
  act(g, { kind: 'vote', by: 'p3', targetId: 'p5' });
  assert.deepEqual(viewFor(g.s, 'p0').progress, { done: 1, total: 9 });
});

test('Graveyard Voter: never affects wolf parity or win checks', () => {
  // 7 players: 2 wolves + poltergeist + 4 villagers. The ghost hauntings never change who is alive.
  const g = game(['werewolf', 'werewolf', 'poltergeist', 'villager', 'villager', 'villager', 'villager']);
  quietNight(g, { victim: 'p2', extra: { p2: null } });
  startVote(g);
  livingVotes(g, { p0: 'p3', p1: 'p3', p4: 'p3', p5: 'p3' });
  act(g, { kind: 'vote', by: 'p2', targetId: 'p6' });
  assert.equal(alive(g, 'p3'), false);
  assert.equal(g.s.phase, PHASE.VOTE); assert.equal(g.s.winner, null);
  host(g, 'nextPhase');
  // 2 wolves, villagers p4 p5 p6 alive; the wolves kill p4: 2 vs 2 -> wolves win (the dead ghost is not counted)
  act(g, { kind: 'nightPick', by: 'p0', targetId: 'p4' }); act(g, { kind: 'nightPick', by: 'p1', targetId: 'p4' });
  submitNight(g, {}); resolveNight(g);
  assert.equal(g.s.phase, PHASE.GAMEOVER); assert.equal(g.s.winner, 'wolves');
  // and no haunt once the game is over
  assert.equal(viewFor(g.s, 'p2').prompt, null);
  assert.ok(act(g, { kind: 'vote', by: 'p2', targetId: 'p5' }).error);
});

test('Graveyard Voter: a haunt vote that eliminates the last wolf wins for the village', () => {
  const g = game(['werewolf', 'seer', 'poltergeist', 'villager', 'villager', 'villager']);
  quietNight(g, { victim: 'p2', extra: { p1: 'p0', p0: 'p2', p1: 'p0' } });
  startVote(g);
  livingVotes(g, { p0: 'p3', p1: 'p3', p3: 'p0', p4: 'skip', p5: 'p0' });
  assert.equal(g.s.vote.stage, 'voting');
  act(g, { kind: 'vote', by: 'p2', targetId: 'p0' });
  assert.equal(alive(g, 'p0'), false);
  host(g, 'nextPhase');
  assert.equal(g.s.phase, PHASE.GAMEOVER); assert.equal(g.s.winner, 'village');
});

test('Graveyard Voter: play again resets the haunt', () => {
  const g = game(RP);
  ghostNight(g, 'p3');
  assert.equal(g.s.players.find((p) => p.id === 'p3').haunt, true);
  g.s.phase = PHASE.GAMEOVER;
  host(g, 'playAgain');
  assert.equal(g.s.players.find((p) => p.id === 'p3').haunt, false);
});

test('MAX chaos (noVillagers): valid, zero plain villagers, specials spread, default off', async () => {
  const { randomCounts } = await import('../js/game/setup.js');
  const { DEFAULT_SETTINGS } = await import('../js/game/engine.js');
  assert.equal(DEFAULT_SETTINGS.noVillagers, false);
  const rng = createRng(11);
  for (let n = 5; n <= 15; n++) {
    for (let i = 0; i < 300; i++) {
      const c = randomCounts(n, rng, { noVillagers: true });
      assert.ok(validate(c, n).ok, `n=${n} ${JSON.stringify(c)}`);
      assert.equal(c.villagers, 0, `n=${n} ${JSON.stringify(c)}`);
      assert.ok(c.jester <= 1);
    }
  }
  const g = { s: lobby(8), rng: createRng(5) };
  act(g, { kind: 'settings', by: 'p0', patch: { randomize: true, noVillagers: true } });
  host(g, 'startGame');
  assert.equal(g.s.phase, PHASE.REVEAL);
  assert.equal(g.s.players.filter((p) => p.role === 'villager').length, 0);
});
