# Balance simulator

Measures how a rule or event changes the village win rate. `tests/sim.test.js` plays random moves, so it
checks correctness but can't measure balance. This tool uses players who reason. It is a dev tool only:
the game never loads it.

## Model

- Classic roles only: wolves, Seer, Bodyguard, villagers, with the auto preset wolf count. Witch, Hunter
  and the other extra roles are not modelled.
- Villagers keep a Bayesian belief over every possible wolf team. They update it from night kills (a victim
  is never a wolf), noisy reads of behaviour, vote patterns (wolves rarely vote for a teammate), Seer claims
  and wolf counterclaims.
- The Seer claims once it finds a wolf or is under suspicion. A wolf counterclaims half the time.
- Wolves vote as a bloc for the innocent the table suspects most, and kill a claimed Seer at night.
- Skill levels (`low`, `mid`, `high`) set how much the players' reads of each other tell them.
- Not modelled: how good real people are at bluffing.

## Run

Node 22, no dependencies. Run from the repo root:

```sh
node tools/balance/quick.js 8 2000 horseshoe          # one number: players, games, event (- = none)
node tools/balance/run.js mid hidden calibrated 20000 out.json base,horseshoe,seance
node tools/balance/report.js out.json                 # change vs the no-event baseline, per table size
node tools/balance/calibrate.js                       # rewrites alpha.json (see below)
```

`run.js` arguments, in order:
- skill: `low`, `mid` or `high`;
- `hidden` or `reveal`: the "reveal role on death" setting;
- `calibrated` or `gullible`: how much the table trusts signals of unknown source;
- the number of games per cell;
- the output file;
- a comma-separated event list.

Each event is forced once on day 1 and compared with the same seeds and no event. Add `@N` to an event name
to force it on day N instead (`horseshoe@2`); the game fires Lucky Horseshoe on day 1 or 2. `restless` is
`seance` on a chosen day; `restlessVoted` is a variant where only the voted-out dead rise.

At 20,000 games per cell, the standard error is about 0.5 points, so a difference under 1.5 is noise. Rule
of thumb: within ±2.5 points is fine, over 5 is game-breaking. Always check `low` skill: effects are
largest there.

`alpha.json` sets how much a sensible table should trust an anonymous "X is a wolf" (a letter, the dead's
whisper, last words). `calibrate.js` measures it: how often the named player really is a wolf, compared
with what the table already believed. Rerun it after changing how any signal's source behaves. `gullible`
replaces the measured trust with a fixed 3× (and vouches with a fixed ⅓×).

## Adding an event

1. Add a `case` to `rollEvent()` in `model.js`, plus `vote()` or `night()` if the event acts there.
2. If the table hears "X is a wolf" from a source it can't trust fully, send it through `pointSignal()`
   with a new signal type, then run `calibrate.js`.
3. Run `run.js` at all three skill levels and read the report.

## Results (2026-11-17)

Change in village win rate from one occurrence, in percentage points, across 6, 8, 10 and 12 players and
all three skill levels. Role reveal was off; a check with it on gave similar numbers.

| Event | Effect | Verdict |
|---|---|---|
| `horseshoe`: a random player secretly gets one block of a wolf kill | +1.5 to +3 | keep |
| `seance`: every dead player votes at the next vote | 0 to +2 | keep |
| `whispers`: the dead pick a name, announced if two or more agree | −1 to +1 | keep |
| `mayor`: a random player's vote counts double (6+ alive, not near the end) | −0.4 to +0.8 | keep |
| `silence`: a random player can't talk until the vote | −2 to +0.5 | keep |
| `ballot`: a coin flip between `secret` and `open` | −2 to +5, about +1 on average | keep |
| `letterSmart`: a random player sends an anonymous template note, wolves never vouch | −0.7 to +0.9 | keep |
| `letter`: the same, but wolves vouch for a suspected teammate | −0.9 to +10 | cut, vouching gives wolves away |
| `lastwords`: the next player to die points at someone | about 0 if the table ignores it, +5 to +10 if `gullible` | hold |
| `secret`: votes hidden for one vote | −11 to +1 | cut |
| `open`: votes shown live for one vote | 0 to +9 | cut |
| `rumor`, `rumorFakes`, `rumorNoisy`, `rumor3`: a private clue about a pair of players that the holder can claim | +2 to +42 per cell, +6 to +38 on average | cut |

### Lucky Horseshoe shipped, Restless Dead cut (2026-11-19)

Same setup, each event on the days the game would use. Lucky Horseshoe shipped in v1.27.0. Restless Dead
(the Séance, on day 2 or 3) was cut for being game-breaking at 8 players. Role reveal off; a check at low skill with it on gave similar numbers.

| Event | low | mid | high |
|---|---|---|---|
| `horseshoe@1` (holder quiet) | +1.5 to +2.9 | +1.7 to +2.5 | +1.5 to +2.4 |
| `horseshoe@2` | +1.0 to +1.7 | +1.1 to +1.5 | +1.0 to +1.3 |
| `horseshoeClaimed@1/2` (holder claims) | about 0 | about 0 | about 0 |
| `restless@2` | +1.2 to +3.2 | +2.0 to +8.0 | +1.9 to +10.0 |
| `restless@3` | +0.4 to +2.0 | +0.8 to +5.1 | +0.5 to +7.4 |
| `restless@1` | +0.4 to +1.0 | +0.1 to +2.1 | +0.4 to +2.1 |
| `restlessVoted@2` | −1.8 to +1.1 | −1.3 to +3.5 | −1.4 to +4.9 |
| `restlessVoted@3` | −0.4 to +1.2 | −0.2 to +2.6 | −0.2 to +3.8 |

Restless Dead grows with skill, unlike the other events: the dead vote with their reads, and night victims are
never wolves, so the dead lean village.

Takeaways:
- True information made public helps only the village, because wolves already know everything. Letting
  wolves fake the clue made Rumor worse, because the fakers get caught.
- Hiding who voted for whom helps wolves. That also goes for the existing hide-votes setting.
- Every effect shrinks as players get better.
