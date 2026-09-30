#!/usr/bin/env python3
"""
Ստեղծում է յուրաքանչյուր էսսեի ձայնային ֆայլը (audio/<id>.mp3) բնական AI ձայնով։

Տեղադրում.   pip install edge-tts
Գործարկում.  python make_audio.py              (միայն նոր էսսեների համար)
             python make_audio.py --force      (բոլորը նորից)
             python make_audio.py --voice en-US-AvaNeural

Այլ ձայներ տեսնելու համար.  edge-tts --list-voices | grep en-
"""
import argparse, asyncio, json, pathlib
import edge_tts

ROOT = pathlib.Path(__file__).parent
OUT = ROOT / "audio"

def load_essays():
    src = (ROOT / "essays.js").read_text(encoding="utf-8")
    return json.loads(src[src.index("["): src.rindex("]") + 1])

async def make(essay, voice, force):
    mp3 = OUT / f"{essay['id']}.mp3"
    if mp3.exists() and not force:
        print("  skip", essay["id"], flush=True); return True
    for attempt in range(3):
        try:
            await asyncio.wait_for(_make(essay, voice, mp3), timeout=90)
            return True
        except Exception as ex:
            print(f"  retry {essay['id']} ({attempt + 1}/3): {type(ex).__name__} {ex}", flush=True)
            mp3.unlink(missing_ok=True)
            await asyncio.sleep(3)
    print("  FAILED", essay["id"], "- the site will use the phone's voice for it")
    return False

async def _make(essay, voice, mp3):
    text = "\n\n".join(essay["text"])
    try:
        comm = edge_tts.Communicate(text, voice, rate="-5%", boundary="SentenceBoundary")
    except TypeError:  # older edge-tts
        comm = edge_tts.Communicate(text, voice, rate="-5%")
    starts = []
    with open(mp3, "wb") as f:
        async for ch in comm.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] == "SentenceBoundary":
                starts.append(round(ch["offset"] / 1e7, 2))
    if starts:  # sentence timings for highlighting on the page
        (OUT / f"{essay['id']}.json").write_text(json.dumps(starts))
    print("  ok  ", essay["id"], flush=True)

async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", default="en-GB-SoniaNeural")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    OUT.mkdir(exist_ok=True)
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
    print(f"done: {sum(results)}/{len(results)} voices ready")

asyncio.run(main())
