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
- **Narration and music** play on any phone, each with its own button in the tools row. Both default on for the host and off for everyone else, since in-person games put every phone in one room and duplicate sound is noise; remote players turn them on. The host's choice is remembered across games, a player's only for that room. The host sends the latest line with every view as `narration: { seq, text }` (only while the game's Narration setting is on); a phone speaks when `seq` changes, skipping the first view after it connects. Speech and audio still need a tap to start, so sound turned on without one starts on the next tap.
- **Bots** are real Clients on host loopback connections (`?bots=N`, max 14).
- **Idle players** don't stall anything: the host can advance past them (no pick / Skip / not ready).
- **Not tested here**: real iOS/Android phones, hotspot and client-isolation networks, speech synthesis and wake lock (verified only in headless Chrome and Node).

- **No timers at all** (casual same-room play). The host advances with one button per phase: Start night (reveal), Dawn (night), Start vote (day), End vote now (vote, optional: it also ends by itself once everyone has voted), Next (result). The host sees aggregate progress counts only (e.g. 3/5 confirmed), never who. Night/discussion/vote length settings were removed.

## Extra roles (Wolf Cub, Hunter, Witch, Prince, Diseased Villager, Jester)

- **Opt-in, any player count.** The auto preset is still the classic set (wolves, Seer, Bodyguard, villagers). The host can override it with the lobby steppers even at 5 players, as long as the setup is not game-breaking.
- **Game-breaking setups are rejected at Start** (`validate` in `setup.js`), because the outcome would be fixed before anyone can play:
  - no wolf-side player (instant village win), or wolves ≥ everyone else (instant wolf win);
  - wolves win after a single night kill (`2 × wolves ≥ players − 1`) and nothing reliable can stop it. A Witch counts as a reliable counter (she sees the victim and heals); a Bodyguard does not (she guesses). So 2 wolves in 5 players need a Witch;
  - nobody on the village side except Jesters (the first vote always elects a Jester);
  - a lone wolf against a village made only of Hunters (every shot kills someone, so the chain only ends when it hits the wolf).
  Setups that are merely lopsided but playable (e.g. many Witches, a lone wolf vs lots of Hunters plus other roles) are allowed. This was checked by playing random games on every valid setup at 5, 6 and 7 players (about 5,600 setups) and a sample at 8: no crashes, no non-terminating games, no guaranteed outcome left.
- **Nobody left to shoot**: if every player dies in the same night (e.g. poison, revenge kills and a hunter), the hunter's shot is dropped and the game ends (the wolves are dead, so the village wins).
- **Wolf Cub**: wolf team, shows as a wolf to the Seer, counts as a wolf for the win check. When it dies (night, vote, shot or poison) the wolves pick **two** different victims on the next night only (`night.doubleKill`). The two best-voted targets die, ties broken randomly.
- **Hunter**: dies → a new `shot` phase. The hunter picks one living player (`shoot`); the host can skip if the hunter is idle. Shots resolve before the win check, so a shot can end the game. A poisoned hunter still shoots. Chained shots (two hunters) are queued. Hunter shots reveal the hunter even with "reveal on death" off.
- **Witch**: one heal and one poison, each once, at most one potion per night (`heal:<id>` / `poison:<id>` / `pass`). She sees the wolf victims only after every living wolf has confirmed (otherwise she is told to wait). The heal only works on a current victim; potions are spent when confirmed. Poison deaths are announced like any night kill so nobody can tell them apart.
- **Prince**: the first vote against them fails, they are revealed to everyone (`revealed`), and nobody dies. After that they are an ordinary voteable player.
- **Jester**: own team (`jester`). Wins alone the moment they are voted out (announced after the result screen, like other wins). Dying at night does nothing. A living jester counts as a non-wolf for wolf parity, and loses when village or wolves win.
- **Diseased Villager** (v1.7.0; internal role id `diseased`, shown to players as "Diseased Villager"): village team, no night action, counts as a villager for parity. If the wolves night-kill them (not protected, not healed), `state.diseasedDied` is set and the *next* night is a sick night (`night.noKill`): wolves cannot kill anyone. Vote-out, Witch poison, Hunter shot, Bodyguard save and Witch heal do nothing. A Diseased who is both wolf-killed and poisoned still triggers it. Choices on ambiguous points:
  - **Sick night + Cub revenge night**: the skip wins and the revenge is consumed (not carried over to a later night). The Cub flag is cleared when the night starts either way.
  - **Wolves still confirm**: their prompt says they cannot kill tonight and the Confirm button works with no target (no pick needed), so the night counts them as done and the host can end it as usual. Wolf picks are ignored on that night even if sent. No public announcement: the dawn text is just "Nobody died." (or poison/shot deaths), so the village only infers it.
  - **Witch**: `night.victims` starts as `[]` on a sick night, so she is not told to wait and sees "nobody is targeted", never a phantom victim. Her poison works as normal.
  - **Win/parity and validate()**: Diseased is village side; no validate() rule changes. A lone Diseased does not count as a reliable counter to the first-night wolf win, so the existing "wolves win on night one" rule still needs a Witch.
  - Included in the secret random mix (20% chance, once).
- **Seer's Apprentice** (v1.8.0, id `apprentice`): village team, decoy prompt until promoted. Choices:
  - **Validation**: `validate()` rejects any pool with more Apprentices than Seers (one Seer per Apprentice) with the error "Seer's Apprentice needs a Seer...", shown in the lobby, and the Start button stays disabled. The lobby steppers also stop the host from creating it (Apprentice max = Seer count, Seer min = Apprentice count). The secret random mix is rejection-sampled through `validate()`, so it can never produce it.
  - **Promotion**: when a Seer dies by any cause, `state.promotions` is incremented; after the whole batch of deaths settles (before hunter shots, and after each shot) each pending promotion turns the first living Apprentice (seating order) into a Seer, 1:1. Seer and Apprentice dying in the same batch: no promotion. Apprentice dying first: nothing happens. No public announcement; the promoted player gets a private notice (`you.private.promoted`) and the Seer prompt from the next night.
  - **Fresh log**: Seer log entries are tagged with the Seer who made them and each Seer sees only their own, so the promoted Apprentice starts empty (this also separates the logs of two original Seers, which used to be shared).
  - The Seer's check of an unpromoted Apprentice shows village. Included in the random mix (15%, only if a Seer is present).
- **Graveyard Voter** (v1.8.0, internal id `poltergeist`, shown to players as "Graveyard Voter"): village team, decoy prompt. After they die (any cause) they get ONE optional haunt at the next vote that starts (a vote that kills them does not count; an unused haunt expires). Choices:
  - A haunt is a normal vote for any living player (never themselves) or Skip, public in the result list (accepted: it reveals them), counts for ties, Jester election, and Prince immunity. A dedicated Pass action abstains and is not listed. Wolf parity and win checks only ever count living players.
  - **Vote held for the ghost** (v1.10.0, reverses the earlier "no stall" rule): the vote auto-resolves when all living players AND every haunting ghost have voted or passed, and the host's "End vote now" is refused ("Waiting for everyone to vote.") while a connected ghost has not decided. Decision: prefer leaking the ghost's existence to the host over the ghost missing their haunt on timing. So the host progress count now includes the ghost. Other players still learn nothing (`vote.ghosts` is never sent). A ghost whose phone is disconnected does not block, so a dead connection cannot stall the game; the host can then end the vote and the haunt expires.
  - Only the haunting ghost gets the vote prompt on the dead screen (with a Pass button); `vote.ghosts` is never sent in views. No haunt if the game is over. Included in the random mix (15%).
- **Role card description**: the reveal card shows a one- or two-sentence description under the role name (`blurb.<role>`, English and Thai, only the viewer's own role). A test checks every role has one in both languages.
- **Decoy prompts**: Villager, Hunter, Prince, Diseased, Apprentice, Graveyard Voter and Jester all get the same optional "Who do you suspect?" night prompt so nobody can tell who has a power.
- **Announcements**: multi-line dawn / vote results (`state.lines`, sent as `view.announce`) so several deaths in one night each get a line.
- **Tests**: `tests/roles.test.js` (rules), `tests/sim.test.js` (thousands of random headless games, 5–15 players, with an independent win-condition oracle), `tests/e2e.test.js` (full games over the fake PeerJS network with bots).

## Host-run bots (v1.11.0)

- **Bots live in the host's page**, as ordinary players (`bot-N`) in the engine state with no connection. `HostBots` (`js/net/hostbots.js`) gives each bot a random delay when a phase starts, then builds only that bot's view and acts through `host.apply`. The old Client-per-bot helper (`addBots`, ids `cbot-N`) remains for tests.
- **Cap: 20 bots** (`MAX_BOTS`), on top of the 15-human limit (`MAX_PLAYERS` = 35). 1000 was tried: every player's view lists every player and each action broadcasts, so cost grows roughly with the cube of the room size, and a 1000-bot lobby did not get through its first phase in two minutes. Raising it needs batched phases (one pass per phase, not per action), slimmer views and virtualised player lists, plus an auto-advance for the host.
- Rooms over 40 players throttle saving (1s) and view broadcasts (150ms); smaller rooms are unchanged.
- `setBots` is one engine action (host only, lobby only), so adding bots costs one state copy.

## Village suspicions (v1.18.0, setting `suspicions`; on by default since v1.19.0, the host can turn it off)

- The "Who do you suspect?" prompt that every no-power role gets used to do nothing. With this setting on, those answers are collected (`night.suspects`, host only, never in a view) and dawn adds one line: `Most suspected: <names>.`
- **Checked for game-breaking, and kept safe by these limits.** The answers come only from players with no night power, so anything that shows who answered, or how many answered, tells the table who has a power and how many there are (and defeats the secret random mix). So the line shows names only, never counts or voters, and appears only when at least two answers agree; one lone answer cannot show how many no-power players are alive. A tie names everyone tied.
- Answers about a player who died that night are dropped. Wolves, Seer, Bodyguard and Witch never answer, so the line is village sentiment and proves nothing about roles. The outcome is not fixed by it, so `validate()` is unchanged.
- Known small leak, accepted: when the line appears, at least two no-power players are alive.
- An invalid answer (self, dead player) is ignored, never an error, as before. With the setting off nothing changes.

## Outcome reveal (v1.20.0)

- **What it covers**: every dawn, vote-result and hunter-shot announcement. A death gets a card with a pixel grave, a "Killed in the night" / "Voted out" / "Shot by X" label, the name struck out, and the role when `revealOnDeath` is on. "Nobody died", ties, the Prince, a lowered gun and the Jester twist get their own cards. The suspicion line stays plain text.
- **Full-screen first, then the cards**: new news plays as big cards over a dark full-screen layer (grave drops, dust, red flash, strike), then each big card's grave, name and role fly into the small card on the screen while the dark fades. It lands by itself; a tap only lands it sooner. No extra button press anywhere, and the host's controls are back within about 3 seconds.
- **UI only, built from the public lines**: `js/ui/fx.js` reads only `view.announce`, the same English text every phone gets, so every phone shows the same thing and nothing private can leak. No engine, view or protocol change. Night deaths look identical whatever the cause (wolves or poison), as the text already is. "X was the Jester!" (said when roles stay hidden) folds into X's vote-out card.
- **Plays once**: the screen is rebuilt on every view, so each line remembers it was shown and only plays the first time. The full-screen layer lives on `<body>`, outside the rebuilt screen, so a rebuild can't cut it off. A phone that reloads mid-day sees it again; accepted.
- **Dead players** now see the dawn cards on their screen too (they used to see only "You are out"), so the killed player gets the moment as well.
- **Buzz**: a death also vibrates a heartbeat pattern (Android; iPhone browsers have no vibration).
- **Reduced motion**: no full-screen layer, cards shown at rest.
- **Tests**: `tests/fx.test.js` (every announcement form, Jester fold, Thai labels); the random-game sim checks that every announcement it produces becomes a card and that each card type comes up.

## Sound effects (v1.21.0)

- **What sounds**: nightfall, every outcome card (night death, nobody died, voted out, tie, hunter shot, lowered gun, Prince, Jester) and the village or wolves winning. Each is a short synthesized clip in `assets/sfx/`, picked by ear from three packs; how they were made is in `tools/sfx/README.md`.
- **Own button**: an Effects button sits beside Music and Narrator, so effects mute without touching music. Same defaults and memory as the other two: on for the host, off for other players (a room of phones shouldn't fire the same sound a dozen times), the host's choice kept across games, a player's for that room. Choices saved before 1.21.0 get the default for effects.
- **Nothing secret**: only moments every phone already shows get a sound. Night deaths sound the same whatever the cause, as the card looks the same. No sound for night actions or anything only one phone sees.
- **Timing**: a death sounds as its grave lands, each card's sound on its own card, so two night deaths are two hits a second apart. With reduced motion, one sound for the news. Nightfall and the winner sound only on a real change of phase: a phone that joins or reconnects mid-phase stays quiet.
- **Jester**: voting out the Jester plays the Jester sound on the vote card (twist or role shown) and nothing more on the game-over screen, since it is the same moment.
- **Web Audio**: a sound starts when a view arrives, long after the last tap, which phones only allow from an audio context started by a tap. The context starts from the Host or Join tap, or the next tap anywhere. Files load only once a phone turns effects on. A sound that finishes loading after its moment is skipped, never played late. On iPhone, effects play through the silent switch, like the music.
- **Reserved**: `tools/sfx/reserved/dread.mp3` ("Two-note dread") is kept for future random events.
- **Tests**: `tests/sfx.test.js` (each card's sound and timing, Jester once, phase sounds, every file exists), `tests/sound.test.js` (the effects switch and old saved choices); the random-game sim checks that every card it produces has a sound and that each sound comes up.

## Narration trim, speech after sound, music fade (v1.22.0, tuned in v1.22.1)

- **What is still spoken**: only deaths and what follows them: the dawn announcement, the vote result and the hunter's "one last shot". The night, day and vote openers ("Night falls…", "Day breaks.", "Time to vote.") and the win line ("The wolves win!") are gone: nightfall, the card sounds and the winner sound already say them, and a sound cannot say a name, which is what a table in one room needs to hear. `js/game/lines.js` and its Thai pairs are deleted. A game that ends at dawn still speaks the deaths that ended it, never the win.
- **Call to vote**: voting has no spoken opener now, so it gets a sound, `voteCall` (three knocks and a bell), on the change into the vote phase. Same rules as nightfall: only a real change of phase, so a phone that joins or reconnects mid-vote stays quiet. Rendered by `tools/sfx/render.py` ("Midnight summons"); picked from the code, not by ear.
- **Speech waits for sound**: a spoken line starts after every sound scheduled for the same view has finished, plus a quarter second. The phone records when its last scheduled sound ends and the narrator waits for it. With effects off there is nothing to wait for and speech is immediate. A newer line, or turning the narrator off, cancels one that is still waiting. `main.js` now says the narration after rendering the view, because the screen is what schedules the card sounds.
- **Music fades out for every sound**: the music fades to silence just before a sound starts (gone within about half a second), stays silent a beat after the last one ends, then fades back in slowly, reaching about 95% five seconds later. Sounds that overlap or follow closely (two night deaths) keep it out the whole time. iPhones ignore an `<audio>` element's volume, so once the effects' audio context exists the music is routed through it and faded with a gain node on that same context, which also lines the timing up exactly. A phone with effects off never creates the context, so its music is untouched. The spoken narration does not fade the music; the slow return means it comes back underneath the spoken line. v1.22.0 ducked to a tenth and returned in about a second; that was too abrupt.
- **Tests**: `tests/narration.test.js` (what is and is not spoken), `tests/sfx.test.js` (the vote sound, speech waiting for sounds), `tests/duck.test.js` (drop, overlap, return).
