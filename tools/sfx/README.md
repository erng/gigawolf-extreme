# Sound effects

The game's sound effects (`assets/sfx/*.mp3`) are synthesized here with numpy and scipy, not recorded. Nothing in this folder is loaded by the game.

## Render

```
python3 tools/sfx/render.py /tmp/sfx-out
```

Needs Python 3 with numpy and scipy, and ffmpeg with libmp3lame. It writes every candidate as .wav and .mp3 (96 kbps mono) plus `meta.json`. Output is deterministic: the same code gives the same audio. Rendering order affects the random noise, so add new sounds at the end rather than in the middle.

- `synth.py`: the instruments (chip, bells, pluck, impacts, strings, howl and so on), the mastering chain and the first three packs (Pixel, Storybook, Midnight).
- `render.py`: the twelve nightfall candidates, the vote-call sound and the render loop. The three original nightfall sounds in `synth.py` were dropped.

Mastering matches loudness on what a phone speaker plays (above about 250 Hz), cuts sub-bass and anything above 9 kHz, and soft-limits peaks. Quiet moments (nobody died, tie, lowered gun) are mastered a little softer on purpose.

## What the game uses

| File | Candidate |
| --- | --- |
| nightfall | night-nightfall-owl (Owl call) |
| voteCall | midnight-voteCall (Midnight summons) |
| nightDeath | midnight-nightDeath (Midnight impact) |
| calm | pixel-calm (Pixel sunrise) |
| voteOut | midnight-voteOut (Midnight verdict) |
| tie | midnight-tie (Midnight unresolved) |
| shot | midnight-shot (Midnight gunshot) |
| spared | midnight-spared (Midnight release) |
| prince | story-prince (Storybook fanfare) |
| jester | pixel-jester (Pixel boing) |
| villageWin | story-villageWin (Storybook triumph) |
| wolvesWin | midnight-wolvesWin (Midnight pack) |

## Reserved

`reserved/dread.mp3` (night-nightfall-dread, "Two-note dread": low strings, a half step up) is kept for future random events. It is not used yet.
