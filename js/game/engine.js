// Pure game state machine. No DOM, no network, no clock, no timers: the host advances the game.
// reduce(state, action, rng) -> { state, effects, error? }
//
// Actions: { kind, by, ...payload, nonce? }
//   join{name} setConnected{connected} leave kick{targetId} settings{patch} startGame ready
//   nightPick{targetId, targetId2?} startVote vote{targetId|'skip'} shoot{targetId} nextPhase playAgain
//   botSay{key, v, ids} (host-run bots only: a table-talk line, see js/game/chat.js)
//   Witch nightPick targetId is 'heal:<id>' | 'poison:<id>' | 'pass'.
//
// Effects: { type:'views' }            host should resend every player's view
//          { type:'narrate', text }    host phone speaks this line
//          { type:'haptic' }           phase change buzz
//          { type:'drop', id }         host should hang up on this player (a stuck phone then reconnects fresh)
import { ROLES, isWolf, isDecoy, teamOf, TEAM } from './roles.js';
import { MAX_PLAYERS, MAX_HUMANS, MAX_BOTS, BOT_NAMES, BOT_TAG, isBotId, MIN_PLAYERS, COUNT_KEYS, presetFor, validate, roleList, fullCounts, randomCounts } from './setup.js';
import { shuffle } from '../util/rng.js';
import { CHAT_MAX, CHAT_PER_ROUND, PERSONALITIES, validChatLine } from './chat.js';

export const PHASE = Object.freeze({
  LOBBY: 'lobby', REVEAL: 'reveal', NIGHT: 'night', DAY: 'day', VOTE: 'vote', SHOT: 'shot', GAMEOVER: 'gameover',
});

const MAX_NAME = 20;
const NONCE_MEMORY = 50;

export const DEFAULT_SETTINGS = Object.freeze({
  counts: null, // null = auto preset for current player count
  randomize: false, // secret random mix, rolled at start; nobody (host included) sees the counts
  noVillagers: false, // only with randomize: MAX chaos, every non-wolf seat is a special role
  revealOnDeath: false,
  hideVotes: false, // hide who-voted-whom on the result screen, so players can lie about their votes
  suspicions: true, // dawn announces who the no-power players suspect most (names only, anonymous); the host can turn it off
  bodyguardSelfProtect: true,
  narration: true,
  randomEvents: true, // about 1 game in 5 gets a random event (only Lucky Horseshoe so far); the host can turn it off
  dumbBots: false, // bots act at random and never talk (how bots worked before v1.29.0)
});

// Random events. Rolled in secret at the start; nobody knows one is coming until its dawn announcement.
export const EVENT_CHANCE = 0.2;
export const EVENT_LINES = Object.freeze({
  horseshoe: 'Someone found a lucky horseshoe.',
});

// Which event a game gets, and the dawn it happens on, or null. Called once at start.
// Lucky Horseshoe is the only event so far; it happens on dawn 1 or 2.
export function rollEvent(settings, rng) {
  if (!settings.randomEvents || rng() >= EVENT_CHANCE) return null;
  return { kind: 'horseshoe', round: 1 + Math.floor(rng() * 2), fired: false };
}

export function createState({ hostId, roomCode }) {
  return {
    hostId, roomCode,
    phase: PHASE.LOBBY,
    settings: { ...DEFAULT_SETTINGS },
    players: [],            // { id, name, connected, role, alive, ready, revealed, potions }
    round: 0,
    night: null,            // { picks, picks2, seerResult, doubleKill, victims }
    bodyguardLast: null,    // who the bodyguard protected last night
    seerLog: [],            // { round, targetId, isWolf }
    vote: null,             // { votes, stage:'voting'|'result', result }
    cubDied: false,         // a wolf cub died: the wolves kill twice on the next night
    diseasedDied: false,    // the wolves killed the Diseased: they cannot kill on the next night
    promotions: 0,          // Seers that died and still need an Apprentice promoted
    shots: [],              // dead hunters who still owe a shot
    afterShot: null,        // 'day' | 'vote': where the game goes once the shots are done
    event: null,            // { kind:'horseshoe', round, fired }: the game's random event, host only
    horseshoe: null,        // { id, round, used, usedRound }: who holds the lucky horseshoe
    lines: [],              // announcements for the current dawn / vote result
    winner: null,           // 'village' | 'wolves' | 'jester' | 'ended' (host stopped the game)
    log: [],                // { text }
    history: [],            // { kind: 'night'|'day'|'end', round, text }: full detail, only shown at game over
    nonces: {},             // playerId -> recent applied nonces
    kickNotes: [],          // removal lines waiting for the next dawn / vote result
    chat: [],               // bot table talk { seq, round, by, key, v, ids } (public), at most CHAT_MAX
    chatSeq: 0,
  };
}

// ---------- helpers ----------
const living = (s) => s.players.filter((p) => p.alive);
const byId = (s, id) => s.players.find((p) => p.id === id);
const livingWolves = (s) => living(s).filter((p) => isWolf(p.role));
const fail = (state, code, message) => ({ state, effects: [], error: { code, message } });

export function effectiveCounts(state) {
  if (state.settings.randomize) return null; // secret: never exposed
  return fullCounts(state.settings.counts) ?? presetFor(state.players.length);
}

