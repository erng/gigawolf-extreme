# Gigawolf Extreme

A Werewolf-style party game for 5–15 people, each on their own phone. No moderator, no server of our own:
phones connect peer to peer (PeerJS + WebRTC), and the site is plain static files.

Live URL: _add after enabling GitHub Pages (Settings → Pages → main branch, root)._

## Play

1. One person opens the site, enters a name, taps **Host game** and shares the 4-letter room code (or the invite link).
2. Everyone else opens the site (same Wi-Fi, or join one phone's hotspot), enters name and code, taps **Join game**.
3. Host taps **Start game** with 5+ players. Press and hold your card to see your role.

Roles: Villager, Werewolf, Seer, Bodyguard (the default set). The host can also add Wolf Cub, Hunter, Witch, Prince and Jester from the lobby (see `DECISIONS.md` for how each works). The host's phone plays like everyone else's and sees only its own secrets.

## Run locally

```sh
python3 -m http.server 8080      # or: npx serve
# open http://localhost:8080
```

Add `?bots=4` on the host's URL to fill the room with fake players, e.g. `http://localhost:8080/?bots=4`.
`localhost` and GitHub Pages (HTTPS) both work for WebRTC; plain `http://<lan-ip>` does not.

## Tests

```sh
node --test tests/
```

Engine, views (secrecy), the new roles, random headless games (`SIM_SEEDS=500 node --test tests/sim.test.js` for a longer run), and networking (host/client/rejoin/resume and full bot games, over an in-memory fake PeerJS) — no dependencies.

## Layout

- `js/game/` pure engine, views, roles, setup (no DOM, no network)
- `js/net/` protocol, host, client, loopback
- `js/ui/` screens, narrator
- `js/dev/` bots and the fake PeerJS used by tests
- `js/config.js` connection timeouts, PeerJS broker host/port/path, STUN server. Swap the broker for a self-hosted PeerServer here.
- `DECISIONS.md` rule ambiguities and how they were resolved

## Troubleshooting

- "Can't reach the host": phones must be on the same Wi-Fi or hotspot; guest networks with client isolation block direct connections. No TURN relay is used.
- Locked/backgrounded phones rejoin automatically with the same role. If the host page reloads, tap **Resume game** (within 2 hours).
