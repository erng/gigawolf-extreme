"""Gigawolf SFX generator (library). Run render.py, not this file; see README.md.
Original pass: Three packs (pixel, story, midnight) x every reveal moment.
Design rules: phone speakers (little below ~200 Hz, so every impact has a mid-range body),
warm tops (nothing harsh above ~6 kHz), short tails on per-round sounds, a pitched hook in each.
All melodies are original."""
import numpy as np, json, os, subprocess, sys
from scipy.signal import butter, sosfilt, fftconvolve, resample_poly

SR = 44100
rng = np.random.default_rng(7)

def m2f(m): return 440.0 * 2 ** ((m - 69) / 12)
NOTE = {'C':0,'C#':1,'Db':1,'D':2,'D#':3,'Eb':3,'E':4,'F':5,'F#':6,'Gb':6,'G':7,'G#':8,'Ab':8,'A':9,'A#':10,'Bb':10,'B':11}
def n(s):
    name, octv = s[:-1], int(s[-1])
    return m2f(12 * (octv + 1) + NOTE[name])

def N(d): return int(round(d * SR))
def tt(d): return np.arange(N(d)) / SR
def buf(d): return np.zeros(N(d))

def add(dst, src, at=0.0, gain=1.0):
    i = N(at)
    if i >= len(dst): return dst
    end = min(len(dst), i + len(src))
    dst[i:end] += gain * src[:end - i]
    return dst

def fvec(f, d):
    return np.full(N(d), float(f)) if np.isscalar(f) else np.asarray(f, float)

def glide(f0, f1, d, curve='exp'):
    x = np.linspace(0, 1, N(d))
    return f0 * (f1 / f0) ** x if curve == 'exp' else f0 + (f1 - f0) * x

def vib(f, d, rate=5.5, depth=0.012, delay=0.1):
    t = tt(d); amt = np.clip((t - delay) / 0.15, 0, 1) * depth
    return fvec(f, d) * (1 + amt * np.sin(2 * np.pi * rate * t))

# ---- oscillators (naive at 4x, then decimated: clean enough, no fizz) ----
def osc(kind, f, d, duty=0.5):
    fv = fvec(f, d)
    if kind == 'sine':
        return np.sin(2 * np.pi * np.cumsum(fv) / SR)
    up = np.repeat(fv, 4)
    ph = np.cumsum(up) / (SR * 4) % 1.0
    if kind == 'saw': x = 2 * ph - 1
    elif kind == 'pulse': x = np.where(ph < duty, 1.0, -1.0) - (2 * duty - 1)
    elif kind == 'tri': x = 1 - 4 * np.abs(ph - 0.5)
    x = resample_poly(x, 1, 4)[:len(fv)]
    return x

def noise(d): return rng.standard_normal(N(d))

def sos_f(x, kind, fc, order=2):
    if kind == 'band': sos = butter(order, [fc[0], fc[1]], 'bandpass', fs=SR, output='sos')
    else: sos = butter(order, fc, kind, fs=SR, output='sos')
    return sosfilt(sos, x)
def lp(x, fc, o=2): return sos_f(x, 'low', min(fc, SR / 2 - 100), o)
def hp(x, fc, o=2): return sos_f(x, 'high', fc, o)
def bp(x, lo, hi, o=2): return sos_f(x, 'band', (lo, hi), o)

def svf_lp(x, fc, q=0.7):
    """Time-varying lowpass (fc array or scalar)."""
    fc = np.broadcast_to(np.asarray(fc, float), x.shape)
    g = np.tan(np.pi * np.clip(fc, 20, SR * 0.45) / SR); k = 1 / q
    y = np.empty_like(x); ic1 = ic2 = 0.0
    for i in range(len(x)):
        gi = g[i]; a1 = 1 / (1 + gi * (gi + k)); a2 = gi * a1; a3 = gi * a2
        v3 = x[i] - ic2; v1 = a1 * ic1 + a2 * v3; v2 = ic2 + a2 * ic1 + a3 * v3
        ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2; y[i] = v2
    return y

def formant(x, vowel):
    F = {'oo': [(300, 1.0, 80), (870, .5, 100), (2240, .15, 120)],
         'ah': [(730, 1.0, 90), (1090, .6, 110), (2440, .25, 140)],
         'oh': [(500, 1.0, 80), (850, .6, 100), (2400, .15, 140)],
         'eh': [(530, 1.0, 80), (1840, .5, 110), (2480, .2, 140)]}[vowel]
    return sum(g * bp(x, max(40, f - bw), f + bw, 2) for f, g, bw in F)

# ---- envelopes ----
def env(d, a=0.005, dec=0.3, sus=0.0, rel=None, hold=0.0):
    t = tt(d)
    e = np.where(t < a, t / max(a, 1e-4), 1.0)
    e = e * np.where(t < a + hold, 1.0, sus + (1 - sus) * np.exp(-(t - a - hold) / dec))
    if rel:
        r0 = d - rel
        e = e * np.clip((d - t) / rel, 0, 1) ** 1.5 if r0 > 0 else e
    return e
def fade(x, out=0.03, inn=0.002):
    x = x.copy(); a, b = N(inn), N(out)
    if a: x[:a] *= np.linspace(0, 1, a)
    if b: x[-b:] *= np.linspace(1, 0, b)
    return x

