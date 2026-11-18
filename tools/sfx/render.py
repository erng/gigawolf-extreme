"""Twelve nightfall candidates. Fires every round, so: short, one clear idea each, nothing shrill."""
from synth import *

def crickets(d, gain=1.0, f=4300, rate=0.36):
    t = tt(d); am = np.zeros_like(t)
    for start in np.arange(0.0, d, rate):
        for p in range(3):
            c = start + p * 0.045 + rng.uniform(0, .01)
            am += np.exp(-((t - c) / 0.008) ** 2)
    x = np.sin(2 * np.pi * f * t) * am + .4 * np.sin(2 * np.pi * f * 1.07 * t) * np.roll(am, N(.17))
    return lp(x, 6000) * gain

def hoot(d, f):
    k = np.linspace(0, 1, N(d))
    fv = f * (1 + .07 * np.sin(np.pi * k) - .04 * k)
    v = osc('sine', fv, d) + .25 * osc('sine', fv * 2, d) + .1 * osc('tri', fv, d)
    x = formant(v, 'oo') * 1.2 + .6 * v + .12 * bp(noise(d), 250, 900)
    return x * np.sin(np.pi * k) ** .6

def growl(d):
    t = tt(d)
    f = 78 * (1 + .04 * np.sin(2 * np.pi * 3 * t))
    v = osc('saw', f, d) + .6 * lp(noise(d), 500)
    am = .55 + .45 * np.sin(2 * np.pi * 23 * t) ** 2
    return lp(formant(v, 'oh') * 2.0 * am, 1400) * env(d, .2, 9e9, 1, .3)

def wood_bang(d=0.35):
    o = impact(d, 210, 90, 300, 1.0, .9, .08) * .8
    return add(o, wood(240, .25), 0, .6)

M = 'nightfall'

@sfx('night', 'nightfall:bells', 'Midnight bells', 'Clock tower strikes three, fast.', -17)
def _():
    o = buf(2.6)
    for i, g in enumerate((.6, .5, .42)):
        add(o, lp(toll(n('A3'), 1.3, .75), 3200 - i * 700), i * .3, g)
    return reverb(o, 1.1, .22)

@sfx('night', 'nightfall:owl', 'Owl call', '"Hoo, hoo-hoo" over crickets.', -18)
def _():
    o = buf(1.9)
    add(o, crickets(1.6, .05), 0)
    add(o, hoot(.2, 370), .05, .9); add(o, hoot(.11, 390), .36, .8); add(o, hoot(.38, 350), .5, .9)
    return reverb(o, 1.2, .25)

@sfx('night', 'nightfall:snuff', 'Candle snuff', 'A puff, the light goes, dark chord settles.', -18)
def _():
    o = buf(2.0); d = .3; t = tt(d)
    add(o, bp(noise(d), 700, 3200) * np.exp(-t / .045), 0, .9)
    add(o, lp(noise(.5), 1500) * env(.5, .02, .12), .03, .25)
    add(o, strings([n('D3'), n('F3'), n('A3')], 1.4, .25, .6, .5, .5, 1000), .12, .8)
    add(o, celesta(n('A4'), 1.0, .6), .3, .25)
    return reverb(o, 1.3, .25)

@sfx('night', 'nightfall:lightsout', 'Lights out', '8-bit power-down "bwoomp".', -17)
def _():
    o = buf(1.6); d = .4
    k = np.linspace(0, 1, N(d))
    x = osc('pulse', glide(n('D6'), n('D3'), d), d, .5) * (1 - k) ** .5
    add(o, svf_lp(x, 4000 * (1 - k) + 300, .9) * .6, 0)
    add(o, tone('tri', glide(170, 55, .35), .35, .002, .15), .36, .9)
    add(o, tone('tri', vib(n('D3'), .7, 5, .02, .1), .7, .01, .35, .2, .2), .4, .5)
    return echo(o, .16, .25, 2, 1400)

@sfx('night', 'nightfall:moonrise', 'Moonrise', 'Glassy rising arpeggio, mysterious.', -18)
def _():
    o = buf(2.2)
    for i, nm in enumerate(['D5', 'F5', 'A5', 'C#6', 'E6']):
        add(o, celesta(n(nm), 1.1, .7), i * .075, .4)
    add(o, strings([n('D4'), n('F4'), n('A4')], 1.5, .2, .6, .5, .5, 1400), 0, .4)
    return reverb(o, 1.6, .3)

@sfx('night', 'nightfall:eyes', 'Eyes open', 'Two glints in the dark, a low growl.', -17)
def _():
    o = buf(1.8)
    add(o, bell(n('B5'), .5, 2.0, .8, .25), 0, .35)
    add(o, bell(n('F#6'), .5, 2.0, .8, .25), .1, .3)
    add(o, growl(1.0), .25, 1.0)
    return reverb(o, 1.1, .22)

