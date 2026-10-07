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
<meta property="og:title" content="📖 {title} ({level})">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{base}l/{id}.html">
<meta property="og:image" content="{base}og/{id}.png">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="../icon.svg" type="image/svg+xml">
<meta http-equiv="refresh" content="0; url=../?e={id}">
<script>location.replace("../?e={id}")</script>
</head><body style="font-family:Georgia,serif;background:#0E1022;color:#fff;text-align:center;padding:40px">
<p><a style="color:#fff" href="../?e={id}">Open the lesson: {title}</a></p>
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
    lvw = 84
    lv = f'<rect x="470" y="{y0 - size - 62:.0f}" width="{lvw}" height="44" rx="22" fill="{LV[e["level"]]}"/>' \
         f'<path d="{tp(txt, e["level"], 28, 491, y0 - size - 30)[0]}" fill="#fff"/>'
    words = len(" ".join(e["text"]).split())
    mins = max(1, round(words / {"A1": 70, "A2": 85, "B1": 100, "B2": 115, "C1": 125}.get(e["level"], 100)))
    info_y = y0 + (len(lines) - 1) * size * 1.15 + 62
    info = tp(sub, f"Read · Listen · {len(e['qs'])} questions · ~{mins} min", 28, 472, info_y)[0]
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
for e in E:
    mins = max(1, round(len(" ".join(e["text"]).split()) / {"A1": 70, "A2": 85, "B1": 100, "B2": 115, "C1": 125}.get(e["level"], 100)))
    desc = f"Level {e['level']} · ~{mins} min · {len(e['qs'])} questions. Read, listen and answer — Gayane Torosyan's English Reading Room."
    (ROOT / "l" / f"{e['id']}.html").write_text(PAGE.format(
        title=html.escape(e["title"]), level=e["level"], id=e["id"], base=BASE, desc=desc), encoding="utf-8")
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
print(f"{len(E)} lesson pages, {made} new preview pictures, base {BASE}")
