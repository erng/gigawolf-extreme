// viewFor(state, playerId, hostNow) -> the only thing a client ever receives.
// Never include another player's role/picks unless it is public.
import { ROLES, isWolf, teamOf } from './roles.js';
import { PHASE, nightTargets, effectiveCounts, lobbyValidation } from './engine.js';

function publicRole(state, p) {
  if (state.phase === PHASE.GAMEOVER) return p.role;
  if (!p.alive && state.settings.revealOnDeath) return p.role;
  return null;
}

function nightPrompt(state, me) {
  const role = ROLES[me.role];
  const done = me.id in state.night.picks;
  return {
    kind: 'night',
    text: role.nightPrompt,
    targets: nightTargets(state, me),
    required: me.role !== 'villager',
    done,
  };
}

export function viewFor(state, playerId, hostNow = 0) {
  const me = state.players.find((p) => p.id === playerId);
  if (!me) return null;
  const inGame = state.phase !== PHASE.LOBBY;

  const view = {
    phase: state.phase,
    round: state.round,
    deadline: state.deadline, // night resolveAt is deliberately never exposed
    hostNow,
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
      ...(state.phase === PHASE.REVEAL ? { ready: p.ready } : {}),
    })),
    prompt: null,
    log: state.log.map((l) => ({ text: l.text })),
  };

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
          ? { pick: state.night.picks[p.id] ?? null }
          : {}),
      }));
  }

  if (me.role === 'seer') priv.seerLog = state.seerLog.map((r) => ({ ...r }));

  if (state.phase === PHASE.NIGHT) {
    priv.submitted = me.id in state.night.picks;
    priv.pick = state.night.picks[me.id] ?? null;
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

  if (state.phase === PHASE.GAMEOVER) {
    view.winner = state.winner;
    view.roles = state.players.map((p) => ({ id: p.id, role: p.role }));
  }

  return view;
}
