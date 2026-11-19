// Headless random games. Every player acts only through what their own view offers (the same
// contract a phone has), and every action must be accepted: a rejected legal move is a bug.
import test from 'node:test';
import assert from 'node:assert/strict';
import { reduce, createState, PHASE } from '../js/game/engine.js';
import { viewFor } from '../js/game/views.js';
import { presetFor, validate, COUNT_KEYS, EXTRA_KEYS, randomCounts as realRandomCounts } from '../js/game/setup.js';
import { isWolf } from '../js/game/roles.js';
import { createRng } from '../js/util/rng.js';
import { setLang, tr } from '../js/i18n.js';
import { parseLine, parseLines, sfxPlan } from '../js/ui/fx.js';

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

function randomCounts(rng, n) {
  if (rng() < 0.15) return null; // auto = classic preset
  for (let tries = 0; tries < 200; tries++) {
    const c = Object.fromEntries(COUNT_KEYS.map((k) => [k, 0]));
    c.wolves = 1 + Math.floor(rng() * 3);
    c.seer = Math.floor(rng() * 3); c.bodyguard = Math.floor(rng() * 2);
    for (const k of EXTRA_KEYS) c[k] = rng() < 0.6 ? 1 + Math.floor(rng() * 2) : 0;
    c.villagers = n - COUNT_KEYS.filter((k) => k !== 'villagers').reduce((s, k) => s + c[k], 0);
    if (validate(c, n).ok) return c;
  }
  return null;
}

// Independent win-condition oracle, written from the rules and not from the engine's code.
function oracle(players) {
  const alive = players.filter((p) => p.alive);
  const wolves = alive.filter((p) => p.role === 'werewolf' || p.role === 'wolfcub').length;
  const rest = alive.length - wolves;
  if (wolves === 0) return 'village';
  if (wolves >= rest) return 'wolves';
  return null;
}

class Sim {
  constructor(seed, n, chaos = false) {
    this.chaos = chaos;
    this.rng = createRng(seed);
    this.r = createRng(seed * 7919 + 13); // decisions
    this.n = n;
    this.kr = createRng(seed * 31 + 7); // kick decisions: a separate stream, so the other sim choices stay as they were
    this.kickGame = this.kr() < 0.25;
    this.steps = 0;
    this.stats = { deaths: 0, shots: 0, doubleKills: 0, heals: 0, poisons: 0, princeSaves: 0, jesterWins: 0, sickNights: 0, hauntOffers: 0, hauntVotes: 0, promotions: 0,
      events: 0, horseshoes: 0, horseshoeSaves: 0, horseshoeWasted: 0, kicks: 0, kicksEndedGame: 0 };
    this.s = createState({ hostId: 'p0', roomCode: 'ABCD' });
    for (let i = 0; i < n; i++) this.do({ kind: 'join', by: i < 15 ? `p${i}` : `bot-${i}`, name: `P${i}` }); // seats past 15 are bots, as in the app
  }

  do(action) {
    const before = this.s;
    const res = reduce(this.s, { now: 0, ...action }, this.rng);
    assert.ok(!res.error, `step ${this.steps} ${JSON.stringify(action)} rejected: ${res.error?.message} (phase ${before.phase})`);
    this.s = res.state;
    this.steps++;
    this.oracleStep(before, this.s);
    this.check();
    return res;
  }