export function lobbyValidation(state) {
  if (state.settings.randomize) {
    const n = state.players.length;
    const errors = [];
    if (n < MIN_PLAYERS) errors.push(`Need at least ${MIN_PLAYERS} players.`);
    if (n > MAX_PLAYERS) errors.push(`At most ${MAX_PLAYERS} players.`);
    return { ok: errors.length === 0, errors };
  }
  const counts = effectiveCounts(state);
  return validate(counts, state.players.length);
}

export function checkWinner(state) {
  const wolves = livingWolves(state).length;
  const others = living(state).length - wolves;
  if (wolves === 0) return TEAM.VILLAGE;
  if (wolves >= others) return TEAM.WOLVES;
  return null;
}

// ---------- reducer ----------
export function reduce(prev, action, rng) {
  const state = structuredClone(prev);
  const fx = [];
  const sender = action.by != null ? byId(state, action.by) : null;
  const isHost = action.by === state.hostId;

  // Replay protection.
  if (action.nonce != null && action.by != null) {
    const seen = state.nonces[action.by] ?? [];
    if (seen.includes(action.nonce)) return { state: prev, effects: [] };
  }

  let err = null;
  switch (action.kind) {
    case 'join': err = join(state, action); break;
    case 'setConnected': if (sender) sender.connected = !!action.connected; break;
    case 'leave': err = leave(state, action); break;
    case 'kick': err = kick(state, action, isHost, rng, fx); break;
    case 'settings': err = settings(state, action, isHost); break;
    case 'setBots': err = setBots(state, action, isHost, rng); break;
    case 'startGame': err = startGame(state, action, isHost, rng, fx); break;
    case 'ready': err = ready(state, action, sender, fx); break;
    case 'nightPick': err = nightPick(state, action, sender, rng, fx); break;
    case 'startVote': err = startVote(state, action, sender, isHost, fx); break;
    case 'vote': err = vote(state, action, sender, fx); break;
    case 'shoot': err = shoot(state, action, sender, fx, rng); break;
    case 'nextPhase': err = nextPhase(state, action, isHost, rng, fx); break;
    case 'playAgain': err = playAgain(state, isHost); break;
    case 'endEarly': err = endEarly(state, isHost, fx); break;
    case 'botSay': err = botSay(state, action, sender); break;
    default: err = { code: 'badAction', message: `Unknown action ${action.kind}` };
  }
  if (err) return { state: prev, effects: [], error: err };

  if (action.nonce != null && action.by != null) {
    const seen = state.nonces[action.by] ?? [];
    state.nonces[action.by] = [...seen, action.nonce].slice(-NONCE_MEMORY);
  }

  fx.push({ type: 'views' });
  return { state, effects: fx };
}

// ---------- lobby ----------
function join(state, { by, name }) {
  const clean = String(name ?? '').trim().slice(0, MAX_NAME);
  if (!by) return { code: 'badAction', message: 'Missing player id.' };
  const existing = byId(state, by);
  if (existing) { // rejoin
    existing.connected = true;
    if (clean && state.phase === PHASE.LOBBY) existing.name = clean;
    return null;
  }
  if (state.phase !== PHASE.LOBBY) return { code: 'gameStarted', message: 'Game already started.' };
  if (!clean) return { code: 'badName', message: 'Enter a name.' };
  if (state.players.length >= MAX_PLAYERS || (!isBotId(by) && state.players.filter((p) => !isBotId(p.id)).length >= MAX_HUMANS)) return { code: 'roomFull', message: 'Room is full.' };
  state.players.push({ id: by, name: clean, connected: true, role: null, alive: true, ready: false, revealed: false, potions: null });
  return null;
}

function leave(state, { by }) {
  if (state.phase !== PHASE.LOBBY) return { code: 'gameStarted', message: 'Game already started.' };
  if (by === state.hostId) return { code: 'forbidden', message: 'Host cannot leave.' };
  state.players = state.players.filter((p) => p.id !== by);
  return null;
}

