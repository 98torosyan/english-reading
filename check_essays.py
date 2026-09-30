#!/usr/bin/env python3
"""Խիստ ստուգում essays.js-ի համար։ Սխալի դեպքում վերադարձնում է 1։
Գործարկում.  python check_essays.py"""
import json, re, sys, pathlib, collections

ROOT = pathlib.Path(__file__).parent
src = (ROOT / "essays.js").read_text(encoding="utf-8")
E = json.loads(src[src.index("["): src.rindex("]") + 1])

# Level rules (CEFR): word range, min/max average sentence length, max share of long words (8+ letters)
RULES = {
 "A1": dict(words=(75, 125),  asl=(4, 11),  long=0.10),
 "A2": dict(words=(110, 185), asl=(7, 14),  long=0.13),
 "B1": dict(words=(150, 260), asl=(10, 19), long=0.20),
 "B2": dict(words=(185, 340), asl=(13, 24), long=0.26),
 "C1": dict(words=(210, 430), asl=(16, 32), long=0.34),
}
A1_BANNED = r"\b(was|were|went|had|did|saw|took|made|would|will|have been|has been)\b"
ARM = re.compile(r"[\u0531-\u058F]")
errors, warns = [], []
def err(e, m): errors.append(f"[{e.get('id')}] {m}")
def warn(e, m): warns.append(f"[{e.get('id')}] {m}")

ids = collections.Counter(e["id"] for e in E)
for i, n in ids.items():
    if n > 1: errors.append(f"duplicate id: {i}")
titles = collections.Counter(e["title"] for e in E)
for t, n in titles.items():
    if n > 1: errors.append(f"duplicate title: {t}")
per = collections.Counter(e["level"] for e in E)
for lv in RULES:
    if per[lv] != 10: errors.append(f"level {lv} has {per[lv]} essays (need 10)")

def syl(w):
    w = w.lower().strip("'’-")
    g = re.findall(r"[aeiouy]+", w)
    n = len(g) - (1 if w.endswith("e") and len(g) > 1 and not w.endswith("le") else 0)
    return max(1, n)
FK = {"A1": (-3, 3), "A2": (-1, 5), "B1": (3, 10), "B2": (6, 13), "C1": (8, 18)}
stats = collections.defaultdict(list)
for e in E:
    for k in ("id", "level", "topic", "title", "text", "words", "qs"):
        if k not in e: err(e, f"missing field {k}")
    if not re.fullmatch(r"[a-z0-9-]+", e["id"]): err(e, "id must be latin lowercase/digits/-")
    r = RULES.get(e["level"])
    if not r: err(e, "unknown level"); continue
    text = " ".join(e["text"])
    words = re.findall(r"[A-Za-z][A-Za-z'’-]*", text)
    wc = len(words)
    sents = [s for s in re.split(r"(?<=[.!?])[\"”]?\s+", text) if s.strip()]
    asl = wc / len(sents)
    longw = sum(1 for w in words if len(w.strip("'’-")) >= 8) / wc
    fk = 0.39 * asl + 11.8 * sum(syl(w) for w in words) / wc - 15.59
    stats[e["level"]].append((asl, longw, fk))
    if not FK[e["level"]][0] <= fk <= FK[e["level"]][1]: warn(e, f"readability grade {fk:.1f}, expected {FK[e['level']]}")
    if not r["words"][0] <= wc <= r["words"][1]: err(e, f"{wc} words, {e['level']} needs {r['words']}")
    if not r["asl"][0] <= asl <= r["asl"][1]: warn(e, f"avg sentence {asl:.1f} words, expected {r['asl']}")
    if longw > r["long"]: warn(e, f"long-word share {longw:.2f} > {r['long']}")
    if e["level"] == "A1":
        m = re.findall(A1_BANNED, text, re.I)
        if m: err(e, f"A1 should use present tenses; found: {sorted(set(m))}")
    if ARM.search(text): err(e, "Armenian letters inside English text")
    if re.search(r"\s{2,}|\s[,.!?]", text): err(e, "spacing/punctuation problem")
    if text.count('"') % 2: err(e, "unbalanced quotes")
    low = text.lower()
    for bad in ["in conclusion", "this essay", "throughout history", "since the dawn"]:
        if bad in low: err(e, f"template phrase: '{bad}'")
    # vocabulary
    if len(e["words"]) != 6: err(e, "need exactly 6 words")
    for w, tr in e["words"]:
        if not ARM.search(tr): err(e, f"translation of '{w}' is not in Armenian")
        head = re.sub(r"\s*\(.*?\)", "", w).lower()
        stem = head[:max(4, len(head) - 3)] if " " not in head else head.split()[0][:4]
        if stem not in low: err(e, f"vocab '{w}' not found in text")
    # questions
    if len(e["qs"]) != 4: err(e, "need exactly 4 questions")
    for q, opts in e["qs"]:
        if len(opts) != 3: err(e, f"'{q}' needs 3 options")
        if len(set(o.lower() for o in opts)) != 3: err(e, f"duplicate options in '{q}'")
        if not q.endswith("?"): err(e, f"question must end with '?': {q}")

# difficulty must grow with level
avg = {lv: tuple(sum(x[i] for x in v) / len(v) for i in range(3)) for lv, v in stats.items()}
lv = list(RULES)
for a, b in zip(lv, lv[1:]):
    if a in avg and b in avg and not (avg[a][0] < avg[b][0] and avg[a][1] <= avg[b][1] and avg[a][2] < avg[b][2]):
        errors.append(f"difficulty does not grow from {a} to {b}: {avg[a]} vs {avg[b]}")

print(f"{len(E)} essays:", dict(per))
for k in lv:
    if k in avg: print(f"  {k}: avg sentence {avg[k][0]:.1f} words, long words {avg[k][1]:.0%}, readability grade {avg[k][2]:.1f}")
for w in warns: print("WARN ", w)
for x in errors: print("ERROR", x)
print("OK" if not errors else f"{len(errors)} error(s)")
sys.exit(1 if errors else 0)
