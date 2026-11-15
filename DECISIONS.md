# Decisions

Ambiguities in the plan, resolved with the simplest option.

## Milestone 1 (engine)

- **Package.json**: added with `"type": "module"` so `node --test tests/` treats `.js` as ESM. No dependencies. GitHub Pages ignores it.
- **RNG**: `js/util/rng.js` (mulberry32) is not in the plan's file list; it provides a seedable RNG whose state can be saved for host resume.
- **Action shape**: `{ kind, by, now, ...payload, nonce? }`. `now` is passed in so the engine never reads the clock. `tick` drives all timeouts.
- **Effects**: `{type:'views'}` (host should recompute `viewFor` for every player and send), `{type:'timer', at}`, `{type:'narrate', text}`, `{type:'haptic'}`. The engine returns the view *request*, not view bodies, so views are always built from the final state.
- **Errors**: a rejected action returns the unchanged state, no effects and `error: {code, message}`.
- **Night picks are final on confirm.** "Teammates' current picks show live" is implemented as: a wolf's confirmed pick is visible to other wolves immediately. No tentative/changeable picks.
- **Villager** `nightPick` ignores the target and just marks them submitted.
- **Who must submit**: every living player. Wolves/Seer/Bodyguard must give a valid target (no explicit "no pick"; timing out is how you pass).
- **Seer** cannot check themselves. Seer results from all nights are kept privately (`you.private.seerLog`).
- **Bodyguard restriction** resets if they skip a night (timeout) or die.
- **Night delay**: random 2–5s after the last submission (`night.resolveAt`, never sent to clients). A timeout resolves immediately at the deadline.
- **Vote**: self-votes are not allowed; votes are final on confirm; a non-voter counts as Skip. Resolves immediately when everyone has voted. A tie, or Skip being among the top, = no elimination.
- **Vote result screen**: after resolution, the phase stays `vote` (stage `result`) for 8s, then night begins, or game over if someone won. After a *night* kill that ends the game, it goes straight to game over.
- **Dead players**: no prompt, no actions. They keep seeing their own role. The "dead" screen is chosen by `you.alive`, not a separate phase.
- **Host can't start the vote if dead.** The discussion timer still starts it.
- **Role counts**: `settings.counts = null` means "auto preset for current player count"; the host overriding it sets explicit counts, validated at Start.
- **Join**: allowed in lobby only (max 15). Rejoin with the same player ID is allowed any time; names are locked once the game starts. Only non-host players can `leave`.
- **Views**: `viewFor(state, playerId, hostNow)`. `players[].role` is only filled for yourself, for dead players when `revealOnDeath` is on, and for everyone at game over. Wolves get teammates via `you.private.teammates`. Per-player "has submitted" is never shown to others (timing reveals nothing).
- **Nonce memory**: the last 50 nonces per player, kept inside engine state (so they survive host resume).
