"""Музыка и звук демо-ролика «Фотопринт» (53 с).

120 ударов в минуту, ре мажор, гармония Bm–G–D–A. Звуковой знак «па-па-пам» — в начале (2-я секунда) и в финале (48-я).
Сцены начинаются ударом на сильную долю; щелчки и касания берутся из монтажного листа edl.py — звук совпадает с картинкой.

    python music.py [out.wav]   → WAV 48 кГц, стерео, громкость около −14 LUFS
"""
import sys
import wave
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.ndimage import minimum_filter1d

import edl

SR = 48000
DUR = edl.DUR + .2
N = int(SR * DUR)
BEAT, BAR = .5, 2.0
rng = np.random.default_rng(20260929)
OUT = sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).parent / 'mix.wav')

BUSES = ['kick', 'drums', 'bass', 'pad', 'arp', 'lead', 'bell', 'fx', 'sfx']
BUS = {k: np.zeros((2, N)) for k in BUSES}
VERB = np.zeros((2, N))      # посыл на ревербератор
DELAY = np.zeros((2, N))     # посыл на пинг-понг задержку


# ─────────────── основа ───────────────
def tt(d):
    return np.arange(int(d * SR)) / SR


def noise(d):
    return rng.standard_normal(int(d * SR))


def sos(kind, f, order=2):
    return signal.butter(order, f, kind, fs=SR, output='sos')


def lp(x, f, order=2):
    return signal.sosfilt(sos('low', min(f, SR * .45), order), x)


def hp(x, f, order=2):
    return signal.sosfilt(sos('high', f, order), x)


def bp(x, f1, f2, order=2):
    return signal.sosfilt(sos('band', [f1, min(f2, SR * .45)], order), x)


def sweep(x, fc, kind='band', width=.7, block=256):
    """фильтр с меняющейся частотой: блоками с переносом состояния"""
    y = np.zeros_like(x)
    zi = None
    for i in range(0, len(x), block):
        c = float(np.clip(fc[min(i, len(fc) - 1)], 40, SR * .42))
        s = sos('band', [c / 2 ** (width / 2), min(c * 2 ** (width / 2), SR * .45)]) if kind == 'band' else sos(kind, c)
        if zi is None:
            zi = np.zeros((s.shape[0], 2))
        y[i:i + block], zi = signal.sosfilt(s, x[i:i + block], zi=zi)
    return y


def saw(freq, n, ph0=0.0):
    """пилообразная волна без алиасинга (polyBLEP)"""
    f = np.broadcast_to(np.asarray(freq, float), (n,))
    dt = f / SR
    ph = (ph0 + np.cumsum(dt)) % 1.0
    y = 2 * ph - 1
    m = ph < dt
    x = ph[m] / dt[m]
    y[m] -= x + x - x * x - 1
    m = ph > 1 - dt
    x = (ph[m] - 1) / dt[m]
    y[m] -= x * x + x + x + 1
    return y


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def pan2(sig, pan=0.0):
    a = (pan + 1) * np.pi / 4
    return np.vstack([sig * np.cos(a) * np.sqrt(2), sig * np.sin(a) * np.sqrt(2)])


def put(bus, sig, t0, gain=1.0, pan=0.0, verb=0.0, delay=0.0):
    i0 = int(round(t0 * SR))
    if sig.ndim == 1:
        sig = pan2(sig, pan)
    if i0 < 0:
        sig, i0 = sig[:, -i0:], 0
    n = min(sig.shape[1], N - i0)
    if n <= 0:
        return
    s = sig[:, :n] * gain
    BUS[bus][:, i0:i0 + n] += s
    if verb:
        VERB[:, i0:i0 + n] += s * verb
    if delay:
        DELAY[:, i0:i0 + n] += s * delay


# ─────────────── инструменты ───────────────
def mk_kick():
    x = tt(.5)
    f = 50 + 120 * np.exp(-x / .03) + 60 * np.exp(-x / .005)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x / .17) * np.minimum(1, x / .0012)
    click = hp(noise(.5), 2500) * np.exp(-x / .0035) * .3
    return np.tanh(1.7 * (body + click)) / np.tanh(1.7)


def mk_clap():
    x = tt(.4)
    b = bp(noise(.4), 900, 4200)
    e = sum(np.exp(-np.maximum(x - o, 0) / .007) * (x >= o) for o in (0, .012, .024))
    e = e + .7 * np.exp(-np.maximum(x - .03, 0) / .11) * (x >= .03)
    return b * e * .55