# ---- instruments ----
def tone(kind, f, d, a=0.005, dec=0.25, sus=0.0, rel=0.05, duty=0.5, cut=None, hold=0.0):
    x = osc(kind, f, d, duty) * env(d, a, dec, sus, rel, hold)
    return lp(x, cut) if cut else x

def chip(f, d, duty=0.25, dec=0.18, sus=0.35, cut=3800, vibd=0.0, a=0.004):
    fv = vib(f, d, 6, vibd, 0.08) if vibd else f
    return tone('pulse', fv, d, a, dec, sus, 0.04, duty, cut)

def pluck(f, d, bright=0.6, decay=0.996):
    """Karplus-Strong."""
    L = int(SR / f); out = np.zeros(N(d))
    line = rng.uniform(-1, 1, L); line = lp(line, 1500 + 6000 * bright, 1)
    idx = 0; prev = 0.0
    for i in range(len(out)):
        v = line[idx]; nv = decay * 0.5 * (v + prev); prev = v
        line[idx] = nv; out[i] = v; idx = (idx + 1) % L
    return fade(out, 0.02)

def bell(f, d, ratio=1.4, index=2.5, dec=1.2, a=0.002):
    t = tt(d); e = env(d, a, dec)
    mod = np.sin(2 * np.pi * f * ratio * t) * index * np.exp(-t / (dec * 0.5))
    return np.sin(2 * np.pi * f * t + mod) * e

def celesta(f, d, dec=0.6):
    t = tt(d)
    x = bell(f, d, 3.5, 1.2, dec) + 0.35 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t / (dec * 0.25))
    return x * 0.8

def glock(f, d, dec=0.9):
    t = tt(d)
    return (np.sin(2*np.pi*f*t) + .3*np.sin(2*np.pi*2.76*f*t)*np.exp(-t/.15) + .15*np.sin(2*np.pi*5.4*f*t)*np.exp(-t/.06)) * env(d, .001, dec)

def toll(f, d, dec=1.6):
    """Church bell: inharmonic partials (hum, prime, tierce, quint, nominal)."""
    t = tt(d); x = np.zeros_like(t)
    for r, g, dd in [(0.5, .6, 1.4), (1, 1, 1), (1.19, .5, .7), (1.5, .35, .5), (2, .45, .45), (2.51, .2, .25), (3.0, .12, .2)]:
        x += g * np.sin(2 * np.pi * f * r * t + rng.uniform(0, 6)) * np.exp(-t / (dec * dd))
    return x * env(d, .002, 9e9) * 0.5

def impact(d=1.0, f0=150, f1=48, body=260, knock=0.6, nz=0.5, dec=0.35):
    """Boom with a mid-range knock so it reads on a phone speaker."""
    t = tt(d)
    sub = np.sin(2 * np.pi * np.cumsum(glide(f0, f1, d)) / SR) * np.exp(-t / dec)
    mid = np.sin(2 * np.pi * np.cumsum(glide(body * 1.6, body, d)) / SR) * np.exp(-t / 0.12)
    mid += .5 * np.sin(2 * np.pi * np.cumsum(glide(body * 3.2, body * 2.1, d)) / SR) * np.exp(-t / 0.06)
    thump = bp(noise(d), 150, 1400) * np.exp(-t / 0.06)
    x = sub + knock * mid + nz * thump
    return np.tanh(1.8 * x) * 0.8

def wood(f=520, d=0.25):
    t = tt(d)
    x = np.sin(2*np.pi*f*t)*np.exp(-t/.035) + .5*np.sin(2*np.pi*f*2.3*t)*np.exp(-t/.02) + .4*bp(noise(d), f, f*3)*np.exp(-t/.01)
    return x * 0.9

def timpani(f, d=1.2, dec=0.5):
    t = tt(d)
    fv = f * (1 + 0.06 * np.exp(-t / 0.05))
    x = osc('sine', fv, d) + .5 * osc('sine', fv * 1.5, d) * np.exp(-t / .25) + .3 * osc('sine', fv * 1.98, d) * np.exp(-t / .2)
    x = x * env(d, .002, dec) + .35 * lp(noise(d), 1200) * np.exp(-t / .03)
    return np.tanh(1.4 * x) * .8

def strings(freqs, d, a=0.08, dec=0.5, sus=0.6, rel=0.25, cut=2600, detune=0.004):
    x = np.zeros(N(d))
    for f in freqs:
        for dt in (-detune, 0, detune):
            x += osc('saw', vib(f * (1 + dt), d, 5, .006, .15), d)
    x = lp(x, cut, 2) * env(d, a, dec, sus, rel)
    return x / (3 * len(freqs)) * 2

def brass(f, d, a=0.04, sus=0.7, rel=0.12, bright=2200):
    t = tt(d); e = env(d, a, 0.25, sus, rel)
    x = osc('saw', vib(f, d, 5.2, .008, .2), d) + .5 * osc('saw', f * 1.003, d)
    return svf_lp(x, 300 + bright * e, 1.2) * e * 0.6

def choir(freqs, d, vowel='ah', a=0.15, rel=0.4):
    x = np.zeros(N(d))
    for f in freqs:
        for dt in (-.006, 0, .006):
            x += osc('saw', vib(f * (1 + dt), d, 5, .01, .1), d)
    return formant(x, vowel) * env(d, a, 9e9, 1, rel) / len(freqs) * 0.6

