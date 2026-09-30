#!/usr/bin/env python3
"""Chaos tests for the Python side: essay checker, lesson previews, voice builder.
Run:  python tests/test_python.py      (needs ffmpeg; fonttools+cairosvg+FONT for the preview test)"""
import asyncio, copy, json, os, pathlib, random, shutil, subprocess, sys, tempfile, types

ROOT = pathlib.Path(__file__).resolve().parent.parent
random.seed(7)
FAILS = []
def ok(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg, flush=True)
    if not cond: FAILS.append(msg)

def load(p):  s = p.read_text(encoding="utf-8"); return json.loads(s[s.index("["): s.rindex("]") + 1])
def save(p, E): p.write_text("window.ESSAYS = " + json.dumps(E, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")

def sandbox():
    d = pathlib.Path(tempfile.mkdtemp())
    for f in ["essays.js", "check_essays.py", "build_pages.py", "make_audio.py", "icon.svg"]:
        shutil.copy(ROOT / f, d / f)
    (d / "brand").mkdir(); shutil.copy(ROOT / "brand" / "chime.wav", d / "brand" / "chime.wav")
    return d

def run_check(d):
    return subprocess.run([sys.executable, str(d / "check_essays.py")], capture_output=True, text=True).returncode

# ---------- 1. essay checker ----------
d = sandbox()
ok(run_check(d) == 0, "checker accepts the real 50 essays")
E0 = load(d / "essays.js")
def pick(level=None):
    c = [e for e in E0 if not level or e["level"] == level]; return c[random.randrange(len(c))]["id"]
MUTATIONS = {
  "duplicate id":            lambda E: E[1].__setitem__("id", E[0]["id"]),
  "A1 with past tense":      lambda E: next(e for e in E if e["level"] == "A1")["text"].append("We went home."),
  "Armenian inside English": lambda E: E[5]["text"].__setitem__(0, E[5]["text"][0] + " Բարև"),
  "only 5 vocab words":      lambda E: E[7]["words"].pop(),
  "vocab not in text":       lambda E: E[8]["words"].__setitem__(0, ["xylophone", "քսիլոֆոն"]),
  "untranslated vocab":      lambda E: E[9]["words"].__setitem__(1, [E[9]["words"][1][0], "translation"]),
  "3 questions":             lambda E: E[10]["qs"].pop(),
  "2 options":               lambda E: E[11]["qs"][0][1].pop(),
  "duplicate options":       lambda E: E[12]["qs"][0][1].__setitem__(2, E[12]["qs"][0][1][0]),
  "question without ?":      lambda E: E[13]["qs"][0].__setitem__(0, E[13]["qs"][0][0].rstrip("?")),
  "template phrase":         lambda E: E[30]["text"].append("In conclusion, this matters a lot."),
  "unbalanced quote":        lambda E: E[31]["text"].__setitem__(0, E[31]["text"][0] + ' "oops.'),
  "too short C1":            lambda E: next(e for e in E if e["level"] == "C1").__setitem__("text", ["Too short."]),
  "missing level essay":     lambda E: E.remove(next(e for e in E if e["level"] == "B2")),
  "unknown level":           lambda E: E[3].__setitem__("level", "D9"),
  "bad id characters":       lambda E: E[4].__setitem__("id", "Bad Id!"),
  "double space":            lambda E: E[6]["text"].__setitem__(0, E[6]["text"][0].replace(" ", "  ", 1)),
}
for name, mut in MUTATIONS.items():
    E = copy.deepcopy(E0); mut(E); save(d / "essays.js", E)
    ok(run_check(d) == 1, f"checker rejects: {name}")
save(d / "essays.js", E0)
shutil.rmtree(d)

# ---------- 2. lesson previews ----------
font = os.environ.get("FONT", "/tmp/Literata.ttf")
d = sandbox()
E = load(d / "essays.js")
evil = copy.deepcopy(E[0]); evil["id"] = "evil-title"
evil["title"] = 'Tom & "Jerry" <script>alert(1)</script> and a very long title that must wrap nicely'
E.append(evil); save(d / "essays.js", E)
env = dict(os.environ, FONT=font, BASE_URL="https://example.github.io/x")
r = subprocess.run([sys.executable, str(d / "build_pages.py")], capture_output=True, text=True, env=env, cwd=d)
ok(r.returncode == 0, "preview builder runs" + ("" if r.returncode == 0 else ": " + r.stderr[-300:]))
page = (d / "l" / "evil-title.html").read_text() if (d / "l" / "evil-title.html").exists() else ""
ok("<script>alert" not in page and "&lt;script&gt;" in page, "preview page escapes a dangerous title")
ok('content="https://example.github.io/x/og/evil-title.png"' in page, "preview image URL is absolute and normalised")
ok('url=../?e=evil-title' in page, "preview page redirects to the lesson")
ok(len(list((d / "l").glob("*.html"))) == len(E), "one preview page per lesson")
png = d / "og" / "evil-title.png"
if png.exists():
    from PIL import Image
    ok(Image.open(png).size == (1200, 630), "preview picture is 1200x630")
else:
    ok(False, "preview picture created")
shutil.rmtree(d)

# ---------- 3. voice builder with a fake voice service ----------
def fake_edge_tts(mode):
    """mode: ok | fail | hang | empty"""
    m = types.ModuleType("edge_tts")
    class Communicate:
        def __init__(self, text, voice, rate=None, boundary=None): self.text = text
        async def stream(self):
            if mode == "fail": raise ConnectionError("service down")
            if mode == "hang": await asyncio.sleep(3600)
            if mode == "empty": return
            sents = [s for s in self.text.replace("\n", " ").split(". ") if s.strip()]
            secs = max(0.4, len(self.text) / 60)
            t = 0.0
            for s in sents:
                yield {"type": "SentenceBoundary", "offset": int(t * 1e7), "duration": 0, "text": s}
                t += secs * len(s) / max(1, len(self.text))
            with tempfile.NamedTemporaryFile(suffix=".mp3") as f:
                subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"sine=f=300:d={secs:.2f}",
                                "-ar", "24000", "-ac", "1", "-b:a", "48k", f.name], check=True)
                data = pathlib.Path(f.name).read_bytes()
            for i in range(0, len(data), 4096):
                yield {"type": "audio", "data": data[i:i + 4096]}
    m.Communicate = Communicate
    return m