@sfx('night', 'nightfall:heartbeat', 'Heartbeat', 'Two slow heartbeats, a dark swell.', -17)
def _():
    o = buf(2.0)
    beat = lambda g: impact(.3, 110, 55, 170, 1.0, .35, .07) * g
    for at in (0, .62):
        add(o, beat(1.0), at); add(o, beat(.65), at + .16)
    add(o, strings([n('D3'), n('A3')], 1.2, .4, .6, .5, .5, 900), .3, .5)
    return reverb(o, 1.0, .18)

@sfx('night', 'nightfall:jingle', 'Goodnight jingle', '8-bit falling minor tune, like a level ending.', -17)
def _():
    o = buf(1.8); s = .11
    for i, (nm, b) in enumerate([('D5', 1), ('A4', 1), ('F4', 1), ('E4', 1), ('D4', 5)]):
        at = sum(x[1] for x in [('D5', 1), ('A4', 1), ('F4', 1), ('E4', 1)][:i]) * s
        add(o, chip(n(nm), b * s + .05, .25, .14, .5, 3000, .02 if b > 3 else 0), at, .5)
    add(o, tone('tri', n('D3'), .3, .004, .15, .3), 0, .6)
    add(o, tone('tri', glide(n('D3'), n('D2'), .7), .7, .004, .35, .2, .2), 4 * s, .7)
    return reverb(o, .6, .14)

@sfx('night', 'nightfall:shutters', 'Shutters close', 'Two wooden shutters bang, a latch, crickets.', -17)
def _():
    o = buf(2.0)
    add(o, wood_bang(), 0, .9); add(o, wood_bang(), .2, .75)
    d = .06; t = tt(d)
    add(o, (hp(noise(d), 2000) * np.exp(-t / .008) + .5 * np.sin(2*np.pi*2400*t) * np.exp(-t / .03)), .48, .4)
    c = crickets(1.3, .06); c *= np.linspace(0, 1, len(c)) ** .5
    add(o, c, .55)
    return reverb(o, .9, .18)

@sfx('night', 'nightfall:dread', 'Two-note dread', 'Low strings: "dun... dun", rising a half step.', -17)
def _():
    o = buf(2.0)
    for at, (a, b), dur in [(0, ('A2', 'A3'), .32), (.4, ('Bb2', 'Bb3'), 1.0)]:
        add(o, strings([n(a), n(b)], dur, .01, .25, .45, .25, 1600, .006), at, 1.0)
        add(o, timpani(n(a), .5, .2), at, .35)
    return reverb(o, 1.2, .22)

@sfx('night', 'nightfall:hush', 'Hush', 'A soft "shhh" and three music-box notes.', -18)
def _():
    o = buf(2.0); d = .55
    add(o, bp(noise(d), 1800, 5000) * np.sin(np.pi * np.linspace(0, 1, N(d))) ** 1.5, 0, .22)
    for i, nm in enumerate(['F5', 'E5', 'D5']):
        add(o, glock(n(nm), 1.0, .5 if i < 2 else .8) * .8, .35 + i * .22, .45)
    return reverb(o, 1.3, .25)

@sfx('night', 'nightfall:farhowl', 'Bell and far howl', 'One bell, then a wolf far off in the hills.', -17)
def _():
    o = buf(2.6)
    add(o, toll(n('D4'), 1.8, 1.0), 0, .5)
    add(o, lp(howl(1.4, n('G4'), n('D5'), n('B4')), 1600), .3, .4)
    return reverb(o, 2.0, .38)

if __name__ == '__main__':
    import wave, base64
    OUT = sys.argv[1] if len(sys.argv) > 1 else 'out'
    os.makedirs(OUT, exist_ok=True)
    meta = []
    JESTER_TAG = {'jester': 'Twist card', 'jesterWin': 'Game over'}
    for (pack, moment), s in SOUNDS.items():
        if moment == 'nightfall':
            continue                                            # first three nightfall sounds were a miss
        x = master(s['fn'](), s['target'])
        sid = f'{pack}-{moment.replace(":", "-")}'
        wav = os.path.join(OUT, sid + '.wav'); mp3 = os.path.join(OUT, sid + '.mp3')
        with wave.open(wav, 'w') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '96k', mp3], check=True)
        e = np.convolve(np.abs(x), np.ones(441) / 441, 'same')
        felt = np.nonzero(e > e.max() * 10 ** (-30 / 20))[0][-1] / SR
        group = 'jester' if moment in JESTER_TAG else moment.split(':')[0]
        meta.append(dict(id=sid, pack=pack, moment=group, tag=JESTER_TAG.get(moment, ''), name=s['name'],
                         note=__import__('re').sub(r'\s*\d+(\.\d+)? s\.$', '', s['note']),
                         file=sid + '.mp3', dur=round(len(x) / SR, 2), felt=round(float(felt), 1),
                         b64=base64.b64encode(open(mp3, 'rb').read()).decode()))
        print(f'{sid:28s} felt {felt:4.2f}s peak {20*np.log10(np.abs(x).max()):5.1f} nan={np.isnan(x).any()}', flush=True)
    json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w'))
