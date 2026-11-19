import test from 'node:test';
import assert from 'node:assert/strict';
import { reduce, PHASE } from '../js/game/engine.js';
import { viewFor } from '../js/game/views.js';
import { CHAT, CHAT_PER_ROUND, PERSONALITIES } from '../js/game/chat.js';
import { BotMind, PERSONA } from '../js/bots/mind.js';
import { isBotId } from '../js/game/setup.js';
import { Host } from '../js/net/host.js';
import { Client } from '../js/net/client.js';
import { createFakeNetwork } from '../js/dev/fakepeer.js';
import { createRng } from '../js/util/rng.js';
import { setLang, t, tr } from '../js/i18n.js';
import { lobby, T0 } from './helpers.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Host p0 plus bots bot-1.., roles forced by seat, through the night with no picks, to day 1.
function botDay(roles, settings = {}) {
  const rng = createRng(5);
  let s = lobby(1, rng);
  const step = (a) => { const r = reduce(s, { now: T0, ...a }, rng); if (r.error) throw new Error(r.error.message); s = r.state; return r; };
  step({ kind: 'setBots', by: 'p0', count: roles.length - 1 });
  step({ kind: 'settings', by: 'p0', patch: { randomEvents: false, ...settings } });
  step({ kind: 'startGame', by: 'p0' });
  s.players.forEach((p, i) => { p.role = roles[i]; p.potions = p.role === 'witch' ? { heal: true, poison: true } : null; });
  step({ kind: 'nextPhase', by: 'p0' }); // The Day Before
  step({ kind: 'nextPhase', by: 'p0' }); // night 1
  step({ kind: 'nextPhase', by: 'p0' }); // dawn: nobody picked, nobody died
  assert.equal(s.phase, PHASE.DAY);
  return { get s() { return s; }, set s(v) { s = v; }, rng, say: (by, key, v, ids) => reduce(s, { kind: 'botSay', by, key, v, ids, now: T0 }, rng) };
}

test('setBots gives every bot a personality; no view shows it', () => {
  const rng = createRng(4);
  const s = reduce(lobby(2, rng), { kind: 'setBots', by: 'p0', count: 12, now: T0 }, rng).state;
  const bots = s.players.filter((p) => isBotId(p.id));
  assert.ok(bots.every((p) => PERSONALITIES.includes(p.persona)));
  assert.ok(new Set(bots.map((p) => p.persona)).size > 1, 'a mix of personalities');
  assert.ok(s.players.filter((p) => !isBotId(p.id)).every((p) => !p.persona), 'humans have none');
  assert.ok(viewFor(s, 'p0').players.every((p) => !p.persona), 'not even the host sees tags');
  const dumb = reduce(s, { kind: 'settings', by: 'p0', patch: { dumbBots: true }, now: T0 }, rng).state;
  assert.equal(dumb.settings.dumbBots, true);
  assert.ok(viewFor(dumb, 'p0').players.every((p) => !p.persona));
  assert.equal(viewFor(dumb, 'p0').settings.dumbBots, true, 'the host still sees the switch');
});

test('the bot type never reaches a player view, smart or dumb', () => {
  const rng = createRng(5);
  const s = reduce(lobby(3, rng), { kind: 'setBots', by: 'p0', count: 6, now: T0 }, rng).state;
  for (const dumbBots of [false, true]) {
    const st = reduce(s, { kind: 'settings', by: 'p0', patch: { dumbBots }, now: T0 }, rng).state;
    for (const id of ['p1', 'p2']) {
      const v = viewFor(st, id);
      assert.equal('dumbBots' in v.settings, false, 'no bot-type setting');
      assert.ok(v.players.every((p) => !p.persona), 'no personality tags');
    }
  }
});

