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
  if (isWolf(me.role) && state.night.noKill) {
    return { kind: 'night', text: "You can't kill anyone tonight: the Diseased Villager's sickness weakens the wolves.", targets: [], picks: 1, required: false, noKill: true, blockedId: null, done };
  }
  const picks = isWolf(me.role) && state.night.doubleKill && targets.length >= 2 ? 2 : 1;
  return {
    kind: 'night',
    text: picks === 2 ? 'Revenge night! Pick two victims.' : role.nightPrompt,
    targets,
    picks,
    required: !isDecoy(me.role),
    blockedId: me.role === 'bodyguard' ? state.bodyguardLast : null, // protected last night: cannot be picked again
    done,
  };
}

export function viewFor(state, playerId) {
  const me = state.players.find((p) => p.id === playerId);
  if (!me) return null;
  const inGame = state.phase !== PHASE.LOBBY;
  const settings = { ...state.settings, counts: effectiveCounts(state) };
  // The bot type is the host's secret: only the host's view carries `dumbBots`, so no phone can read it.
  if (me.id !== state.hostId) delete settings.dumbBots;

  const view = {
    phase: state.phase,
    round: state.round,
    roomCode: state.roomCode,
    isHost: me.id === state.hostId,
    hostId: state.hostId,
    settings,
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
      ...(p.kicked ? { kicked: true } : {}),
      role: inGame ? (p.id === me.id ? p.role : publicRole(state, p)) : null,
      ...(inGame && p.revealed ? { revealed: true } : {}),
      ...(state.phase === PHASE.REVEAL ? { ready: p.ready } : {}),
    })),
    prompt: null,
    announce: state.lines.map((x) => x),
    log: state.log.map((l) => ({ text: l.text })),
    chat: (state.chat ?? []).map((c) => ({ ...c, ids: [...c.ids] })), // bot table talk: public
  };

  // Host-only aggregate progress (never says who), so the host knows when to advance.
  if (view.isHost) {
    const alive = state.players.filter((p) => p.alive);
    if (state.phase === PHASE.REVEAL) view.progress = { done: state.players.filter((p) => p.ready && !p.kicked).length, total: state.players.filter((p) => !p.kicked).length };
    if (state.phase === PHASE.NIGHT) view.progress = { done: alive.filter((p) => p.id in state.night.picks).length, total: alive.length };
    if (state.phase === PHASE.VOTE && state.vote.stage === 'voting') {
      // A haunting ghost is counted too: the vote is held for them, so the host must see why it is not done.
      const ghosts = (state.vote.ghosts ?? []).map((id) => state.players.find((p) => p.id === id)).filter(Boolean);
      const voters = [...alive, ...ghosts];
      view.progress = { done: voters.filter((p) => p.id in state.vote.votes).length, total: voters.length };
      // Votes are public knowledge anyway, so the host also gets the stragglers' names to hound. Not done at night: it would reveal who has a night action.
      view.progress.waiting = voters.filter((p) => !(p.id in state.vote.votes)).map((p) => p.name);
    }
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
  if (me.role === 'seer') {
    // Own checks only: a promoted Apprentice starts with an empty log.
    priv.seerLog = state.seerLog.filter((r) => r.by === me.id || (r.by === undefined && !me.promoted)).map(({ by: _by, ...r }) => r);
    if (me.promoted) priv.promoted = true; // told privately that the Seer died and they took over
  }

  // Lucky horseshoe: only its holder learns they have it, and only if it can work (never told on a wolf).
  // `fresh` marks the day it was found or used, so the phone shows the news on that day only.
  const hs = state.horseshoe;
  if (hs && hs.id === me.id && !isWolf(me.role)) {
    priv.horseshoe = { used: hs.used, fresh: state.phase === PHASE.DAY && (hs.used ? hs.usedRound === state.round : hs.round === state.round) };
  }

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
      const haunting = !me.alive && (v.ghosts ?? []).includes(me.id);
      if (haunting) {
        view.prompt = {
          kind: 'vote',
          text: 'You died, but you can haunt the vote. Who do you want to eliminate?',
          targets: state.players.filter((p) => p.alive).map((p) => p.id),
          skippable: true,
          haunt: true, // the UI adds a Pass button
          done: me.id in v.votes,
        };
      } else if (me.alive) {
        view.prompt = {
          kind: 'vote',
          text: 'Who do you want to eliminate?',
          targets: state.players.filter((p) => p.alive && p.id !== me.id).map((p) => p.id),
          skippable: true,
          done: me.id in v.votes,
        };
      }
    } else {
      view.voteResult = state.settings.hideVotes
        ? { ...v.result, votes: {}, counts: {}, hidden: true }
        : { ...v.result, votes: { ...v.result.votes }, counts: { ...v.result.counts } };
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
    view.history = state.history.map((e) => ({ kind: e.kind, round: e.round, text: e.text }));
  }

  return view;
}
