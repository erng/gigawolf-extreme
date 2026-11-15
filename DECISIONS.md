# Decisions

Ambiguities in the plan, resolved with the simplest option.

## Milestone 1 (engine)

- **Package.json**: added with `"type": "module"` so `node --test tests/` treats `.js` as ESM. No dependencies. GitHub Pages ignores it.
- **RNG**: `js/util/rng.js` (mulberry32) is not in the plan's file list; it provides a seedable RNG whose state can be saved for host resume.
- **Action shape**: `{ kind, by, now, ...payload, nonce? }`. The engine never reads the clock and has no timers: the host advances every phase.
- **Effects**: `{type:'views'}` (host should recompute `viewFor` for every player and send), `{type:'narrate', text}`, `{type:'haptic'}`. The engine returns the view *request*, not view bodies, so views are always built from the final state.
- **Errors**: a rejected action returns the unchanged state, no effects and `error: {code, message}`.
- **Night picks are final on confirm.** "Teammates' current picks show live" is implemented as: a wolf's confirmed pick is visible to other wolves immediately. No tentative/changeable picks.
- **Villager** `nightPick` ignores the target and just marks them submitted.
- **Who must submit**: every living player. Wolves/Seer/Bodyguard must give a valid target (no explicit "no pick"; timing out is how you pass).
- **Seer** cannot check themselves. Seer results from all nights are kept privately (`you.private.seerLog`).
- **Bodyguard restriction** resets if they skip a night (timeout) or die.
- **Night end**: the host ends the night (`nextPhase`) whenever they choose; players who haven't picked count as no pick. It never ends on its own, so the table can't tell who confirmed last.
- **Vote**: self-votes are not allowed; votes are final on confirm; a non-voter counts as Skip. Resolves immediately when everyone has voted. A tie, or Skip being among the top, = no elimination.
- **Vote result screen**: after resolution, the phase stays `vote` (stage `result`) with no timer until the host clicks Next, then night begins, or game over if someone won. After a *night* kill that ends the game, it goes straight to game over.
- **Dead players**: no prompt, no actions. They keep seeing their own role. The "dead" screen is chosen by `you.alive`, not a separate phase.
- **A dead host can still advance the game** (start the vote, end night, Next), since nothing else would.
- **Role counts**: `settings.counts = null` means "auto preset for current player count"; the host overriding it sets explicit counts, validated at Start.
- **Join**: allowed in lobby only (max 15). Rejoin with the same player ID is allowed any time; names are locked once the game starts. Only non-host players can `leave`.
- **Views**: `viewFor(state, playerId, hostNow)`. `players[].role` is only filled for yourself, for dead players when `revealOnDeath` is on, and for everyone at game over. Wolves get teammates via `you.private.teammates`. Per-player "has submitted" is never shown to others (timing reveals nothing).
- **Nonce memory**: the last 50 nonces per player, kept inside engine state (so they survive host resume).

## Milestones 2–5

- **No `v` mismatch handling beyond an error**: a client with a different protocol version gets a `badVersion` error.
- **`playAgain`** was added to the client action kinds (the plan's list omitted it but "Play again" needs it).
- **Connection abstraction**: PeerJS is injected (`Peer` constructor) so tests run the real Host/Client over an in-memory fake (`js/dev/fakepeer.js`).
- **Initial join failure** shows the "Can't reach the host" message and stops. After the first successful join, or when auto-rejoining a saved session, the client retries forever (1s, 2s, 5s, then 5s) and shows "Host disconnected, waiting…".
- **Ping/pong**: clients ping every 5s; no message for 15s forces a fresh connection (frozen mobile sockets often never fire `close`).
- **Host resume**: state, RNG state and room code saved after every applied action. On resume all players start as disconnected. Same-ID registration retries for up to 60s.
- **Rejoin after reload** (non-host): a saved session auto-rejoins on page load, also when the URL has `?join=` for the same room.
- **Haptics** run client-side on every phone when its own phase/alive state changes (not as a host effect).
- **Narration** is spoken only by the host phone, only if the toggle is on and speech was unlocked by a tap (Host game / Start game).
- **Bots** are real Clients on host loopback connections (`?bots=N`, max 14).
- **Idle players** don't stall anything: the host can advance past them (no pick / Skip / not ready).
- **Not tested here**: real iOS/Android phones, hotspot and client-isolation networks, speech synthesis and wake lock (verified only in headless Chrome and Node).

- **No timers at all** (casual same-room play). The host advances with one button per phase: Start night (reveal), Dawn (night), Start vote (day), End vote now (vote, optional: it also ends by itself once everyone has voted), Next (result). The host sees aggregate progress counts only (e.g. 3/5 confirmed), never who. Night/discussion/vote length settings were removed.