test('botSay: only living bots, only in the day or an open vote, valid lines only, a per-round cap', () => {
  const g = botDay(['villager', 'werewolf', 'seer', 'villager', 'villager', 'villager']);
  assert.equal(g.say('p0', 'filler', 0, []).error?.code, 'forbidden', 'humans cannot use it');
  assert.equal(g.say('bot-1', 'nope', 0, []).error?.code, 'badLine');
  assert.equal(g.say('bot-1', 'accuse', 0, []).error?.code, 'badLine', 'accuse names one player');
  assert.equal(g.say('bot-1', 'accuse', 9, ['bot-2']).error?.code, 'badLine', 'unknown variant');
  assert.equal(g.say('bot-1', 'accuse', 0, ['ghost']).error?.code, 'badLine', 'unknown player');
  const r = g.say('bot-1', 'accuse', 1, ['bot-2']);
  assert.ok(!r.error);
  g.s = r.state;
  assert.deepEqual(g.s.chat.map(({ by, key, v, ids, round }) => ({ by, key, v, ids, round })), [{ by: 'bot-1', key: 'accuse', v: 1, ids: ['bot-2'], round: 1 }]);
  // Public: every phone gets the same line.
  for (const id of ['p0', 'bot-2', 'bot-5']) assert.deepEqual(viewFor(g.s, id).chat.map((c) => c.key), ['accuse']);
  for (let i = 1; i < CHAT_PER_ROUND; i++) g.s = g.say('bot-1', 'filler', 0, []).state;
  assert.equal(g.say('bot-1', 'filler', 0, []).error?.code, 'tooChatty');
  // Vote: open while voting, closed on the result screen.
  g.s = reduce(g.s, { kind: 'startVote', by: 'p0', now: T0 }, g.rng).state;
  assert.ok(!g.say('bot-2', 'voteSkip', 0, []).error);
  g.s = reduce(g.s, { kind: 'nextPhase', by: 'p0', now: T0 }, g.rng).state;
  assert.equal(g.s.vote.stage, 'result');
  assert.equal(g.say('bot-2', 'filler', 0, []).error?.code, 'badPhase');
  // Dumb bots: silent.
  const d = botDay(['villager', 'werewolf', 'seer', 'villager', 'villager', 'villager'], { dumbBots: true });
  assert.equal(d.say('bot-1', 'filler', 0, []).error?.code, 'forbidden');
});

test('botSay: dead bots stay silent, and talk is cleared for a new game', () => {
  const g = botDay(['villager', 'werewolf', 'seer', 'villager', 'villager', 'villager']);
  g.s = g.say('bot-3', 'filler', 1, []).state;
  g.s.players.find((p) => p.id === 'bot-3').alive = false;
  assert.equal(g.say('bot-3', 'filler', 0, []).error?.code, 'dead');
  const ended = reduce(g.s, { kind: 'endEarly', by: 'p0', now: T0 }, g.rng).state;
  const again = reduce(ended, { kind: 'playAgain', by: 'p0', now: T0 }, g.rng).state;
  assert.deepEqual(again.chat, []);
});

test('every table-talk line exists in English and Thai, and fills in its names', () => {
  try {
    for (const lang of ['en', 'th']) {
      setLang(lang);
      for (const [key, c] of Object.entries(CHAT)) {
        for (let v = 0; v < c.variants; v++) {
          const k = `chat.${key}.${v}`;
          const s = t(k, { a: 'Ann', b: 'Bob' });
          assert.ok(s !== k, `${lang} ${k} missing`);
          assert.ok(!/\{[ab]\}/.test(s), `${lang} ${k} has an unfilled name`);
          assert.equal((s.match(/Ann|Bob/g) ?? []).length >= c.ids, true, `${lang} ${k} names its players`);
        }
      }
      for (const p of PERSONALITIES) assert.notEqual(t(`persona.${p}`), `persona.${p}`);
      for (const k of ['chat.title', 'chat.empty', 'chat.newLines', 'chat.seeAll', 'chat.close', 'lobby.dumbBots', 'lobby.dumbBotsHint']) assert.notEqual(t(k), k);
    }
    setLang('th');
    for (const key of Object.keys(CHAT)) assert.notEqual(t(`chat.${key}.0`, { a: 'A', b: 'B' }), (setLang('en'), t(`chat.${key}.0`, { a: 'A', b: 'B' })), (setLang('th'), `${key} not translated`));
    for (const msg of ['Only bots can talk here.', 'Too many lines this round.']) assert.ok(!/[A-Za-z]{3,}/.test(tr(msg)), msg);
  } finally { setLang('en'); }
});