// Host only, for a phone that is stuck or for abuse. Not part of normal play.
// Lobby: the player is removed. In a game: they are eliminated quietly (no hunter shot, no cub revenge, no
// Apprentice promotion), the win check runs, and the phase that was waiting on them carries on.
// Either way the host drops their connection, and the phone may come back (a stuck phone reconnects fresh:
// into the lobby, or into a game as a spectator). There is no ban.
function kick(state, { targetId }, isHost, rng, fx) {
  if (!isHost) return { code: 'forbidden', message: 'Only the host can remove players.' };
  const p = byId(state, targetId);
  if (!p) return { code: 'unknownPlayer', message: 'Unknown player.' };
  if (p.id === state.hostId || isBotId(p.id)) return { code: 'forbidden', message: 'You cannot remove the host or a bot.' };
  fx.push({ type: 'drop', id: p.id });
  if (state.phase === PHASE.LOBBY) { state.players = state.players.filter((x) => x.id !== p.id); return null; }
  if (state.phase === PHASE.GAMEOVER) return null; // nothing to remove: the game is over, the phone just reconnects
  const wasAlive = p.alive;
  p.alive = false; p.kicked = true; p.haunt = false;

  const shooter = state.phase === PHASE.SHOT && state.shots[0] === p.id;
  state.shots = state.shots.filter((id) => id !== p.id);
  if (state.night) { delete state.night.picks[p.id]; delete state.night.picks2[p.id]; if (state.night.suspects) delete state.night.suspects[p.id]; }
  const voting = state.phase === PHASE.VOTE && state.vote.stage === 'voting';
  if (voting) { delete state.vote.votes[p.id]; state.vote.ghosts = (state.vote.ghosts ?? []).filter((id) => id !== p.id); }
  hist(state, state.phase === PHASE.DAY || state.phase === PHASE.VOTE ? 'day' : 'night', `${p.name} (${ROLES[p.role].name}) was removed by the host.`);

  if (wasAlive) {
    const text = `${p.name} was removed by the host.${roleNote(state, p)}`;
    const showNow = state.phase === PHASE.DAY || state.phase === PHASE.SHOT || (state.phase === PHASE.VOTE && !voting);
    if (showNow) { say(state, text); fx.push({ type: 'narrate', text }); }
    else (state.kickNotes ??= []).push(text);
  }

  if (shooter) { // the pending shot is gone: the next hunter shoots, or the game carries on
    if (state.shots.length) announceShot(state, fx); else finishAfter(state, state.afterShot, fx, rng);
    return null;
  }
  const winner = checkWinner(state);
  if (state.phase === PHASE.VOTE && !voting) {
    if (state.winner !== TEAM.JESTER) state.winner = winner;
    return null;
  }
  if (winner) { state.shots = []; endGame(state, winner, fx, state.lines.join(' ')); return null; }
  if (state.phase === PHASE.NIGHT && !state.night.noKill && state.night.victims == null && livingWolves(state).every((w) => w.id in state.night.picks)) {
    state.night.victims = computeVictims(state, rng); // the kicked wolf was the last one still thinking
  }
  if (voting) {
    const v = state.vote;
    if (living(state).every((x) => x.id in v.votes) && (v.ghosts ?? []).every((id) => id in v.votes)) resolveVote(state, fx);
  }
  return null;
}

function settings(state, { patch }, isHost) {
  if (!isHost) return { code: 'forbidden', message: 'Only the host can change settings.' };
  if (state.phase !== PHASE.LOBBY) return { code: 'badPhase', message: 'Settings are locked.' };
  const s = state.settings;
  for (const [k, v] of Object.entries(patch ?? {})) {
    switch (k) {
      case 'revealOnDeath': case 'bodyguardSelfProtect': case 'narration': case 'randomize': case 'noVillagers': case 'hideVotes': case 'suspicions': case 'randomEvents': case 'dumbBots': s[k] = !!v; break;
      case 'counts':
        s.randomize = false;
        if (v === null) s.counts = null;
        else s.counts = Object.fromEntries(COUNT_KEYS.map((key) => [key, Number(v?.[key] ?? 0)]));
        break;
      default: return { code: 'badSetting', message: `Unknown setting ${k}.` };
    }
  }
  return null;
}

// Host-run bots: ids bot-1..bot-N, joined in one step so 1000 bots cost one state copy, not 1000.
function setBots(state, { count }, isHost, rng) {
  if (!isHost) return { code: 'forbidden', message: 'Only the host can change bots.' };
  if (state.phase !== PHASE.LOBBY) return { code: 'badPhase', message: 'Bots can only change in the lobby.' };
  const n = Number(count);
  if (!Number.isInteger(n) || n < 0 || n > MAX_BOTS) return { code: 'badBots', message: `Bots must be 0 to ${MAX_BOTS}.` };
  const humans = state.players.filter((p) => !isBotId(p.id));
  const bots = state.players.filter((p) => isBotId(p.id) && Number(p.id.slice(4)) <= n); // keep existing bots and their names
  const taken = new Set(state.players.map((p) => p.name));
  const pool = shuffle(rng, BOT_NAMES.map((x) => x + BOT_TAG).filter((x) => !taken.has(x)));
  const have = new Set(bots.map((p) => p.id));
  for (let i = 1; i <= n; i++) {
    if (have.has(`bot-${i}`)) continue;
    const name = pool.pop() ?? `Bot ${i}${BOT_TAG}`; // pool used up: plain numbered name
    // A personality for how the bot plays and talks. Public (it never depends on the role).
    const persona = PERSONALITIES[Math.floor(rng() * PERSONALITIES.length)];
    bots.push({ id: `bot-${i}`, name, connected: true, role: null, alive: true, ready: false, revealed: false, potions: null, persona });
  }
  bots.sort((x, y) => Number(x.id.slice(4)) - Number(y.id.slice(4)));
  state.players = [...humans, ...bots];
  return null;
}

function startGame(state, _a, isHost, rng, fx) {
  if (!isHost) return { code: 'forbidden', message: 'Only the host can start.' };
  if (state.phase !== PHASE.LOBBY) return { code: 'badPhase', message: 'Already started.' };
  const v = lobbyValidation(state);
  if (!v.ok) return { code: 'badSetup', message: v.errors.join(' ') };
  const roles = shuffle(rng, roleList(state.settings.randomize ? randomCounts(state.players.length, rng, { noVillagers: state.settings.noVillagers }) : effectiveCounts(state)));
  state.players.forEach((p, i) => {
    p.role = roles[i]; p.alive = true; p.ready = false; p.revealed = false;
    p.potions = p.role === 'witch' ? { heal: true, poison: true } : null;
    p.promoted = false; p.haunt = false; delete p.kicked;
  });
  state.phase = PHASE.REVEAL;
  state.round = 0;
  state.log = [];
  state.history = [];
  state.lines = [];
  state.seerLog = [];
  state.bodyguardLast = null;
  state.cubDied = false;
  state.diseasedDied = false;
  state.promotions = 0;
  state.shots = [];
  state.afterShot = null;
  state.winner = null;
  state.night = null;
  state.vote = null;
  state.event = rollEvent(state.settings, rng);
  state.horseshoe = null;
  state.chat = [];
  fx.push({ type: 'haptic' });
  return null;
}