def mk_snare():
    x = tt(.3)
    tone = np.sin(2 * np.pi * 185 * x) * np.exp(-x / .045) * .45
    nz = bp(noise(.3), 1800, 9500) * np.exp(-x / .06)
    return tone + nz


def mk_hat(open_=False):
    d = .45 if open_ else .09
    x = tt(d)
    met = sum(np.sign(np.sin(2 * np.pi * f * x + p)) for f, p in ((3140, .3), (4590, 1.2), (6150, 2.1), (7730, .7)))
    s = hp(noise(d), 7200, 4) + hp(met, 6500) * .08
    return s * np.exp(-x / (.17 if open_ else .024)) * .5


def mk_shaker():
    x = tt(.12)
    return bp(noise(.12), 5200, 11000) * np.minimum(1, x / .006) * np.exp(-x / .04) * .5


def mk_crash(d=2.6):
    x = tt(d)
    out = []
    for _ in range(2):
        met = hp(sum(np.sin(2 * np.pi * f * x + rng.uniform(0, 6)) for f in rng.uniform(3200, 9500, 28)), 3200) * .05
        n = hp(noise(d), 3800) * .55
        out.append((n + met) * np.exp(-x / .75) * np.minimum(1, x / .002))
    return np.vstack(out)


def mk_impact(size=1.0):
    d = 3.0
    x = tt(d)
    f = 29 + 75 * np.exp(-x / .11)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x / (.55 * size + .25))
    body = lp(noise(d), 1100) * np.exp(-x / .14) * .55
    thump = lp(noise(d), 180) * np.exp(-x / .05) * .7
    s = np.tanh(1.4 * (sub + body + thump))
    tail = hp(noise(d), 2500) * np.exp(-x / .5) * .06 * size
    return np.vstack([s + tail, s + np.roll(tail, 331)])


def mk_riser(d, f0=250, f1=9000, tone=0.0):
    n = int(d * SR)
    p = np.arange(n) / n
    fc = f0 * (f1 / f0) ** (p ** 1.3)
    env = p ** 2.2
    L = sweep(noise(d)[:n], fc, 'band', .9) * env
    R = sweep(noise(d)[:n], fc, 'band', .9) * env
    if tone:
        ts = lp(saw(180 * 4 ** p, n), 3000) * p ** 2.5 * .25 * tone
        L, R = L + ts, R + ts
    return np.vstack([L, R])


def mk_revcym(d=1.2):
    c = mk_crash(d + .4)[:, :int(d * SR)]
    return c[:, ::-1] * np.linspace(0, 1, c.shape[1]) ** 1.5


def mk_whoosh(d=.9, bright=1.0):
    n = noise(d)
    p = np.arange(len(n)) / len(n)
    fc = 380 * (5.5 * bright) ** np.sin(np.pi * p)
    s1 = sweep(n, fc, 'band', 1.1)
    s2 = sweep(noise(d), fc * 1.08, 'band', 1.1)
    e = np.sin(np.pi * p) ** 1.8
    g = np.linspace(-.6, .6, len(n))           # проносится слева направо
    return np.vstack([s1 * e * np.sqrt(.5 * (1 - g)) * 1.4, s2 * e * np.sqrt(.5 * (1 + g)) * 1.4])


def bell(f, d=2.4, idx=3.2, ratio=2.0, decay=.9):
    x = tt(d)
    i = idx * np.exp(-x / .22)
    s = np.sin(2 * np.pi * f * x + i * np.sin(2 * np.pi * f * ratio * x))
    s += .25 * np.sin(2 * np.pi * f * 2.001 * x) * np.exp(-x / .3)
    return s * np.exp(-x / decay) * np.minimum(1, x / .0015)


def pluck(f, d=.34, bright=1.0):
    x = tt(d)
    raw = .6 * saw(f, len(x)) + .4 * saw(f * 1.004, len(x), .3)
    hi = lp(raw, 4200 * bright) * np.exp(-x / .045)
    lo = lp(raw, 1300 * bright) * np.exp(-x / .16)
    return (hi + lo) * np.minimum(1, x / .0018)


def bass_note(f, d, style='pluck'):
    x = tt(d)
    s = .6 * np.sin(2 * np.pi * f * x) + .65 * lp(saw(f, len(x)), 1100 if style == 'pluck' else 650)
    if style == 'pluck':
        e = np.minimum(1, x / .004) * np.exp(-x / .3)
    else:
        e = np.minimum(1, x / .05) * (.85 + .15 * np.exp(-x / .3))
    e *= np.minimum(1, (d - x) / .012).clip(0, 1)
    return np.tanh(1.3 * s * e)