  // Independent shadow rules for promotions and haunt votes, written from the spec, not the engine.
  oracleStep(before, after) {
    if (before.phase === PHASE.LOBBY || after.phase === PHASE.LOBBY) return;
    const was = new Map(before.players.map((p) => [p.id, p]));
    const died = after.players.filter((p) => was.get(p.id).alive && !p.alive && !p.kicked); // a removed Seer promotes nobody
    const seerDeaths = died.filter((p) => was.get(p.id).role === 'seer').length;
    const survivingApprentices = after.players.filter((p) => p.alive && was.get(p.id).role === 'apprentice');
    const promoted = after.players.filter((p) => was.get(p.id).role === 'apprentice' && p.role === 'seer');
    assert.equal(promoted.length, Math.min(seerDeaths, survivingApprentices.length), 'one promotion per dead Seer, never a dead Apprentice');
    assert.ok(promoted.every((p) => p.alive));
    this.stats.promotions += promoted.length;
    // no other role ever changes
    for (const p of after.players) if (was.get(p.id).role !== p.role) assert.ok(was.get(p.id).role === 'apprentice' && p.role === 'seer');
    // vote tally, including haunt votes
    if (before.phase === PHASE.VOTE && before.vote.stage === 'voting' && after.vote?.stage === 'result') {
      const tally = new Map();
      const add = (t) => tally.set(t, (tally.get(t) ?? 0) + 1);
      for (const p of before.players.filter((x) => x.alive)) add(after.vote.votes[p.id] ?? 'skip');
      for (const id of after.vote.ghosts) { const t = after.vote.votes[id]; if (t && t !== 'pass') add(t); }
      const max = Math.max(...tally.values());
      const top = [...tally.keys()].filter((k) => tally.get(k) === max);
      let expected = top.length === 1 && top[0] !== 'skip' ? top[0] : null;
      if (expected && was.get(expected).role === 'prince' && !was.get(expected).revealed) expected = null;
      assert.equal(after.vote.result.eliminatedId, expected, 'vote outcome matches the independent tally');
      for (const id of after.vote.ghosts) assert.equal(id in after.vote.result.votes, !!after.vote.votes[id] && after.vote.votes[id] !== 'pass');
    }
  }

  // Invariants checked after every single action.
  check() {
    const s = this.s;
    assert.ok(Object.values(PHASE).includes(s.phase), `bad phase ${s.phase}`);
    JSON.stringify(s); // serialisable
    const players = s.players;
    if (s.phase !== PHASE.LOBBY) {
      assert.ok(players.every((p) => p.role), 'everyone has a role');
      assert.ok(s.shots.every((id) => !players.find((p) => p.id === id).alive), 'only dead hunters owe a shot');
      assert.ok(s.shots.every((id) => players.find((p) => p.id === id).role === 'hunter'));
      assert.ok(s.shots.every((id) => !players.find((p) => p.id === id).kicked), 'a removed hunter owes no shot');
      assert.ok(players.filter((p) => p.kicked).every((p) => !p.alive), 'removed players are out');
      if (s.phase !== PHASE.SHOT) assert.equal(s.shots.length, 0, 'no unresolved shots outside the shot phase');
      for (const p of players) {
        if (p.role === 'witch') assert.ok(p.potions && typeof p.potions.heal === 'boolean' && typeof p.potions.poison === 'boolean');
        else assert.equal(p.potions, null);
      }
    }
    if (s.phase === PHASE.GAMEOVER) {
      assert.ok(['village', 'wolves', 'jester'].includes(s.winner));
      if (s.winner === 'jester') assert.ok(players.some((p) => p.role === 'jester' && !p.alive), 'jester must be dead to win');
      else assert.equal(s.winner, oracle(players), 'winner matches the board');
    }
    // The game must be over the moment a side has won (the vote-result screen and a pending
    // hunter shot are the only places the announcement is allowed to lag behind).
    if ([PHASE.NIGHT, PHASE.DAY].includes(s.phase) || (s.phase === PHASE.VOTE && s.vote.stage === 'voting')) {
      assert.equal(oracle(players), null, `game should already be over in ${s.phase}`);
    }
    // Views: no leaks, always serialisable.
    for (const me of players) {
      const v = viewFor(s, me.id);
      JSON.stringify(v);
      for (const p of v.players) {
        if (p.id === me.id || s.phase === PHASE.GAMEOVER) continue;
        const target = players.find((x) => x.id === p.id);
        const allowed = (!target.alive && s.settings.revealOnDeath) || target.revealed;
        if (!allowed) assert.equal(p.role, null, `${me.id} sees ${p.id}'s role (${target.role}) in ${s.phase}`);
      }
      if (v.you.private.teammates) assert.ok(isWolf(me.role));
      if (v.prompt?.healTargets !== undefined) assert.equal(me.role, 'witch');
      if (v.you.private.potions) assert.equal(me.role, 'witch');
      if (v.prompt?.kind === 'shoot') assert.equal(s.shots[0], me.id);
      const ghostNow = s.phase === PHASE.VOTE && s.vote.stage === 'voting' && s.vote.ghosts.includes(me.id);
      if (!me.alive && s.phase !== PHASE.SHOT && !(s.phase === PHASE.VOTE && s.vote.ghosts?.includes(me.id) && s.vote.stage === 'voting')) assert.equal(v.prompt, null, 'dead players get no prompt');
      if (v.prompt?.haunt) assert.ok(!me.alive && me.role === 'poltergeist' && ghostNow, 'only a haunting ghost sees the haunt prompt');
      // Lucky horseshoe: only its non-wolf holder is told, and nobody else learns anything about it.
      const hs = s.horseshoe;
      assert.equal(!!v.you.private.horseshoe, !!hs && hs.id === me.id && !isWolf(me.role), 'only the holder knows about the horseshoe');
      if (!(hs && hs.id === me.id)) assert.ok(!/horseshoe/.test(JSON.stringify({ ...v, log: [], announce: [], history: [] })), 'no horseshoe detail outside the public line');
      assert.ok(!('event' in v) && !/"fired"/.test(JSON.stringify(v)), 'the coming event is never sent');
      if (me.role === 'apprentice') assert.equal(v.you.private.seerLog, undefined);
      if (me.promoted) assert.equal(me.role, 'seer');
    }
  }