function ready(state, _a, sender) {
  if (state.phase !== PHASE.REVEAL) return { code: 'badPhase', message: 'Not in role reveal.' };
  if (!sender) return { code: 'unknownPlayer', message: 'Unknown player.' };
  sender.ready = true;
  return null;
}

// ---------- deaths ----------
// Every death goes through here so cub / hunter triggers are never missed.
function killPlayer(state, p) {
  p.alive = false;
  if (p.role === 'wolfcub') state.cubDied = true;
  if (p.role === 'hunter') state.shots.push(p.id);
  if (p.role === 'seer') state.promotions += 1;
  if (p.role === 'poltergeist') p.haunt = true; // may haunt at the next vote that starts
}

// Each dead Seer promotes at most one living Apprentice (first in seating order). Runs once a whole
// batch of deaths is settled, so an Apprentice who died in the same batch is never promoted.
function promoteApprentices(state) {
  while (state.promotions > 0) {
    state.promotions -= 1;
    const a = living(state).find((p) => p.role === 'apprentice');
    if (!a) continue;
    a.role = 'seer'; a.promoted = true;
    hist(state, state.phase === PHASE.NIGHT ? 'night' : 'day', `${a.name} (Seer's Apprentice) was promoted to Seer.`);
  }
}

// Removals that happened while the room was waiting (reveal, night, voting) are announced with the next news.
function flushKickNotes(state) {
  for (const text of state.kickNotes ?? []) say(state, text);
  state.kickNotes = [];
}

function roleNote(state, p) {
  return state.settings.revealOnDeath ? ` They were a ${ROLES[p.role].name}.` : '';
}

// Record an announcement in the permanent log and in the current dawn / vote-result lines.
function say(state, text) {
  state.log.push({ text });
  state.lines.push(text);
}

// Full-detail record (roles, causes, tallies) that is only sent to players once the game is over.
const who = (p) => `${p.name} (${ROLES[p.role].name})`;
function hist(state, kind, text) {
  state.history.push({ kind, round: state.round, text });
}

// After a batch of deaths: hunters shoot first, then the game carries on at `after`.
function afterDeaths(state, after, fx, rng) {
  promoteApprentices(state);
  if (!living(state).length) state.shots = []; // everyone is dead: nobody left to shoot
  if (state.shots.length) {
    state.phase = PHASE.SHOT;
    state.afterShot = after;
    state.night = null;
    announceShot(state, fx);
    return;
  }
  finishAfter(state, after, fx, rng);
}

function announceShot(state, fx) {
  const h = byId(state, state.shots[0]);
  // With role reveal off the narration must not name the role (the shot itself is unavoidably visible).
  fx.push({ type: 'narrate', text: state.settings.revealOnDeath ? `${h.name} was the Hunter! One last shot…` : `${h.name} gets one last shot…` });
  fx.push({ type: 'haptic' });
}

function finishAfter(state, after, fx, rng) {
  state.afterShot = null;
  if (after === 'day') {
    state.night = null;
    const winner = checkWinner(state);
    if (winner) return endGame(state, winner, fx, state.lines.join(' '));
    fireEvent(state, rng);
    const text = state.lines.join(' ');
    state.phase = PHASE.DAY;
    fx.push({ type: 'narrate', text });
    fx.push({ type: 'haptic' });
    return null;
  }
  // after a vote: back to the result screen; the winner is announced after it
  state.phase = PHASE.VOTE;
  if (state.winner !== TEAM.JESTER) state.winner = checkWinner(state);
  return null;
}

// The game's random event happens at the start of its day, after the dawn news, if the game is still on.
// Its line goes before the suspicion line, so the news reads deaths, event, then suspicions.
function fireEvent(state, rng) {
  const ev = state.event;
  if (!ev || ev.fired || ev.round !== state.round) return;
  ev.fired = true;
  if (ev.kind === 'horseshoe') {
    // Any living player, wolves included: a wolf is never attacked, so on a wolf it is wasted, and nobody is told.
    const alive = living(state);
    const holder = alive[Math.floor(rng() * alive.length)];
    state.horseshoe = { id: holder.id, round: state.round, used: false, usedRound: null };
    hist(state, 'day', isWolf(holder.role)
      ? `${who(holder)} found the lucky horseshoe, but wolves are never attacked, so it did nothing.`
      : `${who(holder)} found the lucky horseshoe.`);
  }
  const text = EVENT_LINES[ev.kind];
  const at = state.lines.findIndex((l) => l.startsWith('Most suspected:'));
  state.log.push({ text });
  if (at < 0) state.lines.push(text); else state.lines.splice(at, 0, text);
}

