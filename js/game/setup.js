export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 15;

// counts key -> role id
export const COUNT_ROLES = Object.freeze({
  wolves: 'werewolf', wolfcub: 'wolfcub', seer: 'seer', bodyguard: 'bodyguard', hunter: 'hunter',
  witch: 'witch', prince: 'prince', jester: 'jester', villagers: 'villager',
});
export const COUNT_KEYS = Object.keys(COUNT_ROLES);

// Fill in missing keys with 0 (older saves / partial patches).
export function fullCounts(c) {
  if (!c) return c;
  const out = {};
  for (const k of COUNT_KEYS) out[k] = c[k] === undefined ? 0 : c[k];
  return out;
}

// The roles beyond the classic set. The host may use them at any player count.
export const EXTRA_KEYS = ['wolfcub', 'hunter', 'witch', 'prince', 'jester'];

// Auto preset: the original classic set. The extra roles are opt-in from the lobby.
export function presetFor(n) {
  if (!Number.isInteger(n) || n < MIN_PLAYERS || n > MAX_PLAYERS) return null;
  const wolves = n <= 6 ? 1 : n <= 10 ? 2 : 3;
  return { wolves, seer: 1, bodyguard: 1, villagers: n - wolves - 2 };
}

// Secret random mix: rejection-sample counts until validate() accepts, so it can never be an
// invalid or game-breaking setup. Falls back to the classic preset (always valid for 5..15).
export function randomCounts(n, rng) {
  if (!Number.isInteger(n) || n < MIN_PLAYERS || n > MAX_PLAYERS) return null;
  const keys = COUNT_KEYS.filter((k) => k !== 'villagers');
  for (let i = 0; i < 500; i++) {
    const c = {};
    let used = 0;
    for (const k of keys) {
      // Mostly 0 or 1 of each role, occasionally more.
      const r = rng();
      c[k] = r < 0.4 ? 0 : r < 0.85 ? 1 : r < 0.96 ? 2 : 3;
      used += c[k];
    }
    c.villagers = n - used;
    if (c.villagers >= 0 && validate(c, n).ok) return c;
  }
  return presetFor(n);
}

export function validate(counts, n) {
  const errors = [];
  if (!counts) return { ok: false, errors: ['No role counts.'] };
  const c = fullCounts(counts);
  for (const k of COUNT_KEYS) {
    if (!Number.isInteger(c[k]) || c[k] < 0) errors.push(`Invalid count for ${k}.`);
  }
  if (errors.length) return { ok: false, errors };
  const total = COUNT_KEYS.reduce((s, k) => s + c[k], 0);
  const wolfSide = c.wolves + c.wolfcub;
  if (n < MIN_PLAYERS) errors.push(`Need at least ${MIN_PLAYERS} players.`);
  if (n > MAX_PLAYERS) errors.push(`At most ${MAX_PLAYERS} players.`);
  if (wolfSide < 1) errors.push('Need at least 1 werewolf.');
  if (wolfSide >= n - wolfSide) errors.push('Wolves must be fewer than non-wolves.');
  if (total !== n) errors.push(`Roles total ${total} but there are ${n} players.`);
  // Game-breaking setups: the outcome would be decided before anyone can play (see DECISIONS.md).
  if (total === n && wolfSide >= 1 && wolfSide < n - wolfSide) {
    // One night kill already hands the wolves the win. Only a Witch can reliably stop that kill
    // (she sees the victim); a Bodyguard would be guessing.
    if (2 * wolfSide >= n - 1 && c.witch === 0) errors.push('Wolves would win on the first night.');
    // Every Hunter shot kills someone, so against a lone wolf the chain only ends when it hits the wolf.
    if (wolfSide === 1 && c.hunter === n - 1) errors.push('A lone wolf cannot beat a village made only of Hunters.');
    // Only wolves and Jesters: the first vote always elects a Jester.
    if (n - wolfSide - c.jester < 1) errors.push('The village needs at least one player who is not a Jester.');
  }
  return { ok: errors.length === 0, errors };
}

// Expand counts to a flat list of role ids.
export function roleList(counts) {
  const c = fullCounts(counts);
  return COUNT_KEYS.flatMap((k) => Array(c[k]).fill(COUNT_ROLES[k]));
}