  viewOf(id) { return viewFor(this.s, id); }
  alive() { return this.s.players.filter((p) => p.alive); }

  playGame() {
    const r = this.r;
    // chaos: the app's real MAX chaos generator (no plain villagers), not the sim's own mix
    const counts = this.chaos ? realRandomCounts(this.n, r, { noVillagers: true }) : randomCounts(r, this.n);
    if (counts) this.do({ kind: 'settings', by: 'p0', patch: { counts } });
    if (r() < 0.3) this.do({ kind: 'settings', by: 'p0', patch: { revealOnDeath: false } });
    this.do({ kind: 'startGame', by: 'p0' });
    const ev = this.s.event;
    if (ev) this.stats.events++;
    for (const p of this.s.players) if (r() < 0.9) this.do({ kind: 'ready', by: p.id });
    while (this.s.phase !== PHASE.GAMEOVER) {
      assert.ok(this.steps < 3000, 'game did not terminate');
      this.turn();
    }
    const hs = this.s.horseshoe;
    if (hs) {
      this.stats.horseshoes++;
      if (isWolf(this.s.players.find((p) => p.id === hs.id).role)) { this.stats.horseshoeWasted++; assert.equal(hs.used, false, 'a wolf never uses it'); }
    }
    if (ev && ev.fired) assert.ok(this.s.history.some((e) => /lucky horseshoe/.test(e.text)), 'a fired event is in the history');
    return this.s;
  }

  // The host removes a human now and then, in any phase. They may reconnect, but only as a spectator.
  maybeKick() {
    const s = this.s; const kr = this.kr;
    if (!this.kickGame || s.phase === PHASE.LOBBY || s.phase === PHASE.GAMEOVER || kr() > 0.12) return;
    const targets = s.players.filter((p) => p.id !== 'p0' && !p.id.startsWith('bot-') && !p.kicked);
    if (!targets.length) return;
    const t = pick(kr, targets);
    this.stats.kicks++;
    this.do({ kind: 'kick', by: 'p0', targetId: t.id });
    assert.ok(!this.s.players.find((p) => p.id === t.id).alive, 'a removed player is out of the game');
    if (this.s.phase === PHASE.GAMEOVER && s.phase !== PHASE.GAMEOVER) this.stats.kicksEndedGame++;
    const back = reduce(this.s, { now: 0, kind: 'join', by: t.id, name: t.name }, this.rng);
    assert.ok(!back.error, 'a removed phone can reconnect');
    assert.equal(back.state.players.find((p) => p.id === t.id).alive, false, 'as a spectator, still out of the game');
    assert.ok(reduce(this.s, { now: 0, kind: 'kick', by: 'p1', targetId: 'p2' }, this.rng).error, 'only the host can remove players');
  }

