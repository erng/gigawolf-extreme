// Pure game state machine. No DOM, no network, no Date.now().
// reduce(state, action, rng) -> { state, effects, error? }
//
// Actions: { kind, by, now, ...payload, nonce? }
//   join{name} setConnected{connected} leave settings{patch} startGame ready
//   nightPick{targetId} startVote vote{targetId|'skip'} playAgain tick
//
// Effects: { type:'views' }            host should resend every player's view
//          { type:'timer', at }        wake the engine with a tick at this time
//          { type:'narrate', text }    host phone speaks this line
//          { type:'haptic' }           phase change buzz
import { ROLES, isWolf, teamOf, TEAM } from './roles.js';
import { MAX_PLAYERS, MIN_PLAYERS, presetFor, validate, roleList } from './setup.js';
import { randInt, shuffle } from '../util/rng.js';

export const PHASE = Object.freeze({
  LOBBY: 'lobby', REVEAL: 'reveal', NIGHT: 'night', DAY: 'day', VOTE: 'vote', GAMEOVER: 'gameover',
});

export const REVEAL_MS = 60_000;
export const VOTE_RESULT_MS = 8_000;
export const NIGHT_DELAY_MS = [2000, 5000];
const MAX_NAME = 20;
const NONCE_MEMORY = 50;

export const DEFAULT_SETTINGS = Object.freeze({
  counts: null, // null = auto preset for current player count
  revealOnDeath: true,
  bodyguardSelfProtect: false,
  narration: true,
  nightSecs: 45,
  discussionSecs: 180,
  voteSecs: 60,
});

export function createState({ hostId, roomCode }) {
  return {
    hostId, roomCode,
    phase: PHASE.LOBBY,
    settings: { ...DEFAULT_SETTINGS },
    players: [],            // { id, name, connected, role, alive, ready }
    round: 0,
    deadline: null,
    night: null,            // { picks, resolveAt, seerResult }
    bodyguardLast: null,    // who the bodyguard protected last night
    seerLog: [],            // { round, targetId, isWolf }
    vote: null,             // { votes, stage:'voting'|'result', result }
    winner: null,           // 'village' | 'wolves'
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
  return state.settings.counts ?? presetFor(state.players.length);
}

export function lobbyValidation(state) {
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

// When should the host next call tick? null = never.
export function nextWake(state) {
  switch (state.phase) {
    case PHASE.REVEAL:
    case PHASE.DAY:
    case PHASE.VOTE:
      return state.deadline;
    case PHASE.NIGHT:
      return state.night?.resolveAt != null
        ? Math.min(state.deadline, state.night.resolveAt)
        : state.deadline;
    default:
      return null;
  }
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
    case 'playAgain': err = playAgain(state, isHost); break;
    case 'tick': tick(state, action.now, rng, fx); break;
    default: err = { code: 'badAction', message: `Unknown action ${action.kind}` };
  }
  if (err) return { state: prev, effects: [], error: err };

  if (action.nonce != null && action.by != null) {
    const seen = state.nonces[action.by] ?? [];
    state.nonces[action.by] = [...seen, action.nonce].slice(-NONCE_MEMORY);
  }

  fx.push({ type: 'views' });
  const wake = nextWake(state);
  if (wake != null) fx.push({ type: 'timer', at: wake });
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
  state.players.push({ id: by, name: clean, connected: true, role: null, alive: true, ready: false });
  return null;
}

function leave(state, { by }) {
  if (state.phase !== PHASE.LOBBY) return { code: 'gameStarted', message: 'Game already started.' };
  if (by === state.hostId) return { code: 'forbidden', message: 'Host cannot leave.' };
  state.players = state.players.filter((p) => p.id !== by);
  return null;
}

const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(v))));

function settings(state, { patch }, isHost) {
  if (!isHost) return { code: 'forbidden', message: 'Only the host can change settings.' };
  if (state.phase !== PHASE.LOBBY) return { code: 'badPhase', message: 'Settings are locked.' };
  const s = state.settings;
  for (const [k, v] of Object.entries(patch ?? {})) {
    switch (k) {
      case 'revealOnDeath': case 'bodyguardSelfProtect': case 'narration': s[k] = !!v; break;
      case 'nightSecs': s[k] = clampInt(v, 10, 300); break;
      case 'voteSecs': s[k] = clampInt(v, 10, 300); break;
      case 'discussionSecs': s[k] = clampInt(v, 10, 1800); break;
      case 'counts':
        if (v === null) s.counts = null;
        else s.counts = {
          wolves: Number(v.wolves), seer: Number(v.seer),
          bodyguard: Number(v.bodyguard), villagers: Number(v.villagers),
        };
        break;
      default: return { code: 'badSetting', message: `Unknown setting ${k}.` };
    }
  }
  return null;
}

