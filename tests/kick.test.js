import test from 'node:test';
import assert from 'node:assert/strict';
import { reduce, PHASE } from '../js/game/engine.js';
import { viewFor } from '../js/game/views.js';
import { Host } from '../js/net/host.js';
import { Client, peerConnector } from '../js/net/client.js';
import { addBots } from '../js/dev/bots.js';
import { createFakeNetwork } from '../js/dev/fakepeer.js';
import { setLang, tr } from '../js/i18n.js';
import { lobby, game, act, submitNight, resolveNight, T0 } from './helpers.js';

const kick = (g, targetId, by = 'p0') => act(g, { kind: 'kick', by, targetId });
const W = 'werewolf';

test('lobby: the host removes a player, who can come back; others cannot kick; host and bots are protected', () => {
  const g = { s: lobby(6), rng: undefined };
  g.rng = (() => { let i = 0; return () => ((i = (i * 9301 + 49297) % 233280) || 0.5) / 233280; })();
  assert.equal(kick(g, 'p2', 'p1').error?.code, 'forbidden');
  assert.equal(kick(g, 'p0').error?.code, 'forbidden', 'the host cannot remove themselves');
  assert.equal(kick(g, 'nobody').error?.code, 'unknownPlayer');
  const r = kick(g, 'p2');
  assert.ok(!r.error);
  assert.ok(r.effects.some((e) => e.type === 'drop' && e.id === 'p2'), 'the host hangs up on them');
  assert.equal(g.s.players.length, 5);
  assert.ok(!g.s.players.some((p) => p.id === 'p2'));
  assert.equal(viewFor(g.s, 'p2'), null, 'no view until they rejoin');
  assert.ok(!act(g, { kind: 'join', by: 'p2', name: 'Player2' }).error, 'a stuck phone can come back');
  assert.equal(g.s.players.length, 6);
  g.s.players.push({ id: 'bot-1', name: 'Bot', connected: true, role: null, alive: true, ready: false, revealed: false, potions: null });
  assert.equal(kick(g, 'bot-1').error?.code, 'forbidden');
});

test('night: removing the last wolf still thinking lets the night finish, and the removal is announced at dawn without a role', () => {
  const g = game([W, W, 'villager', 'villager', 'villager', 'villager', 'villager', 'villager'], { settings: { revealOnDeath: false } });
  // p0 is the host and a wolf; p1 is the other wolf. p0 picks, p1 never does.
  act(g, { kind: 'nightPick', by: 'p0', targetId: 'p5' });
  assert.equal(g.s.night.victims, null, 'waiting for p1');
  assert.ok(!kick(g, 'p1').error);
  assert.deepEqual(g.s.night.victims, ['p5'], 'the remaining wolf decides alone');
  assert.equal(g.s.players[1].alive, false);
  assert.ok(!('p1' in g.s.night.picks));
  submitNight(g, {});
  resolveNight(g);
  assert.equal(g.s.phase, PHASE.DAY);
  const lines = g.s.lines.join(' | ');
  assert.match(lines, /Player1 was removed by the host\./);
  assert.ok(!/werewolf|were a/i.test(lines.replace('Player', '')), 'role stays hidden');
  assert.match(lines, /Player5 was killed in the night\./);
  const v = viewFor(g.s, 'p3');
  assert.equal(v.players.find((p) => p.id === 'p1').role, null);
  assert.equal(v.players.find((p) => p.id === 'p1').kicked, true);
});

test('with Reveal on death the removed player role is shown like any other death', () => {
  const g = game([W, 'seer', 'villager', 'villager', 'villager', 'villager'], { settings: { revealOnDeath: true } });
  kick(g, 'p1');
  assert.equal(viewFor(g.s, 'p3').players.find((p) => p.id === 'p1').role, 'seer');
});

test('removing the last wolf ends the game for the village; removing enough villagers ends it for the wolves', () => {
  let g = game([W, 'villager', 'villager', 'villager', 'villager', 'villager']);
  // The host p0 is the only wolf and cannot be removed: remove villagers instead.
  kick(g, 'p1'); kick(g, 'p2'); kick(g, 'p3');
  assert.equal(g.s.phase, PHASE.NIGHT, 'one wolf against two villagers: still on');
  kick(g, 'p4');
  assert.equal(g.s.phase, PHASE.GAMEOVER);
  assert.equal(g.s.winner, 'wolves');
  g = game(['villager', W, 'villager', 'villager', 'villager', 'villager']);
  kick(g, 'p1');
  assert.equal(g.s.phase, PHASE.GAMEOVER);
  assert.equal(g.s.winner, 'village');
});