// Leak check: what a bot says must not depend on whether it has a night power. Roles with no Seer
// knowledge yet (Villager, Seer before any check, Bodyguard, Witch, Hunter, Prince...) given the same view
// and the same dice say exactly the same things. Only deliberate choices differ (a Seer claiming, a wolf
// avoiding its teammates, a Jester baiting).
test('table talk is the same for every non-wolf role with the same knowledge', () => {
  const roles = ['villager', 'seer', 'bodyguard', 'witch', 'hunter', 'prince', 'diseased', 'apprentice', 'poltergeist'];
  for (const persona of PERSONALITIES) {
    for (let seed = 1; seed <= 40; seed++) {
      const said = roles.map((role) => {
        const g = botDay(['villager', 'werewolf', 'villager', role, 'villager', 'villager', 'villager']);
        // Some table talk to react to.
        g.s = g.say('bot-1', 'accuse', 0, ['bot-3']).state;
        g.s = g.say('bot-2', 'accuse', 2, ['bot-4']).state;
        const m = new BotMind('bot-3', persona, createRng(seed));
        const out = [m.talk(viewFor(g.s, 'bot-3'), 'day'), m.talk(viewFor(g.s, 'bot-3'), 'reply'), m.talk(viewFor(g.s, 'bot-3'), 'day')];
        g.s = reduce(g.s, { kind: 'startVote', by: 'p0', now: T0 }, g.rng).state;
        const v = viewFor(g.s, 'bot-3');
        const a = m.act(v);
        out.push(a, m.voteLine(v, a.extra.targetId));
        return JSON.stringify(out);
      });
      assert.equal(new Set(said).size, 1, `${persona} seed ${seed}: ${roles.map((r, i) => `${r}=${said[i]}`).join(' | ')}`);
    }
  }
});

test('the night suspicion answer is the same for every role with no night power', () => {
  const roles = ['villager', 'hunter', 'prince', 'diseased', 'apprentice', 'poltergeist'];
  for (let seed = 1; seed <= 30; seed++) {
    const picks = roles.map((role) => {
      const g = botDay(['villager', 'werewolf', 'villager', role, 'villager', 'villager', 'villager']);
      g.s = g.say('bot-1', 'accuse', 0, ['bot-4']).state;
      g.s = reduce(g.s, { kind: 'startVote', by: 'p0', now: T0 }, g.rng).state;
      g.s = reduce(g.s, { kind: 'nextPhase', by: 'p0', now: T0 }, g.rng).state;
      g.s = reduce(g.s, { kind: 'nextPhase', by: 'p0', now: T0 }, g.rng).state; // night 2
      const m = new BotMind('bot-3', 'detective', createRng(seed));
      return JSON.stringify(m.act(viewFor(g.s, 'bot-3')));
    });
    assert.equal(new Set(picks).size, 1, picks.join(' | '));
  }
});

