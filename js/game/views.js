// viewFor(state, playerId) -> the only thing a client ever receives.
// Never include another player's role/picks unless it is public.
import { ROLES, isWolf, isDecoy, teamOf } from './roles.js';
import { PHASE, nightTargets, effectiveCounts, lobbyValidation, wolfVictims } from './engine.js';

function publicRole(state, p) {
  if (state.phase === PHASE.GAMEOVER) return p.role;
  if (!p.alive && state.settings.revealOnDeath) return p.role;
  if (p.revealed) return p.role; // a Prince who survived a vote
  return null;
}

function nightPrompt(state, me) {
  const role = ROLES[me.role];
  const done = me.id in state.night.picks;
  const targets = nightTargets(state, me);
  if (me.role === 'witch') {
    const victims = wolfVictims(state);
    return {
      kind: 'witch',
      text: role.nightPrompt,
      targets, // poison targets
      healTargets: me.potions.heal ? victims : [], // null = the wolves have not chosen yet
      canHeal: me.potions.heal, canPoison: me.potions.poison,
      required: false,
      done,
    };
  }
  const picks = isWolf(me.role) && state.night.doubleKill && targets.length >= 2 ? 2 : 1;
  return {
    kind: 'night',
    text: picks === 2 ? 'Revenge night! Pick two victims.' : role.nightPrompt,
    targets,
    picks,
    required: !isDecoy(me.role),
    done,
  };
}

export function viewFor(state, playerId) {
  const me = state.players.find((p) => p.id === playerId);
  if (!me) return null;
  const inGame = state.phase !== PHASE.LOBBY;

  const view = {
    phase: state.phase,
    round: state.round,
    roomCode: state.roomCode,
    isHost: me.id === state.hostId,
    hostId: state.hostId,
    settings: { ...state.settings, counts: effectiveCounts(state) },
    you: {
      id: me.id,
      name: me.name,
      alive: me.alive,
      role: inGame ? me.role : null,
      team: inGame ? teamOf(me.role) : null,
      private: {},
    },
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      alive: p.alive,
      connected: p.connected,
      role: inGame ? (p.id === me.id ? p.role : publicRole(state, p)) : null,
      ...(inGame && p.revealed ? { revealed: true } : {}),
      ...(state.phase === PHASE.REVEAL ? { ready: p.ready } : {}),
    })),
    prompt: null,
    announce: state.lines.map((x) => x),
    log: state.log.map((l) => ({ text: l.text })),
  };

  // Host-only aggregate progress (never says who), so the host knows when to advance.
  if (view.isHost) {
    const alive = state.players.filter((p) => p.alive);
    if (state.phase === PHASE.REVEAL) view.progress = { done: state.players.filter((p) => p.ready).length, total: state.players.length };
    if (state.phase === PHASE.NIGHT) view.progress = { done: alive.filter((p) => p.id in state.night.picks).length, total: alive.length };
    if (state.phase === PHASE.VOTE && state.vote.stage === 'voting') view.progress = { done: alive.filter((p) => p.id in state.vote.votes).length, total: alive.length };
  }

  if (state.phase === PHASE.LOBBY) {
    const v = lobbyValidation(state);
    view.setup = { ok: v.ok, errors: v.errors };
    return view;
  }

  const priv = view.you.private;

  // Wolves know each other, from the reveal onwards.
  if (isWolf(me.role)) {
    priv.teammates = state.players
      .filter((p) => isWolf(p.role) && p.id !== me.id)
      .map((p) => ({
        id: p.id,
        name: p.name,
        // Teammates' confirmed kill picks, only during night.
        ...(state.phase === PHASE.NIGHT && p.alive
          ? { pick: state.night.picks[p.id] ?? null, ...(state.night.picks2[p.id] ? { pick2: state.night.picks2[p.id] } : {}) }
          : {}),
      }));
  }

  if (me.potions) priv.potions = { ...me.potions };
  if (me.role === 'seer') priv.seerLog = state.seerLog.map((r) => ({ ...r }));

  if (state.phase === PHASE.NIGHT) {
    priv.submitted = me.id in state.night.picks;
    priv.pick = state.night.picks[me.id] ?? null;
    priv.pick2 = state.night.picks2[me.id] ?? null;
    if (me.role === 'seer' && state.night.seerResult) {
      priv.seerResult = { ...state.night.seerResult };
    }
    if (me.alive) view.prompt = nightPrompt(state, me);
  }

  if (state.phase === PHASE.VOTE) {
    const v = state.vote;
    priv.vote = v.votes[me.id] ?? null; // own vote only
    if (v.stage === 'voting') {
      if (me.alive) {
        view.prompt = {
          kind: 'vote',
          text: 'Who do you want to eliminate?',
          targets: state.players.filter((p) => p.alive && p.id !== me.id).map((p) => p.id),
          skippable: true,
          done: me.id in v.votes,
        };
      }
    } else {
      view.voteResult = { ...v.result, votes: { ...v.result.votes }, counts: { ...v.result.counts } };
    }
  }

  if (state.phase === PHASE.SHOT) {
    const hunter = state.players.find((p) => p.id === state.shots[0]);
    view.shooter = hunter ? { id: hunter.id, name: hunter.name } : null;
    if (hunter && hunter.id === me.id) {
      view.prompt = {
        kind: 'shoot',
        text: 'Take your last shot!',
        targets: state.players.filter((p) => p.alive).map((p) => p.id),
        done: false,
      };
    }
  }

  if (state.phase === PHASE.GAMEOVER) {
    view.winner = state.winner;
    view.roles = state.players.map((p) => ({ id: p.id, role: p.role }));
  }

  return view;
}