function startGame(state, { now }, isHost, rng, fx) {
  if (!isHost) return { code: 'forbidden', message: 'Only the host can start.' };
  if (state.phase !== PHASE.LOBBY) return { code: 'badPhase', message: 'Already started.' };
  const v = lobbyValidation(state);
  if (!v.ok) return { code: 'badSetup', message: v.errors.join(' ') };
  const roles = shuffle(rng, roleList(effectiveCounts(state)));
  state.players.forEach((p, i) => {
    p.role = roles[i]; p.alive = true; p.ready = false;
  });
  state.phase = PHASE.REVEAL;
  state.deadline = now + REVEAL_MS;
  state.round = 0;
  state.log = [];
  state.seerLog = [];
  state.bodyguardLast = null;
  state.winner = null;
  state.night = null;
  state.vote = null;
  fx.push({ type: 'haptic' });
  return null;
}

function ready(state, _a, sender, fx) {
  if (state.phase !== PHASE.REVEAL) return { code: 'badPhase', message: 'Not in role reveal.' };
  if (!sender) return { code: 'unknownPlayer', message: 'Unknown player.' };
  sender.ready = true;
  if (state.players.every((p) => p.ready)) startNight(state, _a.now, fx);
  return null;
}

// ---------- night ----------
function startNight(state, now, fx) {
  state.round += 1;
  state.phase = PHASE.NIGHT;
  state.deadline = now + state.settings.nightSecs * 1000;
  state.night = { picks: {}, resolveAt: null, seerResult: null };
  state.vote = null;
  fx.push({ type: 'narrate', text: 'Night falls. Everyone, check your phone.' });
  fx.push({ type: 'haptic' });
}

// Valid targets for a player's night action.
export function nightTargets(state, player) {
  const alive = living(state);
  switch (player.role) {
    case 'werewolf': return alive.filter((p) => !isWolf(p.role)).map((p) => p.id);
    case 'seer': return alive.filter((p) => p.id !== player.id).map((p) => p.id);
    case 'bodyguard':
      return alive
        .filter((p) => p.id !== state.bodyguardLast)
        .filter((p) => state.settings.bodyguardSelfProtect || p.id !== player.id)
        .map((p) => p.id);
    default: return alive.filter((p) => p.id !== player.id).map((p) => p.id);
  }
}

function nightPick(state, { targetId, now }, sender, rng, fx) {
  if (state.phase !== PHASE.NIGHT) return { code: 'badPhase', message: 'It is not night.' };
  if (!sender || !sender.alive) return { code: 'dead', message: 'You cannot act.' };
  const n = state.night;
  if (sender.id in n.picks) return { code: 'alreadyActed', message: 'Already confirmed.' };
  if (n.resolveAt != null && now >= n.resolveAt) return { code: 'tooLate', message: 'Night is over.' };

  if (sender.role === 'villager') {
    n.picks[sender.id] = null; // answer ignored
  } else {
    if (!nightTargets(state, sender).includes(targetId)) {
      return { code: 'badTarget', message: 'Invalid target.' };
    }
    n.picks[sender.id] = targetId;
    if (sender.role === 'seer') {
      const t = byId(state, targetId);
      n.seerResult = { targetId, isWolf: isWolf(t.role) };
      state.seerLog.push({ round: state.round, ...n.seerResult });
    }
  }
  if (living(state).every((p) => p.id in n.picks) && n.resolveAt == null) {
    n.resolveAt = now + randInt(rng, ...NIGHT_DELAY_MS);
  }
  return null;
}