test('smart decisions: wolves follow the pack, the Seer checks new people, the village believes a lone Seer', () => {
  // Wolves: the second wolf copies the first one's pick.
  const g = botDay(['villager', 'werewolf', 'werewolf', 'villager', 'villager', 'seer', 'villager', 'villager']);
  g.s = reduce(g.s, { kind: 'startVote', by: 'p0', now: T0 }, g.rng).state;
  g.s = reduce(g.s, { kind: 'nextPhase', by: 'p0', now: T0 }, g.rng).state;
  g.s = reduce(g.s, { kind: 'nextPhase', by: 'p0', now: T0 }, g.rng).state; // night 2
  g.s = reduce(g.s, { kind: 'nightPick', by: 'bot-1', targetId: 'bot-4', now: T0 }, g.rng).state;
  for (let seed = 1; seed <= 20; seed++) {
    const a = new BotMind('bot-2', 'hothead', createRng(seed)).act(viewFor(g.s, 'bot-2'));
    assert.equal(a.extra.targetId, 'bot-4');
  }
  // Seer: never re-checks someone while there is anyone left unchecked.
  g.s.seerLog = ['bot-1', 'bot-3', 'bot-4', 'bot-6'].map((id) => ({ round: 1, by: 'bot-5', targetId: id, isWolf: id === 'bot-1' }));
  for (let seed = 1; seed <= 20; seed++) {
    const a = new BotMind('bot-5', 'sheep', createRng(seed)).act(viewFor(g.s, 'bot-5'));
    assert.ok(['p0', 'bot-2', 'bot-7'].includes(a.extra.targetId), `rechecked ${a.extra.targetId}`);
  }
  // Village: a single Seer claim against bot-2 makes villagers vote bot-2.
  const v = botDay(['villager', 'werewolf', 'werewolf', 'villager', 'villager', 'seer', 'villager', 'villager']);
  v.s = v.say('bot-5', 'claimWolf', 0, ['bot-2']).state;
  v.s = reduce(v.s, { kind: 'startVote', by: 'p0', now: T0 }, v.rng).state;
  let hits = 0;
  for (let seed = 1; seed <= 40; seed++) {
    for (const persona of PERSONALITIES) {
      const a = new BotMind('bot-6', persona, createRng(seed)).act(viewFor(v.s, 'bot-6'));
      if (a.extra.targetId === 'bot-2') hits++;
    }
  }
  assert.ok(hits >= 140, `villagers followed the Seer ${hits}/160 times`);
  // The accused wolf's teammate does not vote for it (almost never: the bus is rare).
  let bus = 0;
  for (let seed = 1; seed <= 100; seed++) if (new BotMind('bot-1', 'sheep', createRng(seed)).act(viewFor(v.s, 'bot-1')).extra.targetId === 'bot-2') bus++;
  assert.ok(bus <= 30, `wolf voted its teammate ${bus}/100 times`);
});

test('a real Seer bot goes public with a wolf it found, and calls out a fake Seer', () => {
  const g = botDay(['villager', 'werewolf', 'villager', 'seer', 'villager', 'villager', 'villager']);
  g.s.seerLog = [{ round: 1, by: 'bot-3', targetId: 'bot-1', isWolf: true }];
  let claimed = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const l = new BotMind('bot-3', 'detective', createRng(seed)).talk(viewFor(g.s, 'bot-3'), 'day');
    if (l?.key === 'claimWolf') { claimed++; assert.deepEqual(l.ids, ['bot-1']); }
  }
  assert.ok(claimed >= 30, `claimed ${claimed}/40`);
  // A wolf claims Seer and calls the real Seer's checked villager a wolf: the real Seer counters.
  g.s.seerLog.push({ round: 1, by: 'bot-3', targetId: 'bot-4', isWolf: false });
  g.s = g.say('bot-1', 'claimWolf', 0, ['bot-4']).state;
  let countered = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const l = new BotMind('bot-3', 'sheep', createRng(seed)).talk(viewFor(g.s, 'bot-3'), 'reply');
    if (l?.key === 'counter') { countered++; assert.deepEqual(l.ids, ['bot-1']); }
  }
  assert.ok(countered >= 30, `countered ${countered}/40`);
});

