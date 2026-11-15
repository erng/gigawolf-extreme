import { createState, reduce, PHASE } from '../js/game/engine.js';
import { createRng } from '../js/util/rng.js';

export const T0 = 1_000_000;

export function lobby(n, rng = createRng(1)) {
  let s = createState({ hostId: 'p0', roomCode: 'ABCD' });
  for (let i = 0; i < n; i++) {
    s = reduce(s, { kind: 'join', by: `p${i}`, name: `Player${i}`, now: T0 }, rng).state;
  }
  return s;
}

// Start a game, then force roles (by index) for deterministic tests.
// roles: array of role ids, length n. Skips the reveal -> night 1.
export function game(roles, { settings, rng = createRng(1) } = {}) {
  let s = lobby(roles.length, rng);
  if (settings) s = reduce(s, { kind: 'settings', by: 'p0', patch: settings, now: T0 }, rng).state;
  s = reduce(s, { kind: 'startGame', by: 'p0', now: T0 }, rng).state;
  s.players.forEach((p, i) => { p.role = roles[i]; });
  for (const p of s.players) s = reduce(s, { kind: 'ready', by: p.id, now: T0 }, rng).state;
  if (s.phase !== PHASE.NIGHT) throw new Error('expected night, got ' + s.phase);
  return { s, rng };
}

export const act = (g, action) => {
  const r = reduce(g.s, { now: T0, ...action }, g.rng);
  g.s = r.state;
  return r;
};

// Everyone alive submits; picks: { playerId: targetId }. Villagers/unlisted default sensibly.
export function submitNight(g, picks, now = T0) {
  for (const p of g.s.players.filter((x) => x.alive)) {
    if (p.id in g.s.night.picks) continue;
    if (p.role === 'villager') { act(g, { kind: 'nightPick', by: p.id, targetId: null, now }); continue; }
    if (!(p.id in picks)) throw new Error(`no pick for ${p.id} (${p.role})`);
    const r = act(g, { kind: 'nightPick', by: p.id, targetId: picks[p.id], now });
    if (r.error) throw new Error(`${p.id}: ${r.error.message}`);
  }
}

// Advance past the random post-submission delay and resolve the night.
export function resolveNight(g, now = T0 + 10_000) {
  return act(g, { kind: 'tick', now });
}

export function everyoneVotes(g, votes, now = T0) {
  for (const p of g.s.players.filter((x) => x.alive)) {
    if (g.s.vote.stage !== 'voting' || p.id in g.s.vote.votes) continue;
    const t = votes[p.id] ?? 'skip';
    const r = act(g, { kind: 'vote', by: p.id, targetId: t, now });
    if (r.error) throw new Error(`${p.id}: ${r.error.message}`);
  }
}
