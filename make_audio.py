#!/usr/bin/env python3
"""
Ստեղծում է յուրաքանչյուր էսսեի ձայնը (audio/<id>.mp3).
  ♪ ձայնային լոգո → դասի անունը → էսսեն → «Gayane's Reading Room.»

Տեղադրում.   pip install edge-tts    (+ ffmpeg)
Գործարկում.  python make_audio.py              (միայն նորերը)
             python make_audio.py --force      (բոլորը նորից)
             python make_audio.py --voice en-US-AvaNeural
"""
import argparse, array, asyncio, json, math, os, pathlib, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).parent
OUT = ROOT / "audio"
CHIME = ROOT / "brand" / "chime.wav"
VERSION = "chime-outro-2"      # change to re-make every voice
GAP = 0.35                     # seconds of silence between parts
OUTRO = "Gayane's Reading Room."
TIMEOUT = float(os.environ.get("AUDIO_TIMEOUT", "90"))

import edge_tts  # imported after constants so tests can replace it

def load_essays():
    src = (ROOT / "essays.js").read_text(encoding="utf-8")
    return json.loads(src[src.index("["): src.rindex("]") + 1])

ENV_HOP = 0.05   # seconds between loudness samples (the page draws the live waveform from them)

def envelope(mp3):
    """Loudness 0-100 every 50 ms, measured from the finished MP3 (pure Python, only needs ffmpeg)."""
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(mp3), "-f", "s16le", "-ac", "1", "-ar", "8000", "-"],
                       capture_output=True, check=True)
    pcm = array.array("h")
    pcm.frombytes(r.stdout[: len(r.stdout) // 2 * 2])
    if sys.byteorder == "big":
        pcm.byteswap()
    step = int(8000 * ENV_HOP)
    rms = []
    for i in range(0, len(pcm), step):
        seg = pcm[i:i + step]
        if seg:
            rms.append(math.sqrt(sum(x * x for x in seg) / len(seg)))
    if len(rms) < 11:
        return []
    ref = sorted(rms)[int(len(rms) * 0.97)] or 1.0      # 97th percentile = "loud"
    out = [min(100, round(100 * v / ref)) for v in rms]
    return [0 if v < 6 else v for v in out]             # tiny noise counts as silence

def ensure_envelopes(essays):
    """Adds the loudness data to every ready voice that does not have it yet (no new TTS calls)."""
    n = 0
    for e in essays:
        mp3, js = OUT / f"{e['id']}.mp3", OUT / f"{e['id']}.json"
        if not (mp3.exists() and js.exists()):
            continue
        try:
            j = json.loads(js.read_text())
            if isinstance(j, dict) and j.get("env"):
                continue
            if isinstance(j, list):                       # very old format
                j = {"start": j[0] if j else 0, "end": 0, "starts": j}
            j["env"], j["hop"] = envelope(mp3), ENV_HOP
            js.write_text(json.dumps(j, separators=(",", ":")))
            n += 1
        except Exception as ex:
            print(f"  envelope skipped for {e['id']}: {type(ex).__name__} {ex}", flush=True)
    if n:
        print(f"  loudness data added to {n} voices", flush=True)

def duration(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "csv=p=0", str(path)], capture_output=True, text=True, check=True)
    return float(r.stdout.strip())

async def tts(text, voice):
    try:
        comm = edge_tts.Communicate(text, voice, rate="-5%", boundary="SentenceBoundary")
    except TypeError:  # older edge-tts
        comm = edge_tts.Communicate(text, voice, rate="-5%")
    audio, starts = bytearray(), []
    async for ch in comm.stream():
        if ch["type"] == "audio":
            audio += ch["data"]
        elif ch["type"] == "SentenceBoundary":
            starts.append(ch["offset"] / 1e7)
    if not audio:
        raise RuntimeError("empty audio")
    return bytes(audio), starts

def assemble(parts, target):
    """parts: list of audio files; joins them with GAP silence, one clean MP3."""
    cmd = ["ffmpeg", "-y", "-loglevel", "error"]
    for p in parts:
        cmd += ["-i", str(p)]
    cmd += ["-f", "lavfi", "-t", str(GAP), "-i", "anullsrc=r=24000:cl=mono"]
    sil = len(parts)
    chain, labels = [], []
    for i in range(len(parts)):
        chain.append(f"[{i}]aresample=24000,aformat=channel_layouts=mono[a{i}]")
    chain.append(f"[{sil}]asplit={len(parts) - 1}" + "".join(f"[s{i}]" for i in range(len(parts) - 1)))
    for i in range(len(parts)):
        labels.append(f"[a{i}]")
        if i < len(parts) - 1:
            labels.append(f"[s{i}]")
    chain.append("".join(labels) + f"concat=n={len(labels)}:v=0:a=1[out]")
    cmd += ["-filter_complex", ";".join(chain), "-map", "[out]", "-ar", "24000", "-ac", "1", "-b:a", "64k", str(target)]
    subprocess.run(cmd, check=True)

async def build(essay, voice, mp3):
    with tempfile.TemporaryDirectory() as d:
        d = pathlib.Path(d)
        title, _ = await tts(f"{essay['title']}.", voice)
        body, starts = await tts("\n\n".join(essay["text"]), voice)
        outro, _ = await tts(OUTRO, voice)
        (d / "t.mp3").write_bytes(title); (d / "b.mp3").write_bytes(body); (d / "o.mp3").write_bytes(outro)
        tmp = d / "out.mp3"
        assemble([CHIME, d / "t.mp3", d / "b.mp3", d / "o.mp3"], tmp)
        start = duration(CHIME) + GAP + duration(d / "t.mp3") + GAP
        end = start + duration(d / "b.mp3")
        tmp.replace(mp3)
    timing = {"start": round(start, 2), "end": round(end, 2), "starts": [round(t + start, 2) for t in starts]}
    (OUT / f"{essay['id']}.json").write_text(json.dumps(timing))
    # the loudness data is added right after (ensure_envelopes) so one failure never loses a voice

async def make(essay, voice, force):
    mp3 = OUT / f"{essay['id']}.mp3"
    if mp3.exists() and not force:
        print("  skip", essay["id"], flush=True); return True
    for attempt in range(3):
        try:
            await asyncio.wait_for(build(essay, voice, mp3), timeout=TIMEOUT)
            print("  ok  ", essay["id"], flush=True)
            return True
        except Exception as ex:
            print(f"  retry {essay['id']} ({attempt + 1}/3): {type(ex).__name__} {ex}", flush=True)
            await asyncio.sleep(float(os.environ.get("AUDIO_RETRY_WAIT", "3")))
    print("  FAILED", essay["id"], "- the site will use the phone's voice for it", flush=True)
    return False

async def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", default="en-GB-SoniaNeural")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args(argv)
    OUT.mkdir(exist_ok=True)
    vfile = OUT / ".version"
    if not vfile.exists() or vfile.read_text().strip() != VERSION:
        print(f"voice version changed -> re-making all voices ({VERSION})")
        a.force = True
    essays = load_essays()
    print(f"{len(essays)} essays, voice {a.voice}")
    results, fails_in_row = [], 0
    for e in essays:
        ok = await make(e, a.voice, a.force)
        results.append(ok)
        fails_in_row = 0 if ok else fails_in_row + 1
        if fails_in_row >= 3:
            print("Voice service is not answering - stopping. The site will use the phone's voice.")
            break
    ensure_envelopes(essays)
    print(f"done: {sum(results)}/{len(essays)} voices ready")
    if sum(results) == len(essays):
        vfile.write_text(VERSION)
    return sum(results)

if __name__ == "__main__":
    asyncio.run(main())