// Full games through the real Host and bots, over the fake network. The host is a human who skips.
async function play(bots, settings) {
  const net = createFakeNetwork();
  const host = new Host({ Peer: net.Peer, hostPlayerId: 'hostplayer', peerOptions: {}, botDelays: { minDelay: 1, maxDelay: 12 } });
  await host.start();
  const h = { view: null };
  const client = new Client({ playerId: 'hostplayer', name: 'Hosty', visibilityReconnect: false, connector: async () => host.attachLoopback(), onView: (v) => { h.view = v; } });
  client.start();
  while (!h.view) await sleep(2);
  host.setBots(bots);
  host.apply({ kind: 'settings', by: 'hostplayer', patch: settings });
  while (h.view.players.length < bots + 1) await sleep(2);
  client.send('startGame');
  while (h.view.phase !== 'reveal') await sleep(2);
  const lines = []; let dayAt = 0;
  const deadline = Date.now() + 60000;
  while (h.view.phase !== 'gameover') {
    if (Date.now() > deadline) throw new Error(`stuck in ${h.view.phase} round ${h.view.round}`);
    for (const c of host.state.chat ?? []) if (!lines.some((x) => x.seq === c.seq)) lines.push({ ...c, role: host.state.players.find((p) => p.id === c.by).role });
    const v = h.view; const p = v.prompt;
    if (v.phase === 'reveal') { if (!v.players.find((x) => x.id === v.you.id).ready) client.send('ready'); if (v.progress.done === v.progress.total) client.send('nextPhase'); }
    else if (v.phase === 'night') {
      if (p && !p.done && v.you.alive) client.send('nightPick', { targetId: p.kind === 'witch' ? 'pass' : p.required ? p.targets[0] : null, ...(p.picks === 2 ? { targetId2: p.targets[1] } : {}) });
      else if (v.progress.done >= v.progress.total) client.send('nextPhase');
    } else if (v.phase === 'day') { if (!dayAt) dayAt = Date.now(); if (Date.now() - dayAt > 150) { dayAt = 0; client.send(v.round === 0 ? 'nextPhase' : 'startVote'); } }
    else if (v.phase === 'vote') { if (v.voteResult) client.send('nextPhase'); else if (p?.kind === 'vote' && !p.done) client.send('vote', { targetId: 'skip' }); else if (v.progress && v.progress.done >= v.progress.total) client.send('nextPhase'); }
    else if (v.phase === 'shot') { if (p?.kind === 'shoot') client.send('shoot', { targetId: p.targets[0] }); else if (v.isHost) client.send('nextPhase'); }
    await sleep(6);
  }
  const winner = h.view.winner;
  host.close();
  return { winner, lines };
}

test('smart bots play whole games and talk: claims, counters, reports, accusations all happen', async () => {
  const seen = {}; let wolfClaims = 0; let realClaims = 0;
  for (let i = 0; i < 14; i++) {
    const r = await play(6 + (i % 7), i % 2 ? { revealOnDeath: true } : { randomize: true });
    assert.ok(r.winner);
    for (const l of r.lines) {
      seen[l.key] = (seen[l.key] ?? 0) + 1;
      if (l.key === 'claimWolf' || l.key === 'counter') { if (l.role === 'werewolf' || l.role === 'wolfcub') wolfClaims++; else if (l.role === 'seer') realClaims++; }
      // Seer talk only ever comes from a Seer or a lying wolf.
      if (['claimWolf', 'claimClean', 'reportWolf', 'reportClean', 'counter'].includes(l.key)) assert.ok(['seer', 'werewolf', 'wolfcub'].includes(l.role), `${l.role} talked like a Seer`);
    }
  }
  for (const k of ['accuse', 'agree', 'defend', 'rip', 'voteFor', 'claimWolf', 'reportWolf', 'counter', 'filler']) assert.ok(seen[k], `no ${k} line in 14 games: ${JSON.stringify(seen)}`);
  assert.ok(realClaims > 0 && wolfClaims > 0, `real ${realClaims}, wolf ${wolfClaims}`);
});

test('dumb bots play like before: a whole game without a word', async () => {
  for (let i = 0; i < 3; i++) {
    const r = await play(9, { dumbBots: true });
    assert.ok(r.winner);
    assert.equal(r.lines.length, 0);
  }
});

test('personality knobs exist for every personality', () => {
  for (const p of PERSONALITIES) assert.ok(PERSONA[p], p);
});