  turn() {
    const r = this.r;
    this.maybeKick();
    if (this.s.phase === PHASE.GAMEOVER) return; // the removal ended the game
    const s = this.s;
    switch (s.phase) {
      case PHASE.REVEAL: this.do({ kind: 'nextPhase', by: 'p0' }); break;
      case PHASE.NIGHT: this.night(); break;
      case PHASE.DAY: this.do({ kind: 'startVote', by: 'p0' }); break;
      case PHASE.VOTE: this.voting(); break;
      case PHASE.SHOT: {
        const hunter = s.players.find((p) => p.id === s.shots[0]);
        const v = this.viewOf(hunter.id);
        assert.equal(v.prompt.kind, 'shoot');
        assert.ok(v.prompt.targets.length > 0);
        assert.ok(v.prompt.targets.every((id) => s.players.find((p) => p.id === id).alive));
        this.stats.shots++;
        if (r() < 0.8) this.do({ kind: 'shoot', by: hunter.id, targetId: pick(r, v.prompt.targets) });
        else this.do({ kind: 'nextPhase', by: 'p0' }); // idle hunter, host skips
        break;
      }
      default: assert.fail(`unexpected phase ${s.phase}`);
    }
  }

  night() {
    const r = this.r;
    if (this.s.night.doubleKill) this.stats.doubleKills++;
    if (this.s.night.noKill) { this.stats.sickNights++; assert.equal(this.s.night.doubleKill, false, 'skip beats revenge'); }
    // Wolves first so the witch has something to look at some of the time.
    const order = [...this.alive()].sort((a, b) => (isWolf(b.role) ? 1 : 0) - (isWolf(a.role) ? 1 : 0));
    for (const p of order) {
      if (r() < 0.07) continue; // idle player: host moves on without them
      const v = this.viewOf(p.id);
      const pr = v.prompt;
      assert.ok(pr && pr.kind, `${p.id} (${p.role}) has a night prompt`);
      assert.equal(pr.done, false);
      if (pr.kind === 'witch') {
        const opts = ['pass'];
        if (pr.canHeal && pr.healTargets?.length) opts.push(`heal:${pick(r, pr.healTargets)}`);
        if (pr.canPoison && pr.targets.length) opts.push(`poison:${pick(r, pr.targets)}`);
        const t = pick(r, opts);
        if (t.startsWith('heal')) this.stats.heals++;
        if (t.startsWith('poison')) this.stats.poisons++;
        this.do({ kind: 'nightPick', by: p.id, targetId: t });
      } else if (!pr.required) {
        this.do({ kind: 'nightPick', by: p.id, targetId: r() < 0.5 || !pr.targets.length ? null : pick(r, pr.targets) });
      } else if (pr.picks === 2) {
        const a = pick(r, pr.targets);
        this.do({ kind: 'nightPick', by: p.id, targetId: a, targetId2: pick(r, pr.targets.filter((x) => x !== a)) });
      } else {
        this.do({ kind: 'nightPick', by: p.id, targetId: pick(r, pr.targets) });
      }
    }
    const aliveBefore = this.alive().length;
    const doubleKill = this.s.night.doubleKill;
    const noKill = this.s.night.noKill;
    const deadBefore = new Set(this.s.players.filter((p) => !p.alive).map((p) => p.id));
    const hsBefore = this.s.horseshoe && !this.s.horseshoe.used ? this.s.horseshoe.id : null;
    const histBefore = this.s.history.length;
    this.do({ kind: 'nextPhase', by: 'p0' });
    if (hsBefore && this.s.horseshoe.used) {
      this.stats.horseshoeSaves++;
      const holder = this.s.players.find((p) => p.id === hsBefore);
      const night = this.s.history.slice(histBefore).map((e) => e.text);
      assert.ok(night.some((t) => t.startsWith(`${holder.name} (`) && /lucky horseshoe saved them/.test(t)), 'the horseshoe is only spent on a wolf attack on its holder');
      assert.ok(night.some((t) => /^The wolves' victims?: /.test(t) && t.includes(holder.name)));
    }
    const killed = this.s.players.filter((p) => !p.alive && !deadBefore.has(p.id)).length;
    // wolves kill at most 1 (2 on a revenge night), the witch poison adds at most 1 per witch, a hunter at most 1 per hunter
    const witches = this.s.players.filter((p) => p.role === 'witch').length;
    const hunters = this.s.players.filter((p) => p.role === 'hunter').length;
    this.stats.deaths += killed;
    assert.ok(killed <= (noKill ? 0 : doubleKill ? 2 : 1) + witches + hunters, `too many deaths in one night: ${killed}`);
    void aliveBefore;
  }

  voting() {
    const r = this.r; const s = this.s;
    if (s.vote.stage === 'result') {
      if (s.vote.result.princeId) this.stats.princeSaves++;
      if (s.winner === 'jester') this.stats.jesterWins++;
      return this.do({ kind: 'nextPhase', by: 'p0' });
    }
    for (const p of this.alive()) {
      if (this.s.vote.stage !== 'voting') break;
      if (r() < 0.05) continue; // abstains by being idle
      const pr = this.viewOf(p.id).prompt;
      assert.equal(pr.kind, 'vote');
      const opts = [...pr.targets, 'skip'];
      // bias toward a popular target so eliminations actually happen
      const t = r() < 0.7 ? (this.focus && pr.targets.includes(this.focus) ? this.focus : pick(r, pr.targets)) : pick(r, opts);
      this.do({ kind: 'vote', by: p.id, targetId: t });
    }
    for (const id of [...this.s.vote?.ghosts ?? []]) {
      if (this.s.phase !== PHASE.VOTE || this.s.vote.stage !== 'voting') break;
      const pr = this.viewOf(id).prompt;
      assert.equal(pr.haunt, true);
      this.stats.hauntOffers++;
      const roll = r();
      if (roll < 0.15) { // idle ghost: the host is held back until they decide
        assert.ok(reduce(this.s, { now: 0, kind: 'nextPhase', by: 'p0' }, this.rng).error, 'vote is held for the ghost');
        this.do({ kind: 'vote', by: id, targetId: 'pass' });
      } else if (roll < 0.4) this.do({ kind: 'vote', by: id, targetId: 'pass' });
      else { this.stats.hauntVotes++; this.do({ kind: 'vote', by: id, targetId: r() < 0.9 ? pick(r, pr.targets) : 'skip' }); }
    }
    if (this.s.phase === PHASE.VOTE && this.s.vote.stage === 'voting') this.do({ kind: 'nextPhase', by: 'p0' });
    this.focus = pick(r, this.alive().map((p) => p.id));
  }
}

const SEEDS = Number(process.env.SIM_SEEDS ?? 150);

setLang('th');

test(`headless sim: ${SEEDS} random games per player count, 5 to 15 players`, () => {
  const cards = {}; const sounds = {};
  const totals = { games: 0, village: 0, wolves: 0, jester: 0, deaths: 0, shots: 0, doubleKills: 0, heals: 0, poisons: 0, princeSaves: 0, sickNights: 0, hauntOffers: 0, hauntVotes: 0, promotions: 0,
    events: 0, horseshoes: 0, horseshoeSaves: 0, horseshoeWasted: 0 };
  for (let n = 5; n <= 15; n++) {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const sim = new Sim(seed * 100 + n, n);
      const end = sim.playGame();
      totals.games++; totals[end.winner]++;
      // Every log / history line must be fully translated: player names are P<n>, so no English word may remain.
      for (const text of [...end.log.map((l) => l.text), ...end.history.map((e) => e.text)]) {
        const out = tr(text).replace(/\bRIP\b/g, '');
        assert.ok(!/[A-Za-z]{3,}/.test(out), `untranslated: "${text}" -> "${out}"`);
      }
      // Every announcement becomes an outcome card; only the suspicion line and the winner (shown on the game-over screen) stay plain text.
      for (const { text } of end.log) {
        const type = parseLine(text).type;
        assert.ok(type !== 'info' || /^Most suspected: |^The (wolves win|village wins|Jester wins)!$|^The host ended the game early\.$| was removed by the host\./.test(text), `no card for: "${text}"`);
        cards[type] = (cards[type] ?? 0) + 1;
        // Every card has a sound.
        if (type !== 'info') for (const { name } of sfxPlan(parseLines([text]))) sounds[name] = (sounds[name] ?? 0) + 1;
        if (type !== 'info') assert.equal(sfxPlan(parseLines([text])).length, 1, `no sound for: "${text}"`);
      }
      for (const k of ['deaths', 'shots', 'doubleKills', 'heals', 'poisons', 'princeSaves', 'sickNights', 'hauntOffers', 'hauntVotes', 'promotions',
        'events', 'horseshoes', 'horseshoeSaves', 'horseshoeWasted', 'kicks', 'kicksEndedGame']) totals[k] = (totals[k] ?? 0) + sim.stats[k];
      // play again resets everything and a second game on the same state works
      if (seed % 10 === 0 && sim.stats.kicks === 0) {
        sim.do({ kind: 'playAgain', by: 'p0' });
        assert.equal(sim.s.phase, PHASE.LOBBY);
        assert.ok(sim.s.players.every((p) => p.alive && p.role === null && p.potions === null && !p.revealed));
        assert.equal(sim.s.cubDied, false); assert.deepEqual(sim.s.shots, []);
        sim.playGame();
        totals.games++; totals.replays = (totals.replays ?? 0) + 1; // stats of the replay are not counted
      }
    }
  }
  console.log('sim totals', JSON.stringify(totals), 'cards', JSON.stringify(cards));
  for (const type of ['night', 'vote', 'shot', 'calm', 'tie', 'prince', 'spared', 'horseshoe']) assert.ok(cards[type] > 3, `${type} cards happened`);
  for (const name of ['nightDeath', 'voteOut', 'shot', 'calm', 'tie', 'prince', 'spared', 'event']) assert.ok(sounds[name] > 3, `${name} sound happened`);
  if (totals.jester > 0) assert.ok(sounds.jester > 0, 'jester sound happened');
  // The sim must actually exercise the new mechanics, or it proves nothing.
  assert.ok(totals.shots > 20, 'hunter shots happened');
  assert.ok(totals.doubleKills > 5, 'cub revenge nights happened');
  assert.ok(totals.heals > 5 && totals.poisons > 5, 'witch potions were used');
  assert.ok(totals.sickNights > 3, 'diseased sick nights happened');
  assert.ok(totals.hauntOffers > 5 && totals.hauntVotes > 5, 'poltergeist haunts happened');
  assert.ok(totals.promotions > 3, 'apprentices were promoted');
  assert.ok(totals.princeSaves > 3, 'prince survived votes');
  assert.ok(totals.jester > 3, 'jester won sometimes');
  // Random events: about 1 game in 5, and each part of both events must actually happen.
  const rate = totals.events / (totals.games - (totals.replays ?? 0));
  assert.ok(rate > 0.16 && rate < 0.24, `about 1 game in 5 gets an event (${(100 * rate).toFixed(1)}%)`);
  assert.ok(totals.horseshoes > 20 && totals.horseshoeSaves > 5 && totals.horseshoeWasted > 3, 'horseshoes were found, used and wasted on wolves');
  assert.ok(totals.kicks > 50 && totals.kicksEndedGame > 3, `host removals happened in games (${totals.kicks}, ${totals.kicksEndedGame} ended the game)`);
  assert.ok(totals.village > 0 && totals.wolves > 0);
});

test(`headless sim: MAX chaos (real generator, no plain villagers), ${SEEDS} games per size`, () => {
  const wins = { village: 0, wolves: 0, jester: 0 }; const bySize = {};
  for (const n of [5, 6, 7, 8, 9, 10, 12, 15, 20, 35]) {
    for (let seed = 1; seed <= (n >= 20 ? Math.min(SEEDS, 10) : SEEDS); seed++) { // big rooms are slow to simulate
      const sim = new Sim(seed * 100 + n, n, true);
      const end = sim.playGame(); // every legal move accepted, game terminates, views stay secret
      wins[end.winner]++;
      (bySize[n] ??= { village: 0, wolves: 0, jester: 0 })[end.winner]++;
    }
  }
  if (process.env.SIM_VERBOSE) console.log('chaos wins by size', JSON.stringify(bySize));
  assert.ok(wins.village > 0 && wins.wolves > 0);
});