function resolveNight(state, now, rng, fx) {
  const n = state.night;
  // Wolf target: most votes, random among ties.
  const counts = new Map();
  for (const w of livingWolves(state)) {
    const t = n.picks[w.id];
    if (t != null) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  let target = null;
  if (counts.size) {
    const max = Math.max(...counts.values());
    const top = state.players.map((p) => p.id).filter((id) => counts.get(id) === max);
    target = top.length === 1 ? top[0] : top[Math.floor(rng() * top.length)];
  }
  const bg = state.players.find((p) => p.alive && p.role === 'bodyguard');
  const protectedId = bg ? n.picks[bg.id] ?? null : null;
  state.bodyguardLast = protectedId; // skipping a night resets the restriction

  let killed = null;
  if (target && target !== protectedId) {
    killed = byId(state, target);
    killed.alive = false;
  }
  startDay(state, killed, now, fx);
}

// ---------- day ----------
function roleNote(state, p) {
  return state.settings.revealOnDeath ? ` They were a ${ROLES[p.role].name}.` : '';
}

function startDay(state, killed, now, fx) {
  const text = killed
    ? `${killed.name} was killed in the night.${roleNote(state, killed)}`
    : 'Nobody died.';
  state.log.push({ text });
  state.night = null;
  const winner = checkWinner(state);
  if (winner) return endGame(state, winner, fx, text);
  state.phase = PHASE.DAY;
  state.deadline = now + state.settings.discussionSecs * 1000;
  fx.push({ type: 'narrate', text: `Day breaks. ${text}` });
  fx.push({ type: 'haptic' });
}

function startVote(state, { now }, sender, isHost, fx) {
  if (!isHost) return { code: 'forbidden', message: 'Only the host can start the vote.' };
  if (state.phase !== PHASE.DAY) return { code: 'badPhase', message: 'Not in discussion.' };
  if (!sender?.alive) return { code: 'dead', message: 'You cannot act.' };
  beginVote(state, now, fx);
  return null;
}

function beginVote(state, now, fx) {
  state.phase = PHASE.VOTE;
  state.deadline = now + state.settings.voteSecs * 1000;
  state.vote = { votes: {}, stage: 'voting', result: null };
  fx.push({ type: 'narrate', text: 'Time to vote.' });
  fx.push({ type: 'haptic' });
}

function vote(state, { targetId, now }, sender, fx) {
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
  if (living(state).every((p) => p.id in state.vote.votes)) resolveVote(state, now, fx);
  return null;
}

function resolveVote(state, now, fx) {
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

  let text = 'Nobody was eliminated.';
  if (eliminatedId) {
    const p = byId(state, eliminatedId);
    p.alive = false;
    text = `${p.name} was eliminated by vote.${roleNote(state, p)}`;
  }
  state.log.push({ text });
  state.vote.stage = 'result';
  state.vote.result = { votes, counts: Object.fromEntries(counts), eliminatedId };
  state.deadline = now + VOTE_RESULT_MS;
  state.winner = checkWinner(state); // announced after the result screen
  fx.push({ type: 'narrate', text });
}

// ---------- end ----------
function endGame(state, winner, fx, lastText) {
  state.winner = winner;
  state.phase = PHASE.GAMEOVER;
  state.deadline = null;
  const line = winner === TEAM.VILLAGE ? 'The village wins!' : 'The wolves win!';
  state.log.push({ text: line });
  fx.push({ type: 'narrate', text: `${lastText ? lastText + ' ' : ''}${line}` });
  fx.push({ type: 'haptic' });
}

function playAgain(state, isHost) {
  if (!isHost) return { code: 'forbidden', message: 'Only the host can restart.' };
  if (state.phase !== PHASE.GAMEOVER) return { code: 'badPhase', message: 'Game is not over.' };
  state.phase = PHASE.LOBBY;
  state.round = 0;
  state.deadline = null;
  state.night = null;
  state.vote = null;
  state.winner = null;
  state.bodyguardLast = null;
  state.seerLog = [];
  state.log = [];
  state.players.forEach((p) => { p.role = null; p.alive = true; p.ready = false; });
  return null;
}

// ---------- time ----------
function tick(state, now, rng, fx) {
  switch (state.phase) {
    case PHASE.REVEAL:
      if (now >= state.deadline) startNight(state, now, fx);
      break;
    case PHASE.NIGHT: {
      const n = state.night;
      if (now >= state.deadline || (n.resolveAt != null && now >= n.resolveAt)) {
        resolveNight(state, now, rng, fx);
      }
      break;
    }
    case PHASE.DAY:
      if (now >= state.deadline) beginVote(state, now, fx);
      break;
    case PHASE.VOTE:
      if (state.vote.stage === 'voting') {
        if (now >= state.deadline) resolveVote(state, now, fx);
      } else if (now >= state.deadline) {
        if (state.winner) endGame(state, state.winner, fx, null);
        else startNight(state, now, fx);
      }
      break;
  }
}

export { teamOf, MIN_PLAYERS };