def howl(d=1.6, f0=n('A4'), peak=n('E5'), end=n('C#5'), scale=1.0):
    """Wolf howl: rising swoop, long held vibrato, falling tail; voiced 'oo' with a little breath."""
    k = np.linspace(0, 1, N(d))
    f = np.where(k < .18, f0 + (peak - f0) * (k / .18) ** .6,
         np.where(k < .7, peak, peak + (end - peak) * np.clip((k - .7) / .3, 0, 1) ** 1.6))
    f = f * scale * (1 + .012 * np.sin(2 * np.pi * 5.2 * k * d) * np.clip((k - .15) * 4, 0, 1))
    voice = osc('saw', f, d) * .6 + osc('sine', f, d)
    x = formant(voice, 'oo') * 1.6 + .5 * lp(osc('sine', f, d), 2000)
    x += .08 * bp(noise(d), 600, 2500) * (.5 + .5 * np.clip(1 - k * 2, 0, 1))
    return x * env(d, .12, 9e9, 1, .45)

def whoosh(d, f0=300, f1=3000, q=1.5, up=True):
    fc = glide(f0, f1, d)
    e = np.sin(np.pi * np.linspace(0, 1, N(d))) ** 2
    return svf_lp(noise(d), fc, q) * e * .5

def gun(d=1.6, echo=True, crack=0.7):
    t = tt(d)
    c = bp(noise(d), 1200, 5500) * np.exp(-t / .012) * crack
    b = impact(d, 120, 45, 300, .7, .8, .18)
    body = bp(noise(d), 180, 1500) * np.exp(-t / .1) * 1.2
    x = np.tanh(2.2 * (c + b + body)) * .8
    if echo:
        tail = lp(x, 1800)
        for dl, g in [(.21, .35), (.47, .2), (.8, .1)]:
            add(x, tail, dl, g)
    return x

def reverb(x, size=1.4, mix=0.25, damp=3500, pre=0.012, tail=None):
    L = tail or size * 1.1
    t = tt(L)
    ir = noise(L) * np.exp(-t * 6.9 / size)
    ir = lp(ir, damp, 1)
    ir[:N(pre)] = 0
    ir /= np.sqrt(np.sum(ir ** 2)) + 1e-9
    wet = fftconvolve(x, ir)[:len(x) + N(L)]
    dry = np.concatenate([x, np.zeros(len(wet) - len(x))])
    return dry * (1 - mix * .5) + wet * mix

def echo(x, dl=0.18, fb=0.35, n_=3, cut=2500):
    out = np.concatenate([x, np.zeros(N(dl * n_ + .05))]); src = x
    for i in range(1, n_ + 1):
        src = lp(src, cut, 1)
        add(out, src, dl * i, fb ** i)
    return out

def seq(notes, voice, step, d_note=None, gap=0.0, total=None):
    """notes: list of (note|None, beats) ; voice(f, dur)->array."""
    tot = total or sum(b for _, b in notes) * step + 1.5
    out = buf(tot); at = 0.0
    for nm, beats in notes:
        dur = d_note or beats * step
        if nm:
            for one in (nm if isinstance(nm, (list, tuple)) else [nm]):
                add(out, voice(n(one), dur + 0.25), at)
        at += beats * step + gap
    return out

def master(x, target_db=-15.0, ceil=0.89):
    x = hp(x, 70, 2)                       # phone speakers can't do sub; keep headroom for the mids
    x = lp(x, 9000, 2)                     # nothing fizzy
    # trim trailing silence
    a = np.abs(x); thr = a.max() * 10 ** (-48 / 20)
    last = np.nonzero(a > thr)[0][-1] if np.any(a > thr) else len(x) - 1
    x = x[:last + N(.05)]
    # loudness match on the loudest 150 ms window
    # loudness matched on what a phone speaker plays (above ~250 Hz), so deep hits aren't thin on phones
    ph = hp(x, 250, 2)
    w = N(.15); rms = np.sqrt(np.convolve(ph ** 2, np.ones(w) / w, 'valid').max())
    g = 10 ** ((target_db - 2) / 20) / (rms + 1e-9)
    g = min(g, 1.6 * ceil / np.abs(x).max())   # allow gentle saturation, never crushing
    x = np.tanh(x * g / ceil) * ceil       # soft limiter
    return fade(x, .04)

SOUNDS = {}
def sfx(pack, moment, name, note, target=-15.0):
    def deco(fn):
        SOUNDS[(pack, moment)] = dict(fn=fn, name=name, note=note, target=target)
        return fn
    return deco

# ======================= PACK: PIXEL (soft chiptune, matches the sprites) =======================
@sfx('pixel', 'nightDeath', 'Pixel grave', 'Quick falling arpeggio into a bonk. 0.9 s.', -16)
def _():
    o = buf(1.4)
    add(o, impact(.6, 220, 70, 330, .8, .4, .14), 0)
    for i, nm in enumerate(['A4', 'F4', 'D4']):
        add(o, chip(n(nm), .1, .5, .08, .4, 3000), .02 + i * .085, .55)
    add(o, tone('tri', glide(n('D3'), n('A2'), .55), .55, .004, .25, .2, .1), .28, 1.0)
    add(o, chip(n('D4'), .5, .125, .2, .2, 2400, .02), .28, .35)
    return reverb(o, .6, .15)

