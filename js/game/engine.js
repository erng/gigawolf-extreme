// Pure game state machine. No DOM, no network, no clock, no timers: the host advances the game.
// reduce(state, action, rng) -> { state, effects, error? }
//
// Actions: { kind, by, ...payload, nonce? }
//   join{name} setConnected{connected} leave settings{patch} startGame ready
//   nightPick{targetId, targetId2?} startVote vote{targetId|'skip'} shoot{targetId} nextPhase playAgain
//   Witch nightPick targetId is 'heal:<id>' | 'poison:<id>' | 'pass'.
//
// Effects: { type:'views' }            host should resend every player's view
//          { type:'narrate', text }    host phone speaks this line
//          { type:'haptic' }           phase change buzz
import { ROLES, isWolf, isDecoy, teamOf, TEAM } from './roles.js';
import { MAX_PLAYERS, MIN_PLAYERS, COUNT_KEYS, presetFor, validate, roleList, fullCounts, randomCounts } from './setup.js';
import { shuffle } from '../util/rng.js';

export const PHASE = Object.freeze({
  LOBBY: 'lobby', REVEAL: 'reveal', NIGHT: 'night', DAY: 'day', VOTE: 'vote', SHOT: 'shot', GAMEOVER: 'gameover',
});

const MAX_NAME = 20;
const NONCE_MEMORY = 50;

export const DEFAULT_SETTINGS = Object.freeze({
  counts: null, // null = auto preset for current player count
  randomize: false, // secret random mix, rolled at start; nobody (host included) sees the counts
  revealOnDeath: false,
  bodyguardSelfProtect: true,
  narration: true,
});

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
    shots: [],              // dead hunters who still owe a shot
    afterShot: null,        // 'day' | 'vote': where the game goes once the shots are done
    lines: [],              // announcements for the current dawn / vote result
    winner: null,           // 'village' | 'wolves' | 'jester'
    log: [],                // { text }
    nonces: {},             // playerId -> recent applied nonces
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
    case 'settings': err = settings(state, action, isHost); break;
    case 'startGame': err = startGame(state, action, isHost, rng, fx); break;
    case 'ready': err = ready(state, action, sender, fx); break;
    case 'nightPick': err = nightPick(state, action, sender, rng, fx); break;
    case 'startVote': err = startVote(state, action, sender, isHost, fx); break;
    case 'vote': err = vote(state, action, sender, fx); break;
    case 'shoot': err = shoot(state, action, sender, fx); break;
    case 'nextPhase': err = nextPhase(state, action, isHost, rng, fx); break;
    case 'playAgain': err = playAgain(state, isHost); break;
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
  if (state.players.length >= MAX_PLAYERS) return { code: 'roomFull', message: 'Room is full.' };
  state.players.push({ id: by, name: clean, connected: true, role: null, alive: true, ready: false, revealed: false, potions: null });
  return null;
}

function leave(state, { by }) {
  if (state.phase !== PHASE.LOBBY) return { code: 'gameStarted', message: 'Game already started.' };
  if (by === state.hostId) return { code: 'forbidden', message: 'Host cannot leave.' };
  state.players = state.players.filter((p) => p.id !== by);
  return null;
}