// ---------- night ----------
function startNight(state, fx) {
  state.round += 1;
  state.phase = PHASE.NIGHT;
  // A sick night (the wolves killed the Diseased) beats a Cub revenge night: no kill at all.
  const noKill = state.diseasedDied;
  state.night = { picks: {}, picks2: {}, suspects: {}, seerResult: null, doubleKill: state.cubDied && !noKill, noKill, victims: noKill ? [] : null };
  state.cubDied = false;
  state.diseasedDied = false;
  state.vote = null;
  state.lines = [];
  fx.push({ type: 'haptic' });
}

// Valid targets for a player's night action.
export function nightTargets(state, player) {
  const alive = living(state);
  switch (player.role) {
    case 'werewolf': case 'wolfcub': return alive.filter((p) => !isWolf(p.role)).map((p) => p.id);
    case 'seer': return alive.filter((p) => p.id !== player.id).map((p) => p.id);
    case 'bodyguard':
      return alive
        .filter((p) => p.id !== state.bodyguardLast)
        .filter((p) => state.settings.bodyguardSelfProtect || p.id !== player.id)
        .map((p) => p.id);
    case 'witch': return alive.filter((p) => p.id !== player.id).map((p) => p.id); // poison targets
    default: return alive.filter((p) => p.id !== player.id).map((p) => p.id);
  }
}

// Wolf victims, known once every living wolf has confirmed. null until then.
export function wolfVictims(state) {
  return state.night?.victims ?? null;
}