@sfx('pixel', 'voteOut', 'Pixel gavel', 'Two knocks, a low "da-dum". 0.8 s.', -16)
def _():
    o = buf(1.2)
    for at in (0, .14):
        add(o, tone('tri', glide(700, 180, .08), .08, .001, .03), at, .9)
        add(o, lp(noise(.03), 3000) * np.linspace(1, 0, N(.03)), at, .3)
    add(o, chip(n('E4'), .14, .5, .1, .5, 2800), .32, .6)
    add(o, chip(n('A3'), .4, .5, .18, .3, 2400, .015), .46, .7)
    add(o, tone('tri', n('A2'), .4, .004, .2), .46, .7)
    return reverb(o, .5, .12)

@sfx('pixel', 'shot', 'Pixel bang', 'Crunchy 8-bit bang with a canyon echo. 1.0 s.', -15)
def _():
    d = .45; t = tt(d)
    nz = np.repeat(rng.uniform(-1, 1, N(d) // 6 + 1), 6)[:N(d)]   # sample-held noise = NES flavour
    x = lp(nz, 5000) * np.exp(-t / .08)
    x += tone('pulse', glide(380, 50, d), d, .001, .08, 0, .05, .5, 2500) * .9
    x = np.tanh(1.5 * x)
    return echo(x, .17, .4, 3, 1800)

@sfx('pixel', 'calm', 'Pixel sunrise', 'Gentle rising major arpeggio with a twinkle. 0.9 s.', -18)
def _():
    o = buf(1.4)
    for i, nm in enumerate(['D5', 'F#5', 'A5', 'D6']):
        add(o, chip(n(nm), .16, .5, .1, .25, 3500), i * .07, .5)
    add(o, chip(n('A6'), .3, .125, .12, .1, 4000), .32, .25)
    add(o, tone('tri', n('D4'), .5, .01, .3), 0, .5)
    return echo(o, .12, .3, 2)

@sfx('pixel', 'tie', 'Pixel shrug', 'Two soft notes that bend down: "huh". 0.7 s.', -18)
def _():
    o = buf(1.0)
    add(o, chip(n('G4'), .14, .5, .1, .5, 2600), 0, .7)
    add(o, chip(glide(n('F#4'), n('E4'), .38), .38, .5, .25, .4, 2400, .02), .16, .7)
    add(o, tone('tri', n('C3'), .45, .005, .2), 0, .6)
    return reverb(o, .5, .12)

@sfx('pixel', 'prince', 'Pixel royal', 'Short 8-bit fanfare, held top note. 1.5 s.', -16)
def _():
    o = buf(2.0); s = .09
    mel = [('G4', 1), ('C5', 1), ('E5', 1), ('G5', 2), ('E5', 1), ('C6', 5)]
    at = 0
    for nm, b in mel:
        add(o, chip(n(nm), b * s + .05, .25, .15, .55, 3600, .015 if b > 3 else 0), at, .55)
        at += b * s
    for nm, at2 in [('C3', 0), ('G3', .27), ('C4', .54)]:
        add(o, tone('tri', n(nm), .3, .004, .15, .3), at2, .6)
    add(o, tone('tri', n('C3'), .8, .004, .4, .3, .2), at - 5 * s, .6)
    return reverb(o, .7, .15)

@sfx('pixel', 'jester', 'Pixel boing', 'Spring "boing" then a silly "doot-doot". 1.2 s.', -16)
def _():
    o = buf(1.6); d = .35; t = tt(d)
    f = 220 * (1 + 1.6 * (1 - np.exp(-t / .1))) * (1 + .18 * np.sin(2 * np.pi * 14 * t) * np.exp(-t / .2))
    add(o, tone('pulse', f, d, .002, .2, 0, .05, .25, 3200), 0, .7)
    for i, nm in enumerate(['C5', 'B4', 'Bb4']):
        add(o, chip(n(nm), .12, .5, .07, .4, 3000), .4 + i * .13, .55)
    add(o, chip(glide(n('A4'), n('F4'), .35), .35, .5, .2, .4, 2600, .03), .79, .6)
    return reverb(o, .5, .12)

@sfx('pixel', 'spared', 'Pixel phew', 'Click, then a relieved little rise. 0.7 s.', -18)
def _():
    o = buf(1.0)
    add(o, tone('pulse', glide(1400, 600, .03), .03, .001, .01), 0, .4)
    add(o, chip(n('G4'), .12, .5, .1, .4, 2800), .12, .55)
    add(o, chip(n('C5'), .35, .5, .2, .3, 2800, .01), .24, .55)
    return reverb(o, .5, .12)

@sfx('pixel', 'nightfall', 'Pixel howl', 'An 8-bit wolf howl with echo. 1.4 s.', -17)
def _():
    d = 1.0; k = np.linspace(0, 1, N(d))
    f = np.where(k < .2, n('A4') + (n('E5') - n('A4')) * (k / .2) ** .5, np.where(k < .7, n('E5'), n('E5') + (n('A4') - n('E5')) * ((k - .7) / .3)))
    x = tone('pulse', vib(f, d, 6, .015, .2), d, .05, 9e9, 1, .3, .5, 2600) * .7
    x += tone('tri', f / 2, d, .05, 9e9, 1, .3) * .4
    return echo(x, .22, .35, 2, 1600)

@sfx('pixel', 'villageWin', 'Pixel victory', 'Bright little victory tune. 2.2 s.', -15)
def _():
    o = buf(3.0); s = .11
    mel = [('D5', 1), ('F#5', 1), ('A5', 1), ('D6', 3), ('B5', 1), ('C#6', 1), ('D6', 6)]
    at = 0
    for nm, b in mel:
        add(o, chip(n(nm), b * s + .04, .25, .14, .55, 3600, .015 if b > 4 else 0), at, .5)
        add(o, chip(n(nm) / 2 * 1.4983, b * s + .04, .5, .14, .4, 2600), at, .18)   # fifth below-ish harmony
        at += b * s
    bass = [('D3', 0), ('A3', 3), ('D3', 6), ('G3', 9), ('A3', 11), ('D3', 13)]
    for nm, b in bass:
        add(o, tone('tri', n(nm), .3 if b < 13 else .9, .004, .15 if b < 13 else .5, .3), b * s, .6)
    add(o, lp(noise(.06), 4000) * np.linspace(1, 0, N(.06)), 13 * s, .25)
    return reverb(o, .6, .14)

@sfx('pixel', 'wolvesWin', 'Pixel doom', 'Minor theme that sinks, ends in a howl. 2.3 s.', -15)
def _():
    o = buf(3.2); s = .13
    mel = [('D5', 1), ('F5', 1), ('A5', 2), ('G#5', 2), ('D5', 5)]
    at = 0
    for nm, b in mel:
        add(o, chip(n(nm), b * s + .04, .5, .16, .5, 2800, .02 if b > 3 else 0), at, .5)
        at += b * s
    for nm, b in [('D3', 0), ('D3', 2), ('Bb2', 4), ('A2', 6)]:
        add(o, tone('tri', n(nm), .3, .004, .2, .3), b * s, .7)
    add(o, tone('tri', glide(n('D3'), n('D2'), .9), .9, .004, .5, .2), 6 * s + 2 * s, .7)
    d = .9; k = np.linspace(0, 1, N(d))
    f = n('A4') * (1 + .5 * np.sin(np.pi * k) ** .7)
    add(o, tone('pulse', vib(f, d, 6, .015, .1), d, .05, 9e9, 1, .3, .5, 2400), 1.5, .3)
    return reverb(o, .7, .15)

@sfx('pixel', 'jesterWin', 'Pixel prank', 'Bouncy chromatic tumble with a honk. 2.0 s.', -15)
def _():
    o = buf(2.6); s = .09
    mel = ['C5', 'E5', 'G5', 'C6', 'B5', 'Bb5', 'A5', 'Ab5', 'G5']
    for i, nm in enumerate(mel):
        add(o, chip(n(nm), s + .05, .25, .08, .4, 3400), i * s, .5)
        add(o, tone('tri', n('C3') if i % 2 == 0 else n('G3'), s, .003, .06, .2), i * s, .5)
    at = len(mel) * s + .05
    for j in range(2):
        add(o, tone('pulse', n('C4') * (1 + .03 * np.sin(2*np.pi*30*tt(.16))), .16, .005, .1, .5, .03, .5, 1800), at + j * .2, .5)
    add(o, chip(n('C6'), .5, .125, .2, .3, 3600, .03), at + .45, .4)
    add(o, tone('tri', n('C3'), .5, .004, .3), at + .45, .6)
    return reverb(o, .5, .12)

# ======================= PACK: STORYBOOK (bells, harp, pizzicato, timpani, warm brass) =======================
@sfx('story', 'nightDeath', 'Storybook toll', 'Timpani hit, a single low bell, celesta sigh. 1.5 s.', -16)
def _():
    o = buf(2.2)
    add(o, timpani(n('D2'), 1.2, .4), 0, .9)
    add(o, wood(260, .2), 0, .5)
    add(o, toll(n('D4'), 1.8, 1.0), .02, .55)
    for i, nm in enumerate(['F5', 'D5', 'A4']):
        add(o, celesta(n(nm), .9, .5), .18 + i * .12, .28)
    return reverb(o, 1.0, .22)

@sfx('story', 'voteOut', 'Storybook gavel', 'Wooden gavel, pizzicato "dum-dum". 1.0 s.', -16)
def _():
    o = buf(1.5)
    add(o, wood(480, .25), 0, .9); add(o, wood(430, .25), .15, 1.0)
    add(o, pluck(n('D3'), .6, .5, .995), .32, .9)
    add(o, pluck(n('A2'), .8, .45, .996), .5, 1.0)
    add(o, timpani(n('A2'), .7, .25), .5, .4)
    return reverb(o, .8, .18)

@sfx('story', 'shot', 'Storybook musket', 'Musket crack, valley echo, a fading bell. 1.6 s.', -15)
def _():
    o = buf(2.2)
    add(o, gun(1.5, True, .6), 0, 1.0)
    add(o, toll(n('A3'), 1.6, .8), .05, .18)
    return reverb(o, 1.2, .2)

@sfx('story', 'calm', 'Storybook morning', 'Harp sweep up, glockenspiel sparkle. 1.3 s.', -18)
def _():
    o = buf(2.0)
    for i, nm in enumerate(['D4', 'F#4', 'A4', 'D5', 'F#5', 'A5']):
        add(o, pluck(n(nm), 1.0, .5, .997), i * .055, .5)
    add(o, glock(n('D6'), 1.0, .6), .36, .3)
    add(o, glock(n('A6'), .8, .5), .48, .18)
    return reverb(o, 1.0, .22)

@sfx('story', 'tie', 'Storybook shrug', 'Two plucks that lean down, a soft woodblock. 0.8 s.', -18)
def _():
    o = buf(1.3)
    add(o, pluck(n('A3'), .6, .5, .995), 0, .8)
    add(o, pluck(n('G#3'), .8, .45, .995), .2, .8)
    add(o, wood(700, .15), .42, .25)
    return reverb(o, .8, .18)

@sfx('story', 'prince', 'Storybook fanfare', 'Warm brass fanfare over timpani. 1.8 s.', -15)
def _():
    o = buf(2.5); s = .1
    mel = [('D4', 1), ('A4', 1), ('D5', 3), ('F#5', 1), ('A5', 7)]
    at = 0
    for nm, b in mel:
        dd = b * s + (.25 if b > 5 else .02)
        add(o, brass(n(nm), dd, .02, .7, .1), at, .6)
        if b > 5:
            add(o, brass(n('D5'), dd, .03, .6, .1), at, .35); add(o, brass(n('F#4'), dd, .03, .6, .1), at, .3)
        at += b * s
    for b in (0, 1, 2, 5):
        add(o, timpani(n('D2') if b != 5 else n('A2'), .6, .2), b * s, .45)
    add(o, timpani(n('D2'), 1.0, .45), 6 * s, .6)
    add(o, glock(n('A5'), 1, .7), 6 * s, .2)
    return reverb(o, 1.1, .22)

@sfx('story', 'jester', 'Storybook honk', 'Slide whistle up, two clown honks, bells. 1.4 s.', -16)
def _():
    o = buf(2.0); d = .35; t = tt(d)
    f = glide(500, 1500, d)
    sw = osc('sine', f * (1 + .01 * np.sin(2*np.pi*7*t)), d) * env(d, .03, 9e9, 1, .06) + .05 * bp(noise(d), 900, 3000)
    add(o, sw, 0, .5)
    def honk(d=.16, f=330):
        t = tt(d)
        x = osc('saw', f * (1 + .02 * np.sin(2*np.pi*35*t)), d) + osc('saw', f * 1.26, d) * .7
        return formant(x, 'eh') * env(d, .01, 9e9, 1, .04) * 1.4
    add(o, honk(), .42, .7); add(o, honk(.22, 300), .62, .7)
    for i, nm in enumerate(['C6', 'E6', 'G6']):
        add(o, glock(n(nm), .7, .4), .9 + i * .06, .2)
    return reverb(o, .8, .18)

@sfx('story', 'spared', 'Storybook phew', 'Soft click, a breath, two rising harp notes. 0.9 s.', -18)
def _():
    o = buf(1.4)
    add(o, wood(1600, .05), 0, .3)
    d = .4; add(o, bp(noise(d), 500, 2200) * np.sin(np.pi * np.linspace(0, 1, N(d))) ** 2, .05, .12)
    add(o, pluck(n('G4'), .8, .5, .996), .15, .6)
    add(o, pluck(n('D5'), 1.0, .5, .997), .3, .6)
    return reverb(o, .9, .2)

@sfx('story', 'nightfall', 'Storybook lullaby', 'Four-note celesta lullaby falling into night. 1.5 s.', -18)
def _():
    o = buf(2.4)
    for i, nm in enumerate(['A5', 'F5', 'E5', 'D5']):
        add(o, celesta(n(nm), 1.2, .55 if i < 3 else .9), i * .2, .5)
    add(o, toll(n('D3'), 1.6, 1.0), .6, .25)
    add(o, strings([n('D3'), n('A3')], 1.3, .3, .5, .5, .5, 1200), .2, .25)
    return reverb(o, 1.3, .28)

@sfx('story', 'villageWin', 'Storybook triumph', 'Harp, brass and bells, a big D-major ending. 2.6 s.', -15)
def _():
    o = buf(3.6); s = .12
    mel = [('D5', 1), ('E5', 1), ('F#5', 1), ('A5', 2), ('F#5', 1), ('B5', 2), ('A5', 8)]
    at = 0
    for nm, b in mel:
        dd = b * s + (.4 if b > 6 else .02)
        add(o, brass(n(nm), dd, .02, .7, .12), at, .5)
        add(o, pluck(n(nm), .8, .6, .996), at, .3)
        at += b * s
    end = at - 8 * s
    for nm in ['D4', 'F#4', 'A4']:
        add(o, brass(n(nm), 8 * s + .4, .05, .6, .25, 1500), end, .25)
    for i, nm in enumerate(['D4', 'F#4', 'A4', 'D5', 'F#5', 'A5', 'D6']):
        add(o, pluck(n(nm), 1.2, .55, .997), end + i * .04, .28)
    add(o, timpani(n('D2'), 1.4, .6), end, .6)
    add(o, glock(n('D6'), 1.4, .9), end + .2, .25)
    for b in (0, 2, 3, 5, 6):
        add(o, timpani(n('A2') if b % 2 else n('D2'), .4, .15), b * s, .3)
    return reverb(o, 1.3, .22)

@sfx('story', 'wolvesWin', 'Storybook shadow', 'Low strings, three bell tolls, a distant howl. 2.8 s.', -15)
def _():
    o = buf(3.8)
    add(o, strings([n('D3'), n('F3'), n('A3')], 2.8, .15, .8, .6, .7, 1500), 0, .6)
    add(o, strings([n('D2')], 2.8, .15, .8, .6, .7, 900), 0, .5)
    for i, nm in enumerate(['A3', 'F3', 'D3']):
        add(o, toll(n(nm), 2.0, 1.0), i * .45, .45)
        add(o, timpani(n('D2'), .8, .3), i * .45, .4)
    add(o, howl(1.6, n('D5'), n('A5'), n('F5')), 1.35, .22)
    return reverb(o, 1.6, .28)

@sfx('story', 'jesterWin', 'Storybook carnival', 'Music-box waltz that trips over itself, honk. 2.4 s.', -15)
def _():
    o = buf(3.2); s = .13
    mel = [('C6', 1), ('G5', 1), ('E5', 1), ('C6', 1), ('G5', 1), ('E5', 1), ('F#5', 1), ('G5', 1), ('C#6', 1), ('C6', 3)]
    at = 0
    for i, (nm, b) in enumerate(mel):
        add(o, glock(n(nm), .7, .4), at, .4)
        add(o, celesta(n(nm) / 2, .5, .3), at, .2)
        if i % 3 == 0: add(o, pluck(n('C3') if i < 6 else n('G2'), .5, .4, .994), at, .7)
        else: add(o, pluck(n('G3'), .3, .5, .993), at, .35)
        at += b * s
    def honk(d=.2, f=300):
        t = tt(d)
        x = osc('saw', f * (1 + .02 * np.sin(2*np.pi*35*t)), d) + osc('saw', f * 1.26, d) * .7
        return formant(x, 'eh') * env(d, .01, 9e9, 1, .04) * 1.4
    add(o, honk(), at - 3 * s + .05, .55)
    add(o, pluck(n('C3'), 1.0, .4, .996), at - 3 * s, .8)
    return reverb(o, 1.0, .2)

# ======================= PACK: MIDNIGHT (cinematic, dark, big room) =======================
@sfx('midnight', 'nightDeath', 'Midnight impact', 'Deep hit with a dark minor stab and long-ish room. 1.5 s.', -15)
def _():
    o = buf(2.2)
    add(o, impact(1.2, 140, 40, 220, .8, .7, .4), 0, 1.0)
    add(o, strings([n('D3'), n('F3'), n('A3'), n('D4')], 1.1, .005, .35, .0, .3, 2000), 0, .7)
    add(o, toll(n('D3'), 1.6, .9), 0, .35)
    return reverb(o, 1.5, .28)

@sfx('midnight', 'voteOut', 'Midnight verdict', 'Low brass "braam" that closes down. 1.2 s.', -15)
def _():
    o = buf(1.8); d = 1.0
    e = env(d, .01, .35, .15, .2)
    x = sum(osc('saw', f * (1 + dt), d) for f in (n('D2'), n('A2'), n('D3'), n('F3')) for dt in (-.004, .004))
    x = svf_lp(x, 250 + 2200 * e, 1.4) * e / 6
    add(o, x, 0, 1.0)
    add(o, impact(.8, 120, 45, 200, .6, .5, .25), 0, .7)
    add(o, wood(380, .2), 0, .3)
    return reverb(o, 1.4, .25)

@sfx('midnight', 'shot', 'Midnight gunshot', 'Real-ish shot, rolling echo over the hills. 1.8 s.', -15)
def _():
    o = buf(2.4)
    add(o, gun(1.8, True, .8), 0, 1.0)
    add(o, impact(1.0, 90, 40, 180, .3, .2, .5), .02, .4)
    return reverb(o, 1.8, .3)

@sfx('midnight', 'calm', 'Midnight dawn', 'Warm swell that opens into light. 1.3 s.', -19)
def _():
    o = buf(2.0); d = 1.3
    add(o, strings([n('D4'), n('F#4'), n('A4'), n('D5')], d, .35, .5, .7, .5, 2200), 0, .7)
    add(o, choir([n('A4'), n('D5')], d, 'ah', .4, .5), 0, .4)
    for i, nm in enumerate(['A5', 'D6', 'F#6']):
        add(o, glock(n(nm), .8, .5), .35 + i * .09, .16)
    return reverb(o, 1.6, .3)

@sfx('midnight', 'tie', 'Midnight unresolved', 'Two low bells a tritone apart, hanging. 1.0 s.', -18)
def _():
    o = buf(1.6)
    add(o, toll(n('C4'), 1.3, .7), 0, .5)
    add(o, toll(n('F#3'), 1.3, .7), .18, .5)
    add(o, strings([n('C3'), n('F#3')], 1.0, .1, .5, .3, .4, 1100), 0, .35)
    return reverb(o, 1.3, .25)

@sfx('midnight', 'prince', 'Midnight crown', 'Shimmering major hit with a choir "aah". 1.8 s.', -15)
def _():
    o = buf(2.6); d = 1.6
    add(o, impact(.8, 130, 50, 260, .5, .4, .3), 0, .6)
    add(o, choir([n('D4'), n('F#4'), n('A4'), n('D5')], d, 'ah', .05, .6), 0, .8)
    add(o, strings([n('D3'), n('A3'), n('F#4')], d, .01, .5, .5, .6, 2600), 0, .5)
    for i, nm in enumerate(['D6', 'F#6', 'A6', 'D7']):
        add(o, glock(n(nm), .9, .5), .1 + i * .07, .12)
    return reverb(o, 1.8, .3)

@sfx('midnight', 'jester', 'Midnight twist', 'Three hits climbing to a wrong note, then a sparkle. 1.6 s.', -15)
def _():
    o = buf(2.3)
    for i, (nm, dd) in enumerate([('D3', .25), ('F3', .25), ('G#3', .9)]):
        add(o, impact(.5, 130, 50, 230, .6, .4, .2), i * .26, .6)
        add(o, brass(n(nm), dd, .01, .6, .1, 1800), i * .26, .5)
        add(o, brass(n(nm) * 2, dd, .01, .6, .1, 1600), i * .26, .25)
    for i, nm in enumerate(['G#5', 'C6', 'D#6', 'G#6']):
        add(o, glock(n(nm), .7, .4), .62 + i * .05, .14)
    return reverb(o, 1.4, .25)

@sfx('midnight', 'spared', 'Midnight release', 'Tension breathes out into a soft major chord. 1.1 s.', -19)
def _():
    o = buf(1.7)
    add(o, whoosh(.5, 3000, 400, 1.2), 0, .5)
    add(o, strings([n('G3'), n('B3'), n('D4')], 1.1, .2, .5, .5, .5, 1600), .25, .6)
    add(o, choir([n('D4'), n('G4')], 1.0, 'oh', .25, .5), .25, .35)
    return reverb(o, 1.4, .28)

@sfx('midnight', 'nightfall', 'Midnight howl', 'A lone wolf howl over cold wind. 1.8 s.', -17)
def _():
    o = buf(2.6)
    d = 2.2; add(o, svf_lp(noise(d), 500 + 300 * np.sin(np.linspace(0, 3, N(d))), 2) * env(d, .4, 9e9, 1, .8), 0, .25)
    add(o, howl(1.7), .1, 1.0)
    return reverb(o, 2.0, .35)

@sfx('midnight', 'villageWin', 'Midnight sunrise', 'Big warm swell, choir and bells, sun is up. 2.8 s.', -15)
def _():
    o = buf(3.8); d = 2.6
    add(o, impact(1.2, 120, 45, 240, .5, .4, .5), 0, .6)
    add(o, strings([n('D3'), n('A3'), n('D4'), n('F#4'), n('A4')], d, .25, .8, .8, .9, 2600), 0, .8)
    add(o, choir([n('F#4'), n('A4'), n('D5')], d, 'ah', .3, .9), .1, .6)
    for i, nm in enumerate(['D5', 'F#5', 'A5', 'D6', 'F#6', 'A6']):
        add(o, glock(n(nm), 1.2, .9), .5 + i * .1, .18)
    add(o, toll(n('D4'), 2.0, 1.4), .5, .25)
    return reverb(o, 2.2, .3)

@sfx('midnight', 'wolvesWin', 'Midnight pack', 'Massive dark hit, minor drone, two wolves howling. 3.0 s.', -15)
def _():
    o = buf(4.0); d = 2.8
    add(o, impact(1.6, 120, 35, 200, .8, .7, .6), 0, 1.0)
    add(o, strings([n('D2'), n('D3'), n('F3'), n('A3')], d, .01, .9, .6, 1.0, 1400), 0, .7)
    add(o, toll(n('D3'), 2.2, 1.4), 0, .35)
    add(o, howl(1.8), .5, .55)
    add(o, howl(1.6, n('F4'), n('C5'), n('A4')), .85, .4)
    return reverb(o, 2.2, .33)

@sfx('midnight', 'jesterWin', 'Midnight trickster', 'Warped music box over a dark chord, laughing bells. 2.5 s.', -15)
def _():
    o = buf(3.4); s = .14
    mel = ['E6', 'C6', 'A5', 'C6', 'E6', 'D#6', 'D6', 'C#6', 'C6']
    for i, nm in enumerate(mel):
        f = n(nm) * (1 + .012 * np.sin(i * 1.7))       # slightly warped tuning
        add(o, celesta(f, .6, .4), i * s, .35)
    add(o, strings([n('A2'), n('C3'), n('E3')], 1.8, .05, .8, .6, .6, 1300), 0, .5)
    end = len(mel) * s
    add(o, impact(.9, 130, 45, 230, .6, .4, .3), end, .6)
    add(o, choir([n('A3'), n('C4'), n('E4'), n('G#4')], 1.0, 'ah', .02, .5), end, .5)
    for i in range(5):
        add(o, glock(n('A6') * (1 - .03 * i), .4, .2), end + .1 + i * .07, .12)
    return reverb(o, 1.6, .28)

# ---------------------------------------------------------------------------
if __name__ == '__main__':
    import wave
    OUT = sys.argv[1] if len(sys.argv) > 1 else 'out'
    os.makedirs(OUT, exist_ok=True)
    meta = []
    for (pack, moment), s in SOUNDS.items():
        x = master(s['fn'](), s['target'])
        base = f'{pack}-{moment}'
        wav = os.path.join(OUT, base + '.wav')
        with wave.open(wav, 'w') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())
        mp3 = os.path.join(OUT, base + '.mp3')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '96k', mp3], check=True)
        peak = 20 * np.log10(np.abs(x).max())
        meta.append(dict(pack=pack, moment=moment, name=s['name'], note=s['note'], file=base + '.mp3',
                         dur=round(len(x) / SR, 2), peak=round(float(peak), 1), kb=round(os.path.getsize(mp3) / 1024, 1)))
        print(f'{base:28s} {len(x)/SR:5.2f}s peak {peak:5.1f} dB  {meta[-1]["kb"]} KB', flush=True)
    json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w'), indent=1)
