#!/usr/bin/env python3
"""Builds a branded preview page for every lesson: l/<id>.html + og/<id>.png.
When the lesson link is sent in WhatsApp/Telegram/Viber/Messenger, the chat shows
a card with Gayane Torosyan's logo, the lesson title and its level colour.

Needs (only for new pictures):  pip install fonttools cairosvg  + Literata font (FONT env)
Run:  python build_pages.py"""
import html, json, os, pathlib

ROOT = pathlib.Path(__file__).parent
BASE = os.environ.get("BASE_URL", "https://98torosyan.github.io/english-reading/").rstrip("/") + "/"
FONT = os.environ.get("FONT", "/tmp/Literata.ttf")
LV = {"A1": "#2E9E6A", "A2": "#1C8AA3", "B1": "#3E5FD9", "B2": "#7A4FD6", "C1": "#B23F78"}
INK = "#0E1022"

src = (ROOT / "essays.js").read_text(encoding="utf-8")
E = json.loads(src[src.index("["): src.rindex("]") + 1])
(ROOT / "l").mkdir(exist_ok=True)
(ROOT / "og").mkdir(exist_ok=True)

PAGE = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} ({level}) | Gayane Torosyan</title>
<meta name="description" content="{desc}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Gayane Torosyan | English Reading Room">
<meta property="og:title" content="{icon} {title} ({level})">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{base}l/{id}.html">
<meta property="og:image" content="{base}og/{id}.png">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="../icon.svg" type="image/svg+xml">
<meta http-equiv="refresh" content="0; url=../?{q}={id}">
<script>location.replace("../?{q}={id}")</script>
</head><body style="font-family:Georgia,serif;background:#0E1022;color:#fff;text-align:center;padding:40px">
<p><a style="color:#fff" href="../?{q}={id}">Open: {title}</a></p>
</body></html>
"""

def og_svg(e, F):
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen
    def tp(font, s, size, x, y, track=0):
        gs, cmap, upm, hm = font.getGlyphSet(), font.getBestCmap(), font["head"].unitsPerEm, font["hmtx"]
        sc, pen, cx = size / upm, SVGPathPen(gs), x
        for ch in s:
            n = cmap.get(ord(ch)) or cmap[ord("?")]
            gs[n].draw(TransformPen(pen, (sc, 0, 0, -sc, cx, y))); cx += hm[n][0] * sc + track
        return pen.getCommands(), cx - x
    big, txt, sub = F
    # wrap title into max 3 lines
    size = 68
    while True:
        words, lines, line = e["title"].split(), [], ""
        for w in words:
            t = (line + " " + w).strip()
            if tp(big, t, size, 0, 0)[1] > 660 and line: lines.append(line); line = w
            else: line = t
        lines.append(line)
        if len(lines) <= 3 or size <= 44: break
        size -= 6
    y0 = 300 - (len(lines) - 1) * size * 0.6
    title = "".join(f'<path d="{tp(big, l, size, 470, y0 + i * size * 1.15)[0]}" fill="#fff"/>' for i, l in enumerate(lines))
    badge = e.get("badge", e["level"])
    bw = tp(txt, badge, 28, 0, 0)[1]
    lvw = max(84, round(bw + 42))
    lv = f'<rect x="470" y="{y0 - size - 62:.0f}" width="{lvw}" height="44" rx="22" fill="{e.get("badgec", LV[e["level"]])}"/>' \
         f'<path d="{tp(txt, badge, 28, 470 + (lvw - bw) / 2, y0 - size - 30)[0]}" fill="#fff"/>'
    info_y = y0 + (len(lines) - 1) * size * 1.15 + 62
    if "info" in e:                       # grammar exercise
        info_txt = e["info"]
    else:
        words = len(" ".join(e["text"]).split())
        mins = max(1, round(words / {"A1": 70, "A2": 85, "B1": 100, "B2": 115, "C1": 125}.get(e["level"], 100)))
        info_txt = f"Read · Listen · {len(e['qs'])} questions · ~{mins} min"
    while tp(sub, info_txt, 28, 0, 0)[1] > 690 and " · " in info_txt:
        info_txt = info_txt.rsplit(" · ", 1)[0]
    info = tp(sub, info_txt, 28, 472, info_y)[0]
    name = tp(txt, "Gayane Torosyan", 36, 470, 520)[0]
    room = tp(txt, "ENGLISH READING ROOM", 20, 471, 556, track=4.2)[0]
    icon = (ROOT / "icon.svg").read_text()
    inner = icon[icon.index(">") + 1: icon.rindex("</svg>")]
    stripes = '<rect x="0" y="622" width="1200" height="8" fill="url(#vl)"/>'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs><radialGradient id="glow" cx="1040" cy="40" r="760" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#7A5CEB" stop-opacity=".38"/><stop offset="1" stop-color="#7A5CEB" stop-opacity="0"/></radialGradient>
<linearGradient id="vl" x1="0" x2="1"><stop offset="0" stop-color="#5B3DD8"/><stop offset="1" stop-color="#A891F7"/></linearGradient></defs>
<rect width="1200" height="630" fill="{INK}"/><rect width="1200" height="630" fill="url(#glow)"/>
<g transform="translate(70,125) scale(.66)">{inner.replace('#17183A', '#1C1D45')}</g>
{lv}{title}<path d="{info}" fill="#C9C5E6"/><path d="{name}" fill="#fff"/><path d="{room}" fill="#A48EF7"/>{stripes}
</svg>'''

import hashlib
CARD_DESIGN = "card-v3-violet"   # change to redraw every card
logo_tag = hashlib.sha1((ROOT / "icon.svg").read_bytes() + CARD_DESIGN.encode()).hexdigest()[:12]
tag_file = ROOT / "og" / ".logo"
if not tag_file.exists() or tag_file.read_text().strip() != logo_tag:      # new logo -> redraw every card
    for old in (ROOT / "og").glob("*.png"):
        old.unlink()
    tag_file.write_text(logo_tag)
fonts = None
made = 0
# grammar exercises get the same kind of page and picture
GR = []
if (ROOT / "grammar.js").exists():
    gs = (ROOT / "grammar.js").read_text(encoding="utf-8")
    for st in json.loads(gs[gs.index("["): gs.rindex("]") + 1]):
        for pt in st["parts"]:
            kind = "Write the correct form" if "f" in pt["qs"][0] else "Choose the correct answer"
            GR.append({"id": pt["id"], "title": st["title"], "ptitle": f"{st['title']} · {pt['title']}", "level": pt.get("level", "B1"), "qs": pt["qs"], "grammar": True,
                       "info": f"Grammar · {len(pt['qs'])} questions · {pt['title']}",
                       "desc": f"Grammar · {pt['title']} · {len(pt['qs'])} questions. {kind} — Gayane Torosyan's English Reading Room."})
if (ROOT / "exams.js").exists():
    xs = (ROOT / "exams.js").read_text(encoding="utf-8")
    for t in json.loads(xs[xs.index("["): xs.rindex("]") + 1]):
        GR.append({"id": t["id"], "title": t["title"], "level": "B2", "qs": [], "grammar": True, "kind": "t", "icon": "📝",
                   "info": "Unified exam format · 80 tasks · 13 sections",
                   "desc": "Unified exam format · 80 tasks · 13 sections. Do the test and see your score — Gayane Torosyan's English Reading Room."})
if (ROOT / "bank.js").exists():
    bs = (ROOT / "bank.js").read_text(encoding="utf-8")
    for b in json.loads(bs[bs.index("["): bs.rindex("]") + 1]):
        for i, t in enumerate(b["sets"], 1):
            GR.append({"id": t["id"], "title": b["en"], "ptitle": f"{b['en']} · Set {i}", "level": "B2", "qs": [], "grammar": True, "kind": "b", "icon": "📝",
                       "info": f"Section {b['key']} · Set {i} · {t['count']} tasks",
                       "desc": f"Section {b['key']} · Set {i} · {t['count']} tasks. Exam practice — Gayane Torosyan's English Reading Room."})
if (ROOT / "ufar.js").exists():
    us = (ROOT / "ufar.js").read_text(encoding="utf-8")
    for t in json.loads(us[us.index("["): us.rindex("]") + 1]):
        n = sum(len(g["items"]) for s in t["sections"] for g in s["groups"])
        GR.append({"id": t["id"], "title": t["title"], "level": "B1", "qs": [], "grammar": True, "kind": "u", "icon": "🎓",
                   "info": f"UFAR entrance format · {n} tasks · {t['pts']:g} points",
                   "desc": f"UFAR entrance exam format · {n} tasks · {t['pts']:g} points. Do the test and see your score — Gayane Torosyan's English Reading Room."})
RL = []                                   # rules: grammar.js topics that have a rule, then rules.js
GC = {"tenses": "T", "cond": "If", "modal": "Can", "passive": "V3", "reported": "Said", "articles": "The", "quant": "Few", "compare": "-er", "gerund": "-ing", "relative": "Who", "prep": "In"}
GCOL = {"tenses": ["#5B3DD8", "#A891F7"], "cond": ["#3E5FD9", "#7FA0FF"], "modal": ["#1C8AA3", "#5CC6D9"], "passive": ["#2E9E6A", "#6FCF9B"], "reported": ["#B23F78", "#E57AAE"], "articles": ["#D9822B", "#F2B66D"], "quant": ["#7A4FD6", "#B58CF5"], "compare": ["#C2410C", "#F08A5D"], "gerund": ["#0F766E", "#4FB7A8"], "relative": ["#4F46E5", "#8B87F5"], "prep": ["#A16207", "#E0B04A"]}
if (ROOT / "grammar.js").exists():
    seen = {}
    for st in json.loads(gs[gs.index("["): gs.rindex("]") + 1]):
        tid = st.get("topic") or st["id"]
        tt = st.get("tt") or [st["title"], st.get("hy", ""), st.get("tenses", "")]
        if tid not in seen:
            seen[tid] = {"id": tid, "title": tt[0], "hy": tt[1], "sub": tt[2], "code": GC.get(tid, "Aa"), "c": GCOL.get(tid, GCOL["tenses"]), "rule": st.get("rule"), "practice": [], "_sets": []}
        seen[tid]["_sets"].append(st)
    for t in seen.values():
        for st in t["_sets"]:
            for pt in st["parts"]:
                t["practice"].append({"id": pt["id"], "title": (f"{st['title']} · {pt['title']}" if len(t["_sets"]) > 1 else pt["title"]), "level": pt.get("level", "B1")})
        del t["_sets"]
        if t["rule"]: RL.append(t)
if (ROOT / "rules.js").exists():
    rs = (ROOT / "rules.js").read_text(encoding="utf-8")
    RL += json.loads(rs[rs.index("["): rs.rindex("]") + 1])
for r in RL:
    GR.append({"id": "r-" + r["id"], "title": r["title"], "ptitle": f"{r['title']} · Grammar rule", "level": "B1", "badge": "Rule", "badgec": r["c"][0], "qs": [], "grammar": True, "kind": "r", "icon": "📘",
               "info": "Grammar rule · explained in Armenian",
               "desc": f"{r['hy']} — {r['title']}. Grammar rule with examples — Gayane Torosyan's English Reading Room."})
for e in E + GR:
    if e.get("grammar"):
        desc, q, icon = e["desc"], e.get("kind", "g"), e.get("icon", "✍️")
    else:
        mins = max(1, round(len(" ".join(e["text"]).split()) / {"A1": 70, "A2": 85, "B1": 100, "B2": 115, "C1": 125}.get(e["level"], 100)))
        desc, q, icon = f"Level {e['level']} · ~{mins} min · {len(e['qs'])} questions. Read, listen and answer — Gayane Torosyan's English Reading Room.", "e", "📖"
    (ROOT / "l" / f"{e['id']}.html").write_text(PAGE.format(
        title=html.escape(e.get("ptitle", e["title"])), level=e.get("badge", e["level"]), id=e["id"], base=BASE, desc=html.escape(desc), q=q, icon=icon), encoding="utf-8")
    png = ROOT / "og" / f"{e['id']}.png"
    if png.exists():
        continue
    if fonts is None:
        from fontTools.ttLib import TTFont
        from fontTools.varLib.instancer import instantiateVariableFont
        fonts = [instantiateVariableFont(TTFont(FONT), {"opsz": o, "wght": w}) for o, w in ((72, 650), (36, 600), (24, 450))]
    import cairosvg
    cairosvg.svg2png(bytestring=og_svg(e, fonts).encode(), write_to=str(png), output_width=1200, output_height=630)
    made += 1
# ---- small per-page data files: a student downloads only the lesson / exercise / test they open ----
import shutil
PD = ROOT / "p"
if PD.exists(): shutil.rmtree(PD)
PD.mkdir()
def part(pid, obj):
    (PD / f"{pid}.js").write_text("(window.PARTS=window.PARTS||{})[" + json.dumps(pid) + "]=" + json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
for e in E: part(e["id"], {"e": e})
def load_js(name):
    f = ROOT / name
    if not f.exists(): return []
    t = f.read_text(encoding="utf-8"); return json.loads(t[t.index("["): t.rindex("]") + 1])
for st in load_js("grammar.js"):
    head = {k: v for k, v in st.items() if k != "parts"}
    for pt in st["parts"]: part(pt["id"], {"s": head, "p": pt})
for t in load_js("exams.js"): part(t["id"], {"t": t})
for t in load_js("ufar.js"): part(t["id"], {"u": t})
for r in RL: part("r-" + r["id"], {"r": {**r, "practice": r.get("practice", [])[:6]}})
for b in load_js("bank.js"):
    head = {k: v for k, v in b.items() if k != "sets"}
    for i, t in enumerate(b["sets"]): part(t["id"], {"sec": head, "i": i, "t": t})
parts = len(list(PD.glob("*.js")))
print(f"{len(E)} lesson pages, {len(GR)} grammar/test pages, {made} new preview pictures, {parts} data files, base {BASE}")