function computeVictims(state, rng) {
  const n = state.night;
  if (n.noKill) return [];
  const counts = new Map();
  for (const w of livingWolves(state)) {
    for (const t of [n.picks[w.id], n.picks2[w.id]]) {
      if (t != null) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  // Highest count first, ties broken randomly.
  const ranked = shuffle(rng, [...counts.keys()]).sort((a, b) => counts.get(b) - counts.get(a));
  return ranked.slice(0, n.doubleKill ? 2 : 1);
}

function nightPick(state, { targetId, targetId2 }, sender, rng) {
  if (state.phase !== PHASE.NIGHT) return { code: 'badPhase', message: 'It is not night.' };
  if (!sender || !sender.alive) return { code: 'dead', message: 'You cannot act.' };
  const n = state.night;
  if (sender.id in n.picks) return { code: 'alreadyActed', message: 'Already confirmed.' };

  if (isDecoy(sender.role)) {
    n.picks[sender.id] = null; // no night power: the answer only matters when suspicions are on
    if (state.settings.suspicions && nightTargets(state, sender).includes(targetId)) (n.suspects ??= {})[sender.id] = targetId;
    return null;
  }

  if (sender.role === 'witch') {
    const m = /^(heal|poison):(.+)$/.exec(String(targetId));
    if (targetId === 'pass') { n.picks[sender.id] = 'pass'; return null; }
    if (!m) return { code: 'badTarget', message: 'Invalid target.' };
    const [, kind, id] = m;
    if (!sender.potions[kind]) return { code: 'noPotion', message: 'That potion is used up.' };
    if (kind === 'heal') {
      if (!n.victims) return { code: 'tooEarly', message: 'The wolves have not chosen yet.' };
      if (!n.victims.includes(id)) return { code: 'badTarget', message: 'Invalid target.' };
    } else if (!nightTargets(state, sender).includes(id)) {
      return { code: 'badTarget', message: 'Invalid target.' };
    }
    sender.potions[kind] = false;
    n.picks[sender.id] = targetId;
    return null;
  }

  if (isWolf(sender.role) && n.noKill) { // too sick to kill: the wolves just confirm
    n.picks[sender.id] = null;
    return null;
  }
  const targets = nightTargets(state, sender);
  if (!targets.includes(targetId)) return { code: 'badTarget', message: 'Invalid target.' };

  if (isWolf(sender.role)) {
    if (n.doubleKill && targets.length >= 2) {
      if (!targets.includes(targetId2) || targetId2 === targetId) return { code: 'badTarget', message: 'Pick two different targets.' };
      n.picks2[sender.id] = targetId2;
    }
    n.picks[sender.id] = targetId;
    if (livingWolves(state).every((w) => w.id in n.picks)) n.victims = computeVictims(state, rng);
    return null;
  }

  n.picks[sender.id] = targetId;
  if (sender.role === 'seer') {
    const t = byId(state, targetId);
    n.seerResult = { targetId, isWolf: isWolf(t.role) };
    state.seerLog.push({ round: state.round, by: sender.id, ...n.seerResult });
  }
  return null;
}

function resolveNight(state, rng, fx) {
  const n = state.night;
  state.lines = [];
  flushKickNotes(state);
  const victims = n.victims ?? computeVictims(state, rng);
  const bg = state.players.find((p) => p.alive && p.role === 'bodyguard');
  const protectedId = bg ? n.picks[bg.id] ?? null : null;
  state.bodyguardLast = protectedId; // skipping a night resets the restriction

  const healed = new Set();
  const poisoned = new Set();
  for (const w of state.players.filter((p) => p.role === 'witch' && p.id in n.picks)) {
    const m = /^(heal|poison):(.+)$/.exec(String(n.picks[w.id]));
    if (!m) continue;
    (m[1] === 'heal' ? healed : poisoned).add(m[2]);
  }

  const dying = new Set(victims.filter((id) => id !== protectedId && !healed.has(id)));
  // The lucky horseshoe blocks one wolf attack that would have killed its holder (not the Witch's poison).
  const hs = state.horseshoe;
  const shoed = hs && !hs.used && dying.has(hs.id) ? hs.id : null;
  if (shoed) { dying.delete(shoed); hs.used = true; hs.usedRound = state.round; }
  for (const id of poisoned) dying.add(id);

  // Keep seating order so the announcement order is stable.
  const dead = state.players.filter((p) => dying.has(p.id) && p.alive);
  recordNight(state, n, victims, protectedId, bg, healed, poisoned, dead, shoed);
  for (const p of dead) killPlayer(state, p);
  // Only a wolf night-kill of the Diseased makes the next night a sick one (not poison, vote or shot).
  if (dead.some((p) => p.role === 'diseased' && victims.includes(p.id))) {
    state.diseasedDied = true;
    hist(state, 'night', 'The Diseased Villager was killed by the wolves: the wolves cannot kill tomorrow night.');
  }
  if (dead.length === 0) say(state, 'Nobody died.');
  for (const p of dead) say(state, `${p.name} was killed in the night.${roleNote(state, p)}`);
  suspicionLine(state, n);
  afterDeaths(state, 'day', fx, rng);
}

// Opt-in. Announces the living player(s) most suspected by the players with no night power.
// Names only, never counts or who answered, and only when at least two answers agree: the line must not
// reveal how many players have a night power, or who they are.
function suspicionLine(state, n) {
  if (!state.settings.suspicions) return;
  const counts = new Map();
  for (const id of Object.values(n.suspects ?? {})) if (byId(state, id)?.alive) counts.set(id, (counts.get(id) ?? 0) + 1);
  const top = Math.max(0, ...counts.values());
  if (top < 2) return;
  say(state, `Most suspected: ${state.players.filter((p) => counts.get(p.id) === top).map((p) => p.name).join(' and ')}.`);
}

function recordNight(state, n, victims, protectedId, bg, healed, poisoned, dead, shoed) {
  const at = (id) => who(byId(state, id));
  for (const w of livingWolves(state)) {
    const targets = [n.picks[w.id], n.picks2[w.id]].filter((x) => x != null);
    if (n.noKill) hist(state, 'night', `${who(w)} could not kill tonight (the Diseased Villager died last night).`);
    else hist(state, 'night', targets.length ? `${who(w)} wanted to kill ${targets.map(at).join(' and ')}.` : `${who(w)} did not pick a victim.`);
  }
  if (n.noKill) hist(state, 'night', 'The wolves were too sick to kill.');
  else hist(state, 'night', victims.length ? `The wolves' victim${victims.length > 1 ? 's' : ''}: ${victims.map(at).join(' and ')}.` : 'The wolves attacked nobody.');
  if (bg) hist(state, 'night', protectedId ? `${who(bg)} protected ${at(protectedId)}.` : `${who(bg)} protected nobody.`);
  for (const w of state.players.filter((p) => p.role === 'witch')) {
    const pick = n.picks[w.id];
    const m = /^(heal|poison):(.+)$/.exec(String(pick));
    if (m) hist(state, 'night', `${who(w)} used the ${m[1]} potion on ${at(m[2])}.`);
    else if (w.alive) hist(state, 'night', `${who(w)} used no potion.`);
  }
  for (const sr of state.players.filter((p) => p.role === 'seer' && n.picks[p.id])) {
    const t = byId(state, n.picks[sr.id]);
    hist(state, 'night', `${who(sr)} checked ${who(t)}: ${isWolf(t.role) ? 'a werewolf' : 'not a werewolf'}.`);
  }
  for (const id of victims) {
    if (id === protectedId) hist(state, 'night', `${at(id)} was attacked but the Bodyguard's protection saved them.`);
    else if (healed.has(id)) hist(state, 'night', `${at(id)} was attacked but the Witch's heal potion saved them.`);
    else if (id === shoed) hist(state, 'night', `${at(id)} was attacked but the lucky horseshoe saved them.`);
  }
  if (!dead.length) hist(state, 'night', 'Nobody died.');
  for (const p of dead) {
    const wolfKill = victims.includes(p.id) && p.id !== protectedId && !healed.has(p.id) && p.id !== shoed;
    const poison = poisoned.has(p.id);
    const cause = wolfKill && poison ? 'killed by the wolves and poisoned by the Witch' : poison ? 'poisoned by the Witch' : 'killed by the wolves';
    hist(state, 'night', `${who(p)} died: ${cause}.`);
  }
}

// ---------- day ----------
function startVote(state, _a, _sender, isHost, fx) {
  if (!isHost) return { code: 'forbidden', message: 'Only the host can start the vote.' };
  if (state.phase !== PHASE.DAY) return { code: 'badPhase', message: 'Not in discussion.' };
  beginVote(state, fx);
  return null;
}

function beginVote(state, fx) {
  state.phase = PHASE.VOTE;
  // Dead Poltergeists whose haunt is due get one vote now; an unused haunt expires with this vote.
  const ghosts = state.winner ? [] : state.players.filter((p) => !p.alive && p.haunt).map((p) => p.id);
  for (const p of state.players) p.haunt = false;
  state.vote = { votes: {}, stage: 'voting', result: null, ghosts };
  state.lines = [];
  fx.push({ type: 'haptic' });
}

function vote(state, { targetId }, sender, fx) {
  if (state.phase !== PHASE.VOTE || state.vote.stage !== 'voting') {
    return { code: 'badPhase', message: 'Not voting.' };
  }
  const ghost = !!sender && !sender.alive && (state.vote.ghosts ?? []).includes(sender.id);
  if (!sender || (!sender.alive && !ghost)) return { code: 'dead', message: 'You cannot vote.' };
  if (sender.id in state.vote.votes) return { code: 'alreadyActed', message: 'Already voted.' };
  if (targetId === 'pass' && ghost) { // the ghost keeps hidden: no vote cast
    state.vote.votes[sender.id] = 'pass';
  } else if (targetId !== 'skip') {
    const t = byId(state, targetId);
    if (!t || !t.alive || t.id === sender.id) return { code: 'badTarget', message: 'Invalid target.' };
  }
  if (!(sender.id in state.vote.votes)) state.vote.votes[sender.id] = targetId;
  // Auto-resolve once every living voter AND every haunting ghost has voted or passed.
  const v = state.vote;
  if (living(state).every((p) => p.id in v.votes) && (v.ghosts ?? []).every((id) => id in v.votes)) resolveVote(state, fx);
  return null;
}

function resolveVote(state, fx) {
  const votes = {};
  const counts = new Map();
  for (const p of living(state)) {
    let t = state.vote.votes[p.id] ?? 'skip'; // no vote counts as Skip
    if (t !== 'skip' && !byId(state, t)?.alive) t = 'skip'; // the target was removed since
    votes[p.id] = t;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  // Haunt votes count like any other vote (public). A pass or no haunt adds nothing.
  const haunters = (state.vote.ghosts ?? []).map((id) => byId(state, id)).filter((g) => g && state.vote.votes[g.id] && state.vote.votes[g.id] !== 'pass');
  for (const g of haunters) {
    let t = state.vote.votes[g.id];
    if (t !== 'skip' && !byId(state, t)?.alive) t = 'skip';
    votes[g.id] = t;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const max = Math.max(...counts.values());
  const top = [...counts.keys()].filter((k) => counts.get(k) === max);
  let eliminatedId = null;
  if (top.length === 1 && top[0] !== 'skip') eliminatedId = top[0];

  state.lines = [];
  flushKickNotes(state);
  for (const p of [...living(state), ...haunters]) {
    const tv = votes[p.id];
    hist(state, 'day', `${who(p)}${p.alive ? '' : ' (haunting)'} voted ${tv === 'skip' ? 'to skip' : `for ${who(byId(state, tv))}`}${state.vote.votes[p.id] == null ? ' (no vote cast)' : ''}.`);
  }
  hist(state, 'day', `Tally: ${[...counts].map(([k, c]) => `${k === 'skip' ? 'Skip' : byId(state, k).name} ${c}`).join(', ')}.`);
  state.vote.stage = 'result';
  let princeId = null;
  if (!eliminatedId) {
    hist(state, 'day', top.length > 1 && top[0] !== 'skip' ? 'Tied vote: nobody was eliminated.' : 'Nobody was eliminated.');
    say(state, 'Nobody was eliminated.');
  } else {
    const p = byId(state, eliminatedId);
    if (p.role === 'prince' && !p.revealed) {
      // The Prince survives the first vote against them, but everyone now knows who they are.
      p.revealed = true; princeId = p.id; eliminatedId = null;
      hist(state, 'day', `${who(p)} survived the vote: the Prince is immune to the first vote against them.`);
      say(state, `${p.name} is the Prince! The village cannot eliminate them.`);
    } else {
      killPlayer(state, p);
      hist(state, 'day', `${who(p)} died: eliminated by vote (${counts.get(p.id)} votes).`);
      say(state, `${p.name} was eliminated by vote.${roleNote(state, p)}`);
      if (p.role === 'jester') {
        state.winner = TEAM.JESTER; // announced after the result screen
        if (!state.settings.revealOnDeath) say(state, `${p.name} was the Jester!`);
      }
    }
  }
  state.vote.result = { votes, counts: Object.fromEntries(counts), eliminatedId, princeId };
  fx.push({ type: 'narrate', text: state.lines.join(' ') });
  if (state.winner === TEAM.JESTER) { state.shots = []; return; } // the jester's win ends it, no shots
  afterDeaths(state, 'vote', fx);
}

// ---------- hunter ----------
function shoot(state, { targetId }, sender, fx, rng) {
  if (state.phase !== PHASE.SHOT) return { code: 'badPhase', message: 'Nobody is shooting.' };
  if (!sender || sender.id !== state.shots[0]) return { code: 'forbidden', message: 'It is not your shot.' };
  const target = byId(state, targetId);
  if (!target || !target.alive) return { code: 'badTarget', message: 'Invalid target.' };
  killPlayer(state, target);
  promoteApprentices(state);
  hist(state, state.afterShot === 'day' ? 'night' : 'day', `${who(target)} died: shot by the Hunter ${sender.name}.`);
  say(state, `${sender.name} shot ${target.name}.${roleNote(state, target)}`);
  nextShot(state, fx, rng);
  return null;
}

// Moves on after a shot was taken or skipped.
function nextShot(state, fx, rng) {
  state.shots.shift();
  if (!living(state).length) state.shots = []; // the last shot killed the last player
  if (state.shots.length) { announceShot(state, fx); return; }
  finishAfter(state, state.afterShot, fx, rng);
}

// The host's single "advance" control. Missing players simply count as no pick / Skip / no shot.
function nextPhase(state, _a, isHost, rng, fx) {
  if (!isHost) return { code: 'forbidden', message: 'Only the host can continue.' };
  switch (state.phase) {
    case PHASE.REVEAL: startNight(state, fx); return null;
    case PHASE.NIGHT: resolveNight(state, rng, fx); return null;
    case PHASE.SHOT: {
      const h = byId(state, state.shots[0]);
      hist(state, state.afterShot === 'day' ? 'night' : 'day', `${who(h)} chose not to shoot anyone.`);
      say(state, `${h.name} lowered the bow.`);
      nextShot(state, fx, rng);
      return null;
    }
    case PHASE.VOTE:
      if (state.vote.stage === 'voting') {
        // Hold the vote for a haunting Graveyard Voter who has not decided yet: they must not miss their
        // haunt on timing. This reveals to the host that a ghost exists (accepted). A ghost whose phone is
        // disconnected does not block, so a dead connection cannot stall the game.
        const pending = (state.vote.ghosts ?? []).some((id) => !(id in state.vote.votes) && byId(state, id)?.connected !== false);
        if (pending) return { code: 'waiting', message: 'Waiting for everyone to vote.' };
        resolveVote(state, fx);
      }
      else if (state.winner) endGame(state, state.winner, fx, null);
      else startNight(state, fx);
      return null;
    default: return { code: 'badPhase', message: 'Nothing to continue.' };
  }
}

// ---------- bot table talk ----------
// A host-run bot posts one line. Only living bots, only in the day and while the vote is open, only with
// smart bots on, and at most CHAT_PER_ROUND lines per bot per round. The line is public: every phone sees it.
function botSay(state, { key, v, ids }, sender) {
  if (!sender || !isBotId(sender.id)) return { code: 'forbidden', message: 'Only bots can talk here.' };
  if (state.settings.dumbBots) return { code: 'forbidden', message: 'Only bots can talk here.' };
  if (!sender.alive) return { code: 'dead', message: 'You cannot act.' };
  const open = state.phase === PHASE.DAY || (state.phase === PHASE.VOTE && state.vote?.stage === 'voting');
  if (!open) return { code: 'badPhase', message: 'Not in discussion.' };
  if (!validChatLine(key, v, ids) || !ids.every((id) => byId(state, id))) return { code: 'badLine', message: 'Invalid target.' };
  state.chat ??= [];
  if (state.chat.filter((c) => c.by === sender.id && c.round === state.round).length >= CHAT_PER_ROUND) return { code: 'tooChatty', message: 'Too many lines this round.' };
  state.chatSeq = (state.chatSeq ?? 0) + 1;
  state.chat.push({ seq: state.chatSeq, round: state.round, by: sender.id, key, v, ids: [...ids] });
  if (state.chat.length > CHAT_MAX) state.chat = state.chat.slice(-CHAT_MAX);
  return null;
}

// ---------- end ----------
function endGame(state, winner, fx, lastText) {
  state.winner = winner;
  state.phase = PHASE.GAMEOVER;
  const line = winner === TEAM.VILLAGE ? 'The village wins!'
    : winner === TEAM.JESTER ? 'The Jester wins!'
    : winner === 'ended' ? 'The host ended the game early.' : 'The wolves win!';
  state.log.push({ text: line });
  hist(state, 'end', line);
  // The win has its own sound and screen; only the deaths that ended the game are spoken.
  if (lastText) fx.push({ type: 'narrate', text: lastText });
  fx.push({ type: 'haptic' });
}

// The host can stop a game in progress. Nobody wins; everyone sees the roles and the history so far.
function endEarly(state, isHost, fx) {
  if (!isHost) return { code: 'forbidden', message: 'Only the host can end the game.' };
  if (state.phase === PHASE.LOBBY || state.phase === PHASE.GAMEOVER) return { code: 'badPhase', message: 'No game is running.' };
  endGame(state, 'ended', fx, null);
  return null;
}

function playAgain(state, isHost) {
  if (!isHost) return { code: 'forbidden', message: 'Only the host can restart.' };
  if (state.phase !== PHASE.GAMEOVER) return { code: 'badPhase', message: 'Game is not over.' };
  state.players.forEach((p) => { delete p.kicked; });
  state.kickNotes = [];
  state.phase = PHASE.LOBBY;
  state.round = 0;
  state.night = null;
  state.vote = null;
  state.winner = null;
  state.bodyguardLast = null;
  state.cubDied = false;
  state.diseasedDied = false;
  state.promotions = 0;
  state.shots = [];
  state.afterShot = null;
  state.lines = [];
  state.seerLog = [];
  state.log = [];
  state.history = [];
  state.event = null;
  state.horseshoe = null;
  state.chat = [];
  state.players.forEach((p) => { p.role = null; p.alive = true; p.ready = false; p.revealed = false; p.potions = null; p.promoted = false; p.haunt = false; });
  return null;
}

export { teamOf, MIN_PLAYERS };