def load_audio_module(d, mode):
    sys.modules["edge_tts"] = fake_edge_tts(mode)
    import importlib.util
    spec = importlib.util.spec_from_file_location(f"ma_{mode}_{random.random()}", d / "make_audio.py")
    ma = importlib.util.module_from_spec(spec); spec.loader.exec_module(ma); return ma

def dur(p):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                                capture_output=True, text=True).stdout)

os.environ["AUDIO_RETRY_WAIT"] = "0"
d = sandbox(); E = load(d / "essays.js")[:3]; save(d / "essays.js", E)
ma = load_audio_module(d, "ok")
n = asyncio.run(ma.main([]))
ok(n == 3, "fake service: all 3 voices built")
j = json.loads((d / "audio" / f"{E[0]['id']}.json").read_text())
chime = dur(d / "brand" / "chime.wav")
ok(j["start"] > chime + 2 * ma.GAP, "essay starts after the sound logo and the title")
ok(j["end"] > j["start"] and abs(j["starts"][0] - j["start"]) < 0.05, "first sentence starts exactly where the essay starts")
ok(all(a <= b for a, b in zip(j["starts"], j["starts"][1:])), "sentence times are in order")
total = dur(d / "audio" / f"{E[0]['id']}.mp3")
ok(total > j["end"] + ma.GAP, "name outro comes after the essay")
ok((d / "audio" / ".version").read_text() == ma.VERSION, "voice version saved after a full run")
mtime = (d / "audio" / f"{E[0]['id']}.mp3").stat().st_mtime
asyncio.run(ma.main([]))
ok((d / "audio" / f"{E[0]['id']}.mp3").stat().st_mtime == mtime, "second run skips ready voices")
(d / "audio" / ".version").write_text("old")
asyncio.run(ma.main([]))
ok((d / "audio" / f"{E[0]['id']}.mp3").stat().st_mtime != mtime, "version change re-makes every voice")
shutil.rmtree(d)

for mode in ("fail", "empty"):
    d = sandbox(); save(d / "essays.js", load(d / "essays.js")[:6])
    ma = load_audio_module(d, mode)
    n = asyncio.run(ma.main([]))
    ok(n == 0 and not (d / "audio" / ".version").exists(), f"service '{mode}': no voices, version not saved")
    ok(not list((d / "audio").glob("*.mp3")), f"service '{mode}': no broken MP3 left behind")
    shutil.rmtree(d)

d = sandbox(); save(d / "essays.js", load(d / "essays.js")[:5])
os.environ["AUDIO_TIMEOUT"] = "1"
ma = load_audio_module(d, "hang")
import time; t0 = time.time()
n = asyncio.run(ma.main([]))
ok(n == 0 and time.time() - t0 < 20, "hanging service: stops after 3 essays instead of hanging")
os.environ["AUDIO_TIMEOUT"] = "90"
shutil.rmtree(d)

print("\n" + ("ALL PASSED" if not FAILS else f"{len(FAILS)} FAILED"))
sys.exit(1 if FAILS else 0)
