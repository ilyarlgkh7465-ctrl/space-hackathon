"""Сборка ролика: кадры JPEG из render.mjs + звук WAV → MP4 (H.264 High, BT.709, AAC) через PyAV.
    python encode.py <папка кадров> <звук.wav> <выход.mp4>"""
import sys
import wave
from fractions import Fraction
from pathlib import Path

import av
import numpy as np
from PIL import Image

import edl

frames_dir, wav_path, out_path = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
FPS, W, H = edl.FPS, edl.W, edl.H
n = int(round(edl.DUR * FPS))
missing = [i for i in range(n) if not (frames_dir / f'f_{i:05d}.jpg').exists()]
if missing:
    sys.exit(f'нет {len(missing)} кадров, первый — {missing[0]}')

out = av.open(out_path, 'w', options={'movflags': 'faststart'})
vs = out.add_stream('libx264', rate=FPS)
vs.codec_context.time_base = Fraction(1, FPS)
vs.width, vs.height, vs.pix_fmt = W, H, 'yuv420p'
vs.options = {'crf': '17', 'preset': 'slow', 'profile': 'high', 'level': '4.2',
              'x264-params': f'keyint={FPS * 2}:colorprim=bt709:transfer=bt709:colormatrix=bt709'}
aus = out.add_stream('aac', rate=48000)
aus.layout = 'stereo'
aus.bit_rate = 256000

for i in range(n):
    rgb = np.asarray(Image.open(frames_dir / f'f_{i:05d}.jpg').convert('RGB'))
    frame = av.VideoFrame.from_ndarray(rgb, format='rgb24').reformat(format='yuv420p', dst_colorspace='ITU709',
                                                                    dst_color_range='MPEG')
    frame.pts = i
    frame.time_base = Fraction(1, FPS)
    for pkt in vs.encode(frame):
        out.mux(pkt)
    if i % 600 == 0:
        print(f'  кадр {i}/{n}', flush=True)
for pkt in vs.encode():
    out.mux(pkt)

with wave.open(wav_path) as w:
    pcm = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, 2)
pcm = pcm[: int(n / FPS * 48000)]
resampler = av.AudioResampler(format='fltp', layout='stereo', rate=48000)
for start in range(0, len(pcm), 1024):
    chunk = np.ascontiguousarray(pcm[start:start + 1024]).reshape(1, -1)
    af = av.AudioFrame.from_ndarray(chunk, format='s16', layout='stereo')
    af.sample_rate = 48000
    af.pts = start
    af.time_base = Fraction(1, 48000)
    for rf in resampler.resample(af):
        for pkt in aus.encode(rf):
            out.mux(pkt)
for pkt in aus.encode():
    out.mux(pkt)
out.close()
print(f'ролик готов: {out_path} — {n} кадров, {n / FPS:.1f} с, {Path(out_path).stat().st_size / 1e6:.1f} МБ')
