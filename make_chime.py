#!/usr/bin/env python3
"""Gayane Torosyan's sound logo: three soft bell notes (A - E - C#), ~1.3 s.
Made from pure sine waves, so it is original and free to use.
Run once:  python make_chime.py   ->  brand/chime.wav, brand/chime.mp3 (needs ffmpeg)"""
import pathlib, subprocess, wave
import numpy as np

SR = 24000
OUT = pathlib.Path(__file__).parent / "brand"
NOTES = [(0.00, 440.00, 0.9), (0.13, 659.25, 0.75), (0.26, 1108.73, 0.6)]   # start s, Hz, volume
PARTIALS = [(1.0, 1.0, 3.0), (2.0, 0.30, 5.5), (3.01, 0.12, 8.0), (4.2, 0.05, 11.0)]  # ratio, amp, decay

def bell(freq, dur):
    t = np.arange(int(SR * dur)) / SR
    tone = sum(a * np.exp(-t * d) * np.sin(2 * np.pi * freq * r * t) for r, a, d in PARTIALS)
    attack = np.minimum(1, t / 0.006)
    return tone * attack

def main():
    total = 1.35
    y = np.zeros(int(SR * total))
    for start, f, vol in NOTES:
        s = bell(f, total - start) * vol
        i = int(SR * start)
        y[i:i + len(s)] += s
    fade = np.ones_like(y); n = int(SR * 0.25); fade[-n:] = np.linspace(1, 0, n)
    y *= fade
    y = y / np.max(np.abs(y)) * 0.7            # about -3 dB
    OUT.mkdir(exist_ok=True)
    with wave.open(str(OUT / "chime.wav"), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((y * 32767).astype("<i2").tobytes())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(OUT / "chime.wav"),
                    "-ar", "24000", "-ac", "1", "-b:a", "64k", str(OUT / "chime.mp3")], check=True)
    print("brand/chime.wav, brand/chime.mp3")

if __name__ == "__main__":
    main()