function settings(state, { patch }, isHost) {
  if (!isHost) return { code: 'forbidden', message: 'Only the host can change settings.' };
  if (state.phase !== PHASE.LOBBY) return { code: 'badPhase', message: 'Settings are locked.' };
  const s = state.settings;
  for (const [k, v] of Object.entries(patch ?? {})) {
    switch (k) {
      case 'revealOnDeath': case 'bodyguardSelfProtect': case 'narration': case 'randomize': s[k] = !!v; break;
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

function startGame(state, _a, isHost, rng, fx) {
  if (!isHost) return { code: 'forbidden', message: 'Only the host can start.' };
  if (state.phase !== PHASE.LOBBY) return { code: 'badPhase', message: 'Already started.' };
  const v = lobbyValidation(state);
  if (!v.ok) return { code: 'badSetup', message: v.errors.join(' ') };
  const roles = shuffle(rng, roleList(state.settings.randomize ? randomCounts(state.players.length, rng) : effectiveCounts(state)));
  state.players.forEach((p, i) => {
    p.role = roles[i]; p.alive = true; p.ready = false; p.revealed = false;
    p.potions = p.role === 'witch' ? { heal: true, poison: true } : null;
  });
  state.phase = PHASE.REVEAL;
  state.round = 0;
  state.log = [];
  state.lines = [];
  state.seerLog = [];
  state.bodyguardLast = null;
  state.cubDied = false;
  state.shots = [];
  state.afterShot = null;
  state.winner = null;
  state.night = null;
  state.vote = null;
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
}

function roleNote(state, p) {
  return state.settings.revealOnDeath ? ` They were a ${ROLES[p.role].name}.` : '';
}

// Record an announcement in the permanent log and in the current dawn / vote-result lines.
function say(state, text) {
  state.log.push({ text });
  state.lines.push(text);
}

// After a batch of deaths: hunters shoot first, then the game carries on at `after`.
function afterDeaths(state, after, fx) {
  if (!living(state).length) state.shots = []; // everyone is dead: nobody left to shoot
  if (state.shots.length) {
    state.phase = PHASE.SHOT;
    state.afterShot = after;
    state.night = null;
    announceShot(state, fx);
    return;
  }
  finishAfter(state, after, fx);
}

function announceShot(state, fx) {
  const h = byId(state, state.shots[0]);
  // With role reveal off the narration must not name the role (the shot itself is unavoidably visible).
  fx.push({ type: 'narrate', text: state.settings.revealOnDeath ? `${h.name} was the Hunter! One last shot…` : `${h.name} gets one last shot…` });
  fx.push({ type: 'haptic' });
}

function finishAfter(state, after, fx) {
  state.afterShot = null;
  if (after === 'day') {
    state.night = null;
    const winner = checkWinner(state);
    const text = state.lines.join(' ');
    if (winner) return endGame(state, winner, fx, text);
    state.phase = PHASE.DAY;
    fx.push({ type: 'narrate', text: `Day breaks. ${text}` });
    fx.push({ type: 'haptic' });
    return null;
  }
  // after a vote: back to the result screen; the winner is announced after it
  state.phase = PHASE.VOTE;
  if (state.winner !== TEAM.JESTER) state.winner = checkWinner(state);
  return null;
}

// ---------- night ----------
function startNight(state, fx) {
  state.round += 1;
  state.phase = PHASE.NIGHT;
  state.night = { picks: {}, picks2: {}, seerResult: null, doubleKill: state.cubDied, victims: null };
  state.cubDied = false;
  state.vote = null;
  state.lines = [];
  fx.push({ type: 'narrate', text: 'Night falls. Everyone, check your phone.' });
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
    n.picks[sender.id] = null; // answer ignored
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
    state.seerLog.push({ round: state.round, ...n.seerResult });
  }
  return null;
}

function resolveNight(state, rng, fx) {
  const n = state.night;
  state.lines = [];
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
  for (const id of poisoned) dying.add(id);

  // Keep seating order so the announcement order is stable.
  const dead = state.players.filter((p) => dying.has(p.id) && p.alive);
  for (const p of dead) killPlayer(state, p);
  if (dead.length === 0) say(state, 'Nobody died.');
  for (const p of dead) say(state, `${p.name} was killed in the night.${roleNote(state, p)}`);
  afterDeaths(state, 'day', fx);
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
  state.vote = { votes: {}, stage: 'voting', result: null };
  state.lines = [];
  fx.push({ type: 'narrate', text: 'Time to vote.' });
  fx.push({ type: 'haptic' });
}

function vote(state, { targetId }, sender, fx) {
  if (state.phase !== PHASE.VOTE || state.vote.stage !== 'voting') {
    return { code: 'badPhase', message: 'Not voting.' };
  }
  if (!sender || !sender.alive) return { code: 'dead', message: 'You cannot vote.' };
  if (sender.id in state.vote.votes) return { code: 'alreadyActed', message: 'Already voted.' };
  if (targetId !== 'skip') {
    const t = byId(state, targetId);
    if (!t || !t.alive || t.id === sender.id) return { code: 'badTarget', message: 'Invalid target.' };
  }
  state.vote.votes[sender.id] = targetId;
  if (living(state).every((p) => p.id in state.vote.votes)) resolveVote(state, fx);
  return null;
}

function resolveVote(state, fx) {
  const votes = {};
  const counts = new Map();
  for (const p of living(state)) {
    const t = state.vote.votes[p.id] ?? 'skip'; // no vote counts as Skip
    votes[p.id] = t;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const max = Math.max(...counts.values());
  const top = [...counts.keys()].filter((k) => counts.get(k) === max);
  let eliminatedId = null;
  if (top.length === 1 && top[0] !== 'skip') eliminatedId = top[0];

  state.lines = [];
  state.vote.stage = 'result';
  let princeId = null;
  if (!eliminatedId) {
    say(state, 'Nobody was eliminated.');
  } else {
    const p = byId(state, eliminatedId);
    if (p.role === 'prince' && !p.revealed) {
      // The Prince survives the first vote against them, but everyone now knows who they are.
      p.revealed = true; princeId = p.id; eliminatedId = null;
      say(state, `${p.name} is the Prince! The village cannot eliminate them.`);
    } else {
      killPlayer(state, p);
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
function shoot(state, { targetId }, sender, fx) {
  if (state.phase !== PHASE.SHOT) return { code: 'badPhase', message: 'Nobody is shooting.' };
  if (!sender || sender.id !== state.shots[0]) return { code: 'forbidden', message: 'It is not your shot.' };
  const target = byId(state, targetId);
  if (!target || !target.alive) return { code: 'badTarget', message: 'Invalid target.' };
  killPlayer(state, target);
  say(state, `${sender.name} shot ${target.name}.${roleNote(state, target)}`);
  nextShot(state, fx);
  return null;
}

// Moves on after a shot was taken or skipped.
function nextShot(state, fx) {
  state.shots.shift();
  if (!living(state).length) state.shots = []; // the last shot killed the last player
  if (state.shots.length) { announceShot(state, fx); return; }
  finishAfter(state, state.afterShot, fx);
}

// The host's single "advance" control. Missing players simply count as no pick / Skip / no shot.
function nextPhase(state, _a, isHost, rng, fx) {
  if (!isHost) return { code: 'forbidden', message: 'Only the host can continue.' };
  switch (state.phase) {
    case PHASE.REVEAL: startNight(state, fx); return null;
    case PHASE.NIGHT: resolveNight(state, rng, fx); return null;
    case PHASE.SHOT: {
      const h = byId(state, state.shots[0]);
      say(state, `${h.name} lowered the gun.`);
      nextShot(state, fx);
      return null;
    }
    case PHASE.VOTE:
      if (state.vote.stage === 'voting') resolveVote(state, fx);
      else if (state.winner) endGame(state, state.winner, fx, null);
      else startNight(state, fx);
      return null;
    default: return { code: 'badPhase', message: 'Nothing to continue.' };
  }
}

// ---------- end ----------
function endGame(state, winner, fx, lastText) {
  state.winner = winner;
  state.phase = PHASE.GAMEOVER;
  const line = winner === TEAM.VILLAGE ? 'The village wins!'
    : winner === TEAM.JESTER ? 'The Jester wins!' : 'The wolves win!';
  state.log.push({ text: line });
  fx.push({ type: 'narrate', text: `${lastText ? lastText + ' ' : ''}${line}` });
  fx.push({ type: 'haptic' });
}

function playAgain(state, isHost) {
  if (!isHost) return { code: 'forbidden', message: 'Only the host can restart.' };
  if (state.phase !== PHASE.GAMEOVER) return { code: 'badPhase', message: 'Game is not over.' };
  state.phase = PHASE.LOBBY;
  state.round = 0;
  state.night = null;
  state.vote = null;
  state.winner = null;
  state.bodyguardLast = null;
  state.cubDied = false;
  state.shots = [];
  state.afterShot = null;
  state.lines = [];
  state.seerLog = [];
  state.log = [];
  state.players.forEach((p) => { p.role = null; p.alive = true; p.ready = false; p.revealed = false; p.potions = null; });
  return null;
}

export { teamOf, MIN_PLAYERS };