test('a removed player triggers nothing: no hunter shot, no cub revenge, no Apprentice promotion', () => {
  const g = game(['villager', 'hunter', 'wolfcub', 'seer', 'apprentice', W, 'villager', 'villager', 'villager']);
  kick(g, 'p1'); kick(g, 'p2'); kick(g, 'p3');
  assert.deepEqual(g.s.shots, []);
  assert.equal(g.s.cubDied, false);
  assert.equal(g.s.promotions, 0);
  assert.equal(g.s.players[4].role, 'apprentice');
  assert.equal(g.s.phase, PHASE.NIGHT);
});

test('shot phase: removing the hunter who owes a shot moves the game on', () => {
  const g = game(['villager', 'hunter', W, 'villager', 'villager', 'villager', 'villager', 'villager']);
  submitNight(g, { p2: 'p1' });
  resolveNight(g);
  assert.equal(g.s.phase, PHASE.SHOT);
  assert.equal(g.s.shots[0], 'p1');
  assert.ok(!kick(g, 'p1').error);
  assert.equal(g.s.phase, PHASE.DAY);
  assert.deepEqual(g.s.shots, []);
});

test('voting: removing the one player who has not voted resolves the vote; votes for a removed player count as Skip', () => {
  const g = game([W, 'villager', 'villager', 'villager', 'villager', 'villager', 'villager']);
  submitNight(g, { p0: 'p6' });
  resolveNight(g);
  act(g, { kind: 'startVote', by: 'p0' });
  for (const id of ['p0', 'p1', 'p2', 'p3', 'p4']) act(g, { kind: 'vote', by: id, targetId: 'p5' });
  assert.equal(g.s.vote.stage, 'voting', 'p5 has not voted yet');
  const before = g.s.players.filter((p) => p.alive).length;
  assert.ok(!kick(g, 'p5').error);
  assert.equal(g.s.vote.stage, 'result', 'everyone left has voted');
  assert.equal(g.s.vote.result.eliminatedId, null, 'five votes for p5, who is gone: counted as Skip');
  assert.equal(g.s.players.filter((p) => p.alive).length, before - 1, 'nobody else died');
  assert.match(g.s.lines.join(' '), /Player5 was removed by the host\./);
});

test('in a game a removed player is out, and reconnects as a spectator; Play again makes them a normal player', () => {
  const g = game([W, 'villager', 'villager', 'villager', 'villager', 'villager', 'villager']);
  kick(g, 'p2');
  assert.ok(!act(g, { kind: 'join', by: 'p2', name: 'Player2' }).error, 'reconnects');
  assert.equal(g.s.players[2].alive, false, 'but is still out of the game');
  assert.equal(viewFor(g.s, 'p2').you.alive, false);
  act(g, { kind: 'endEarly', by: 'p0' });
  assert.ok(!kick(g, 'p4').error);
  assert.equal(g.s.players[4].alive, true, 'after the game nothing changes, the phone only reconnects');
  act(g, { kind: 'playAgain', by: 'p0' });
  assert.equal(g.s.phase, PHASE.LOBBY);
  assert.equal(g.s.players.length, 7);
  assert.ok(g.s.players.every((p) => p.alive && !p.kicked), 'everyone is a normal player again');
});

test('the removal line is fully translated', () => {
  setLang('th');
  try {
    for (const text of ['Player1 was removed by the host.', 'Player1 was removed by the host. They were a Seer.', 'Only the host can remove players.', 'You cannot remove the host or a bot.']) {
      assert.ok(!/[A-Za-z]{4,}/.test(tr(text).replace(/Player1/g, '')), `untranslated: ${text} -> ${tr(text)}`);
    }
  } finally { setLang('en'); }
});

// ---------- network ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return; await sleep(5); } throw new Error('timeout waiting for condition'); };

test('a removed phone is hung up on and comes straight back with a fresh connection', async () => {
  const net = createFakeNetwork();
  const host = new Host({ Peer: net.Peer, hostPlayerId: 'hostplayer', peerOptions: {} });
  await host.start();
  const hv = { view: null };
  const hc = new Client({ playerId: 'hostplayer', name: 'Hosty', visibilityReconnect: false, connector: async () => host.attachLoopback(), onView: (v) => { hv.view = v; } });
  hc.start();
  await until(() => hv.view);
  const c = { view: null, errors: [] };
  c.client = new Client({ playerId: 'player-stuck', name: 'Stuck', visibilityReconnect: false, delays: [20, 20, 40], pingMs: 50, deadMs: 300,
    connector: peerConnector(net.Peer, host.roomCode, {}), onView: (v) => { c.view = v; }, onError: (e) => c.errors.push(e) });
  c.client.start();
  await until(() => hv.view.players.length === 2 && c.view);
  const first = c.client.conn;
  hc.send('kick', { targetId: 'player-stuck' });
  await until(() => c.client.conn && c.client.conn !== first && hv.view.players.length === 2);
  assert.deepEqual(c.errors, [], 'no error: it just reconnects');
  assert.equal(c.client.stopped, false);
  host.close();
});