def pad_chord(notes, d, bright=1800, att=.4, rel=.9):
    n = int((d + rel) * SR)
    x = np.arange(n) / SR
    L, R = np.zeros(n), np.zeros(n)
    for m in notes:
        f = midi(m)
        for c, side in ((-11, 0), (-4, 0), (4, 1), (11, 1)):
            s = saw(f * 2 ** (c / 1200), n, rng.uniform())
            if side == 0:
                L += s
            else:
                R += s
    e = np.minimum(1, x / att) * np.where(x > d, np.exp(-(x - d) / (rel / 3)), 1)
    L, R = lp(L, bright) * e, lp(R, bright) * e
    return np.vstack([L, R]) / (len(notes) * 2)


def lead_note(f, d):
    x = tt(d + .35)
    vib = 1 + .0045 * np.sin(2 * np.pi * 5.3 * x) * np.clip((x - .15) / .3, 0, 1)
    s = .55 * saw(f * vib, len(x)) + .45 * saw(f * 1.0035 * vib, len(x), .5)
    s = lp(s, 2800) + .35 * np.sin(2 * np.pi * f * x)
    e = np.minimum(1, x / .012) * (.72 + .28 * np.exp(-x / .18)) * np.where(x > d, np.exp(-(x - d) / .09), 1)
    return s * e


def tick(freq=2300, level=1.0):
    x = tt(.06)
    return (np.sin(2 * np.pi * freq * x) * np.exp(-x / .012) * .6 + hp(noise(.06), 3000) * np.exp(-x / .003) * .5) * level


KICK, CLAP, SNARE = mk_kick(), mk_clap(), mk_snare()
HAT, OHAT, SHAKER = mk_hat(), mk_hat(True), mk_shaker()

# ─────────────── гармония ───────────────
# Bm – G – D – A: бас, аккорд пэда, ноты арпеджио, мелодия
PROG = [
    dict(bass=35, pad=[59, 62, 66, 69], arp=[71, 74, 78, 81, 83, 86]),
    dict(bass=31, pad=[55, 59, 62, 66], arp=[67, 71, 74, 78, 79, 83]),
    dict(bass=38, pad=[57, 62, 66, 69], arp=[69, 74, 78, 81, 86, 90]),
    dict(bass=33, pad=[57, 61, 64, 69], arp=[69, 73, 76, 81, 85, 88]),
]
ARP_PAT = [0, 2, 4, 2, 1, 3, 5, 3, 0, 2, 4, 5, 4, 2, 1, 3]
MELODY = [  # (такт 0–3, доля, длительность в долях, нота)
    (0, 0, 1, 78), (0, 1, .5, 81), (0, 1.5, .5, 78), (0, 2, 1, 76), (0, 3, 1, 74),
    (1, 0, 1, 74), (1, 1, .5, 76), (1, 1.5, .5, 74), (1, 2, 2, 71),
    (2, 0, .5, 69), (2, .5, .5, 74), (2, 1, 1, 78), (2, 2, 1, 81), (2, 3, 1, 78),
    (3, 0, 1.5, 76), (3, 1.5, .5, 73), (3, 2, 1, 76), (3, 3, 1, 69),
]

KICKS = []


def kick_at(t, g=1.0):
    put('kick', KICK, t, .95 * g)
    KICKS.append(t)


