export const MIN_PLAYERS = 5;
export const MAX_HUMANS = 15;   // real phones in the room
export const MAX_BOTS = 20;     // host-run bots (they live inside the host's page). 1000 was too slow, see DECISIONS.md
export const MAX_PLAYERS = MAX_HUMANS + MAX_BOTS;
export const BOT_PREFIX = 'bot-';
// Funny, cute names for bots. At most 14 characters, so name + BOT_TAG fits the 20-character name limit.
export const BOT_TAG = ' (bot)';
export const BOT_NAMES = [
  'Sir Fluffy', 'Biscuit', 'Cpt. Waffles', 'Noodle', 'Pickles', 'Mochi', 'Lady Meowsalot', 'Turnip',
  'Gizmo', 'Banana Pants', 'Muffin', 'Count Snuggles', 'Pudding', 'Waddles', 'Sprout', 'Dumpling',
  'Professor Bun', 'Tater Tot', 'Marshmallow', 'Beans', 'Sassy Pancake', 'Cupcake', 'Doodle', 'Nugget',
  'Princess Toast', 'Wobbles', 'Pebble', 'Bubbles', 'Cheeseball', 'Peanut', 'Fuzzball', 'Squeaky',
  'Jellybean', 'Mr. Sprinkles', 'Gumdrop', 'Snickers', 'Meatball', 'Pip Squeak', 'Boba', 'Zigzag',
];
export const isBotId = (id) => typeof id === 'string' && id.startsWith(BOT_PREFIX);

// counts key -> role id
export const COUNT_ROLES = Object.freeze({
  wolves: 'werewolf', wolfcub: 'wolfcub', seer: 'seer', bodyguard: 'bodyguard', hunter: 'hunter',
  witch: 'witch', prince: 'prince', diseased: 'diseased', apprentice: 'apprentice', poltergeist: 'poltergeist', jester: 'jester', villagers: 'villager',
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
export const EXTRA_KEYS = ['wolfcub', 'hunter', 'witch', 'prince', 'diseased', 'apprentice', 'poltergeist', 'jester'];

// Auto preset: the original classic set. The extra roles are opt-in from the lobby.
export function presetFor(n) {
  if (!Number.isInteger(n) || n < MIN_PLAYERS || n > MAX_PLAYERS) return null;
  const wolves = n <= 6 ? 1 : n <= 10 ? 2 : n <= 15 ? 3 : Math.round(n / 5); // rooms past 15 (bots): about one wolf in five
  return { wolves, seer: 1, bodyguard: 1, villagers: n - wolves - 2 };
}

// Secret random mix. Weighted toward balanced games: the wolf count follows the classic preset
// (sometimes +/-1), special roles mostly appear once (twice only in big groups), and plenty of
// plain villagers are kept. Rejection-sampled through validate(), so it can never be invalid or
// game-breaking. Falls back to the classic preset (always valid for any size).
const CHANCE = { seer: 0.85, bodyguard: 0.7, witch: 0.45, hunter: 0.4, prince: 0.25, diseased: 0.2, apprentice: 0.15, poltergeist: 0.15, jester: 0.25 };
// MAX chaos (opt-in): no plain villagers at all. Every non-wolf seat is a special role, spread as
// evenly as possible (each kind once before any repeats; at most one Jester, one Apprentice per Seer,
// three of any other). If a huge room runs out of specials, the leftover seats become plain villagers.
const SPECIAL_KINDS = ['seer', 'bodyguard', 'hunter', 'witch', 'prince', 'diseased', 'apprentice', 'poltergeist', 'jester'];
function maxChaosCounts(n, rng) {
  const base = presetFor(n).wolves;
  for (let i = 0; i < 500; i++) {
    const r = rng();
    const wolfSide = Math.max(1, base + (r < 0.2 ? -1 : r > 0.85 ? 1 : 0));
    const c = { wolves: wolfSide, wolfcub: 0, villagers: 0, ...Object.fromEntries(SPECIAL_KINDS.map((k) => [k, 0])) };
    if (wolfSide >= 2 && rng() < 0.35) { c.wolves--; c.wolfcub = 1; }
    for (let slot = n - wolfSide; slot > 0; slot--) {
      const open = SPECIAL_KINDS.filter((k) => c[k] < (k === 'jester' ? 1 : k === 'apprentice' ? c.seer : 3));
      if (!open.length) { c.villagers = slot; break; } // specials used up (big rooms): the rest are plain villagers
      const low = Math.min(...open.map((k) => c[k]));
      const pool = open.filter((k) => c[k] === low);
      c[pool[Math.floor(rng() * pool.length)]]++;
    }
    if (validate(c, n).ok) return c;
  }
  return null;
}

export function randomCounts(n, rng, { noVillagers = false } = {}) {
  if (!Number.isInteger(n) || n < MIN_PLAYERS || n > MAX_PLAYERS) return null;
  if (noVillagers) { const c = maxChaosCounts(n, rng); if (c) return c; }
  const base = presetFor(n).wolves;
  for (let i = 0; i < 500; i++) {
    const r = rng();
    const wolfSide = Math.max(1, base + (r < 0.2 ? -1 : r > 0.85 ? 1 : 0));
    const c = { wolves: wolfSide, wolfcub: 0 };
    if (wolfSide >= 2 && rng() < 0.35) { c.wolves--; c.wolfcub = 1; }
    let specials = 0;
    for (const [k, p] of Object.entries(CHANCE)) {
      c[k] = rng() < p ? 1 : 0;
      if (c[k] && k !== 'jester' && n >= 12 && rng() < 0.2) c[k] = 2; // doubles only in big groups
      specials += c[k];
    }
    // Keep enough plain villagers: at least a third of the village side.
    c.villagers = n - wolfSide - specials;
    if (c.villagers < Math.ceil((n - wolfSide) / 3) || c.villagers < 1) continue;
    if (validate(c, n).ok) return c;
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
  // A Seer's Apprentice only exists to inherit a Seer: one Seer per Apprentice (see DECISIONS.md).
  if (c.apprentice > c.seer) errors.push(`Seer's Apprentice needs a Seer: ${c.apprentice} Apprentice${c.apprentice === 1 ? '' : 's'} but ${c.seer} Seer${c.seer === 1 ? '' : 's'}. Add a Seer or remove the Apprentice.`);
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
