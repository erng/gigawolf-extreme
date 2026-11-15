export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 15;

// counts: { wolves, seer, bodyguard, villagers }
export function presetFor(n) {
  if (!Number.isInteger(n) || n < MIN_PLAYERS || n > MAX_PLAYERS) return null;
  const wolves = n <= 6 ? 1 : n <= 10 ? 2 : 3;
  return { wolves, seer: 1, bodyguard: 1, villagers: n - wolves - 2 };
}

export function validate(counts, n) {
  const errors = [];
  if (!counts) return { ok: false, errors: ['No role counts.'] };
  const keys = ['wolves', 'seer', 'bodyguard', 'villagers'];
  for (const k of keys) {
    if (!Number.isInteger(counts[k]) || counts[k] < 0) errors.push(`Invalid count for ${k}.`);
  }
  if (errors.length) return { ok: false, errors };
  const total = keys.reduce((s, k) => s + counts[k], 0);
  if (n < MIN_PLAYERS) errors.push(`Need at least ${MIN_PLAYERS} players.`);
  if (n > MAX_PLAYERS) errors.push(`At most ${MAX_PLAYERS} players.`);
  if (counts.wolves < 1) errors.push('Need at least 1 werewolf.');
  if (counts.wolves >= n - counts.wolves) errors.push('Wolves must be fewer than non-wolves.');
  if (total !== n) errors.push(`Roles total ${total} but there are ${n} players.`);
  return { ok: errors.length === 0, errors };
}

// Expand counts to a flat list of role ids.
export function roleList(counts) {
  return [
    ...Array(counts.wolves).fill('werewolf'),
    ...Array(counts.seer).fill('seer'),
    ...Array(counts.bodyguard).fill('bodyguard'),
    ...Array(counts.villagers).fill('villager'),
  ];
}