def section(t0, t1, energy, drums='full', lead=False, arp_bright=1.0, pad_bright=1900, bass_style='pluck',
            claps=True, shaker=True, arp=True, arp_gain=1.0, bars_offset=0, kick_until=None):
    """играет сетку тактов от t0 до t1 (последний такт может быть неполным); аккорды — с bars_offset"""
    kick_until = t1 if kick_until is None else kick_until

    def P(bus, sig, t, *a, **k):
        if t < t1 - 1e-6:
            put(bus, sig, t, *a, **k)

    def K(t, g=1.0):
        if t < min(t1, kick_until) - 1e-6:
            kick_at(t, g)

    nb = int(np.ceil((t1 - t0) / BAR - 1e-6))
    for b in range(nb):
        tb = t0 + b * BAR
        ch = PROG[(b + bars_offset) % 4]
        put('pad', pad_chord(ch['pad'], min(BAR, t1 - tb), pad_bright), tb, .5 * (.7 + .3 * energy), verb=.35)
        if bass_style == 'pluck':
            for k in range(8):
                P('bass', bass_note(midi(ch['bass']) * (2 if k in (3, 7) else 1), BEAT / 2 * .95), tb + k * BEAT / 2,
                  .62 * (.85 if k % 2 else 1.0))
        else:
            P('bass', bass_note(midi(ch['bass']), min(BAR, t1 - tb) * .98, 'long'), tb, .55)
        if arp:
            for k in range(16):
                P('arp', pluck(midi(ch['arp'][ARP_PAT[k]]), .3, arp_bright), tb + k * BEAT / 4,
                  .26 * (1.0 if k % 4 == 0 else .72) * arp_gain, pan=(-.35 if k % 2 else .35), verb=.2, delay=.3)
        for q in range(4):
            tq = tb + q * BEAT
            if drums == 'full':
                K(tq)
                if claps and q in (1, 3):
                    P('drums', CLAP, tq, .55, verb=.12)
                P('drums', HAT, tq + BEAT / 2, .25, pan=.2)
                if shaker:
                    for sh in (1, 3):
                        P('drums', SHAKER, tq + sh * BEAT / 4, .11, pan=-.3)
                if q == 3 and b % 2 == 1:
                    P('drums', OHAT, tq + BEAT / 2, .17, pan=.25)
            elif drums == 'groove':
                K(tq)
                P('drums', HAT, tq + BEAT / 2, .28, pan=.2)
            elif drums == 'half':
                if q in (0, 2):
                    K(tq, .9)
                if q == 2:
                    P('drums', CLAP, tq, .45, verb=.2)
                for sh in range(4):
                    P('drums', HAT, tq + sh * BEAT / 4, .16 if sh % 2 else .1, pan=.2)
            elif drums == 'break':
                P('drums', HAT, tq + BEAT / 2, .12, pan=.2)
        if lead:
            for bb, beat, dur, m in MELODY:
                if bb == (b + bars_offset) % 4:
                    P('lead', lead_note(midi(m), dur * BEAT * .92), tb + beat * BEAT, .34, verb=.3, delay=.25)
                    P('bell', bell(midi(m + 12), 1.2, 1.8, 2.0, .35), tb + beat * BEAT, .07, verb=.4)


def snare_roll(t0, t1, g=.5):
    t = t0
    while t < t1 - 1e-6:
        p = (t - t0) / (t1 - t0)
        put('drums', SNARE, t, g * (.35 + .65 * p), verb=.15)
        t += BEAT / 2 if p < .5 else BEAT / 4 if p < .85 else BEAT / 8


def impact(t, size=1.0, crash=True):
    put('fx', mk_impact(size), t, .72 * size, verb=.25)
    if crash:
        put('drums', mk_crash(), t, .32 * size, verb=.3)


def sonic_logo(t_pam, pad_d=3.5, size=1.25):
    """«па-па-пам»: две ноты в затакт и аккорд на удар"""
    put('bell', bell(midi(81), 1.6), t_pam - .5, .30, pan=-.2, verb=.45)            # A5
    put('arp', pluck(midi(69), .4), t_pam - .5, .30, pan=-.2, verb=.3)
    put('bell', bell(midi(86), 1.6), t_pam - .25, .30, pan=.2, verb=.45)            # D6
    put('arp', pluck(midi(74), .4), t_pam - .25, .30, pan=.2, verb=.3)
    for k, m in enumerate([74, 78, 81, 86]):                                         # D5 F#5 A5 D6
        put('bell', bell(midi(m), 3.2, 3.5, 2.0, 1.4), t_pam + k * .012, .26, pan=(k - 1.5) * .25, verb=.55)
    put('pad', pad_chord([50, 57, 62, 66, 69], pad_d, 2600, .05, 1.6), t_pam, .75, verb=.5)
    put('bass', bass_note(midi(38), pad_d, 'long'), t_pam, .7)
    impact(t_pam, size)


# ─────────────── партитура ───────────────
# Сетка: 120 ударов в минуту, такт 2 с. Смены сцен ролика стоят на сильных долях: 4, 16, 24, 36, 48.
H = edl.HITS
# 0–2: подъём → «па-па-пам» на появлении знака
put('fx', mk_riser(2.0, 300, 7000, tone=1.0), 0.0, .32, verb=.3)
put('drums', mk_revcym(1.0), 1.0, .32, verb=.2)
for k in range(12):
    tk = .3 + 1.5 * (1 - (1 - k / 12) ** 1.6)
    m = [81, 83, 86, 88, 90, 93, 95][rng.integers(0, 7)]
    put('bell', bell(midi(m), .6, 1.2, 3.0, .12), tk, .06 + .05 * k / 12, pan=rng.uniform(-.8, .8), verb=.5)
sonic_logo(H['logo'], pad_d=2.0)
# 2–4: тихое арпеджио, свист перед первым окном
for k in range(8):
    put('arp', pluck(midi(PROG[1]['arp'][ARP_PAT[k]]), .3, .6), 3.0 + k * BEAT / 4, .14 * (k / 8) ** .7, pan=(-.35 if k % 2 else .35), verb=.25, delay=.35)
put('fx', mk_whoosh(1.2, .8), 3.2, .3, verb=.2)
# 01 · Пульт (4–16): грув набирает
impact(H['pulse'], .8)
section(4.0, 8.0, .55, drums='groove', arp_bright=.75, pad_bright=1500)
section(8.0, 16.0, .72, drums='full', arp_bright=.95, pad_bright=1800)
put('fx', mk_whoosh(1.0, .9), 7.9, .22, verb=.15)            # камера идёт к раскрытой сфере
put('fx', mk_whoosh(1.0, .9), 10.5, .2, verb=.15)           # к разбору причины
put('fx', mk_riser(1.4, 300, 7000), 14.6, .26, verb=.25)
# 02 · Шлюз (16–24): половинный ритм — «думает», спокойнее
impact(H['gate'], .9)
section(16.0, 24.0, .55, drums='half', arp_bright=.7, pad_bright=1400, bass_style='long', arp_gain=.8)
for k, t in enumerate((16.95, 17.75, 17.95, 18.1)):         # узлы схемы появляются — мягкие звоночки
    put('sfx', bell(midi(81 + 2 * k), .7, 1.0, 2.0, .18), t, .11, pan=(-.4 + k * .28), verb=.3)
for k, t in enumerate((18.7, 20.4, 22.1)):                  # три маршрута подсвечиваются по очереди
    put('sfx', bell(midi(86 + 2 * k), .9, 1.2, 2.0, .3), t, .13, pan=(-.3 + k * .3), verb=.35)
    put('fx', mk_whoosh(.5, .7), t - .05, .12, verb=.1)
put('fx', mk_riser(1.4, 300, 8000), 22.6, .28, verb=.25)
# 03 · Помощник (24–36)
impact(H['helper'], .9)
section(24.0, 32.0, .82, drums='full', arp_bright=1.1, pad_bright=2200)
section(32.0, 36.0, .9, drums='full', arp_bright=1.2, pad_bright=2400)
for k, m in enumerate([86, 90, 93]):                         # отчёт готов
    put('bell', bell(midi(m), 1.4, 2.2, 2.0, .6), 32.4 + k * .07, .16, pan=(k - 1) * .3, verb=.5)
put('fx', mk_riser(1.4, 300, 8000), 34.6, .28, verb=.25)
# 04 · Приложение (36–48): припев с мелодией
impact(H['app'], 1.0)
section(36.0, 46.0, 1.0, drums='full', lead=True, arp_bright=1.25, pad_bright=2600, arp_gain=.85)
section(46.0, H['finale'], .85, drums='groove', arp_bright=1.1, pad_bright=2400, bars_offset=3)
snare_roll(47.0, H['finale'] - .5, .42)
put('fx', mk_riser(2.0, 300, 10000, tone=1.0), H['finale'] - 2.0, .4, verb=.3)
put('drums', mk_revcym(1.0), H['finale'] - 1.0, .5)
# финал (48–53): «па-па-пам», пэд и редкое арпеджио затихают
sonic_logo(H['finale'], pad_d=3.6, size=1.3)
put('pad', pad_chord([57, 62, 66, 69, 74], 3.4, 1500, .8, 2.2), H['finale'] + 1.6, .36, verb=.6)
for k in range(12):
    m = PROG[2]['arp'][ARP_PAT[k % 16]]
    put('arp', pluck(midi(m), .35, .6), H['finale'] + 1.0 + k * BEAT / 2, .12 * (1 - k / 12), pan=(-.4 if k % 2 else .4), verb=.4, delay=.4)

# ─────────────── звуки интерфейса ───────────────
E = edl.build()
for t in E['clicks']:                                        # щелчки мыши и касания экрана
    put('sfx', tick(2100, 1.0) + .5 * tick(1300, .6), t, .2, verb=.05)
for t in (4.0, 16.0, 24.0, 36.0, 48.0):                     # смена сцены — короткий шорох
    put('sfx', hp(noise(.25), 5000) * np.exp(-tt(.25) / .05) * .5, t, .1, pan=-.3, verb=.2)

# ─────────────── сведение ───────────────
kicks = np.array(sorted(KICKS))
duck = np.ones(N)
if len(kicks):                                              # «накачка» от бочки
    x = np.arange(N) / SR
    idx = np.searchsorted(kicks, x, side='right') - 1
    since = np.where(idx >= 0, x - kicks[np.maximum(idx, 0)], 9)
    duck = 1 - .55 * np.exp(-since / .11) * (since < .45)
for k, depth in (('bass', 1.0), ('pad', .75), ('arp', .45), ('lead', .25)):
    BUS[k] *= 1 - depth * (1 - duck)

# задержка: пинг-понг на пунктирную восьмую
dly = np.zeros_like(DELAY)
d = int(.375 * SR)
mono = DELAY.mean(0)
for k in range(1, 7):
    g = .42 ** k
    sh = np.zeros(N)
    sh[k * d:] = mono[:N - k * d]
    dly[(k + 1) % 2] += lp(sh, 4500) * g
# ревербератор: синтетический отклик 2.4 с
ir_t = tt(2.4)
ir = np.vstack([lp(noise(2.4), 7000) * np.exp(-ir_t / .5), lp(noise(2.4), 7000) * np.exp(-ir_t / .52)])
ir[:, :int(.018 * SR)] = 0
ir /= np.sqrt((ir ** 2).sum(1, keepdims=True))
wet = np.vstack([signal.fftconvolve(VERB[c] + dly[c] * .3, ir[c])[:N] for c in range(2)]) * .55

GAIN = dict(kick=.62, drums=.6, bass=.55, pad=1.0, arp=1.05, lead=1.1, bell=.95, fx=.7, sfx=1.0)
mix = sum(BUS[k] * GAIN[k] for k in BUSES) + wet + dly * .35
mix = np.vstack([hp(mix[c], 30) for c in range(2)])
# тональный баланс: убрать гул ниже 90 Гц и шипение выше 11 кГц
shelf_lo = signal.butter(1, 90, 'high', fs=SR, output='sos')
shelf_hi = signal.butter(1, 11000, 'low', fs=SR, output='sos')
mix = .55 * mix + .45 * np.vstack([signal.sosfilt(shelf_lo, mix[c]) for c in range(2)])
mix = .4 * mix + .6 * np.vstack([signal.sosfilt(shelf_hi, mix[c]) for c in range(2)])
# финальное затухание
fo = np.ones(N)
f0, f1 = int((edl.DUR - 2.4) * SR), int((edl.DUR - .15) * SR)
fo[f0:f1] = np.cos(np.linspace(0, np.pi / 2, f1 - f0)) ** 1.5
fo[f1:] = 0
mix *= fo


def lufs(x):
    """интегральная громкость по BS.1770 (K-взвешивание, стробирование)"""
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]
    y = signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=1), axis=1)
    blk, hop = int(.4 * SR), int(.1 * SR)
    ms = np.array([(y[:, i:i + blk] ** 2).mean(1).sum() for i in range(0, y.shape[1] - blk, hop)])
    l = -.691 + 10 * np.log10(ms + 1e-12)
    ms = ms[l > -70]
    rel = -.691 + 10 * np.log10(ms.mean()) - 10
    ms = ms[-.691 + 10 * np.log10(ms) > rel]
    return -.691 + 10 * np.log10(ms.mean())


mix *= 10 ** ((-14.0 - lufs(mix)) / 20)
# ограничитель пиков −1 dBFS с упреждением 2 мс
ceil = 10 ** (-1.0 / 20)
peak = np.abs(mix).max(0)
g = np.minimum(1, ceil / np.maximum(peak, 1e-9))
g = minimum_filter1d(g, int(.004 * SR))
g = np.minimum(g, signal.lfilter([.003], [1, -.997], g - 1) + 1)
g = minimum_filter1d(g, int(.004 * SR))
mix *= g
mix = np.clip(mix, -ceil, ceil)
print(f'громкость {lufs(mix):.1f} LUFS, пик {20 * np.log10(np.abs(mix).max()):.2f} dBFS, '
      f'ограничитель срезал максимум {-20 * np.log10(g.min()):.1f} дБ')

pcm = (mix.T * 32767).astype(np.int16)
with wave.open(OUT, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f'звук готов: {OUT} — {N / SR:.1f} с')
