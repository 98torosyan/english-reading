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
    if per[lv] < 10: errors.append(f"level {lv} has {per[lv]} essays (need at least 10)")

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

# ---- grammar exercises (grammar.js) ----
gids = collections.Counter()
gp = ROOT / "grammar.js"
if gp.exists():
    gs = gp.read_text(encoding="utf-8")
    G = json.loads(gs[gs.index("["): gs.rindex("]") + 1])
    eids, gids, nq = set(ids), collections.Counter(), 0
    for st in G:
        for k in ("id", "title", "hy", "tenses", "hints", "parts"):
            if k not in st: errors.append(f"grammar set {st.get('id')}: missing {k}")
        for pt in st["parts"]:
            gids[pt["id"]] += 1
            tag = f"grammar {pt['id']}"
            if not re.fullmatch(r"g-[a-z0-9-]+", pt["id"]): errors.append(f"{tag}: id must start with g-")
            if pt["id"] in eids: errors.append(f"{tag}: id is also a lesson id")
            if not pt["qs"]: errors.append(f"{tag}: no questions")
            kinds = {"o" in q for q in pt["qs"]}
            if len(kinds) > 1: errors.append(f"{tag}: mixes choice and written questions")
            seen = collections.Counter(q["q"] for q in pt["qs"])
            for t, n in seen.items():
                if n > 1: errors.append(f"{tag}: duplicate question '{t}'")
            for i, q in enumerate(pt["qs"], 1):
                nq += 1
                blanks = len(re.findall(r"_{3,}", q["q"]))
                if not blanks: errors.append(f"{tag} #{i}: no blank _____")
                if ARM.search(q["q"]): errors.append(f"{tag} #{i}: Armenian letters in the sentence")
                if "o" in q:
                    o, a = q["o"], q.get("a", [])
                    if not 2 <= len(o) <= 4: errors.append(f"{tag} #{i}: needs 2-4 options")
                    if len({x.lower().strip() for x in o}) != len(o): errors.append(f"{tag} #{i}: duplicate options")
                    if not a or len(set(a)) != len(a) or any(not isinstance(x, int) or not 0 <= x < len(o) for x in a):
                        errors.append(f"{tag} #{i}: bad answer index {a}")
                    if len(a) >= len(o): errors.append(f"{tag} #{i}: every option is marked correct")
                else:
                    f = q.get("f")
                    if not f or any(not opts or any(not str(x).strip() for x in opts) for opts in f):
                        errors.append(f"{tag} #{i}: missing written answer")
                    elif len(f) != blanks: errors.append(f"{tag} #{i}: {blanks} blanks but {len(f)} answers")
    for i, n in gids.items():
        if n > 1: errors.append(f"duplicate grammar id: {i}")
    print(f"grammar: {len(G)} sets, {sum(gids.values())} exercises, {nq} questions")

# ---- practice tests (exams.js) ----
xp = ROOT / "exams.js"
if xp.exists():
    xs = xp.read_text(encoding="utf-8")
    X = json.loads(xs[xs.index("["): xs.rindex("]") + 1])
    xids = collections.Counter(t["id"] for t in X)
    for i, c in xids.items():
        if c > 1: errors.append(f"duplicate test id: {i}")
    for t in X:
        tag = f"test {t['id']}"
        if not re.fullmatch(r"t-[a-z0-9-]+", t["id"]): errors.append(f"{tag}: id must start with t-")
        if t["id"] in set(ids) or t["id"] in gids: errors.append(f"{tag}: id is used elsewhere")
        nums = []
        for sec in t["sections"]:
            for g in sec["groups"]:
                gaps = [int(x) for x in re.findall(r"\((\d+)\)\s*_{3,}", g.get("text", ""))]
                if sec["type"] == "mc" and gaps and gaps != [it["n"] for it in g["items"]]:
                    errors.append(f"{tag} section {sec['key']}: gap numbers {gaps} do not match tasks")
                for it in g["items"]:
                    n = it["n"]; nums.append(n); w = f"{tag} #{n}"
                    if sec["type"] == "mc":
                        if len(it["o"]) != 4 or len({o.lower() for o in it["o"]}) != 4: errors.append(f"{w}: needs 4 different options")
                        if not 0 <= it["a"] < 4: errors.append(f"{w}: bad answer")
                    elif sec["type"] == "multi":
                        if len(it["s"]) != 5: errors.append(f"{w}: needs 5 sentences")
                        if not it["a"] or len(it["a"]) >= 5 or len(set(it["a"])) != len(it["a"]) or any(not 1 <= a <= 5 for a in it["a"]): errors.append(f"{w}: bad answers {it['a']}")
                    elif sec["type"] == "order":
                        gapsN = len(re.findall(r"_{2,}", it["text"]))
                        if gapsN != len(it["a"]) or len(it["words"]) != gapsN + 2: errors.append(f"{w}: {gapsN} gaps, {len(it['a'])} answers, {len(it['words'])} words")
                        if len(set(it["a"])) != len(it["a"]) or any(not 1 <= a <= len(it["words"]) for a in it["a"]): errors.append(f"{w}: bad answers {it['a']}")
                    elif sec["type"] == "match":
                        if len(it["left"]) != 4 or len(it["a"]) != 4 or len(set(it["a"])) != 4 or any(not 1 <= a <= len(it["right"]) for a in it["a"]): errors.append(f"{w}: bad matching")
                    else: errors.append(f"{w}: unknown type {sec['type']}")
        if nums != list(range(1, 81)): errors.append(f"{tag}: tasks must be numbered 1-80")
    print(f"tests: {len(X)} practice tests, {sum(len(t['sections']) for t in X)} sections")

# ---- practice by section (bank.js) uses the same task formats ----
bp = ROOT / "bank.js"
if bp.exists():
    bs = bp.read_text(encoding="utf-8")
    BK = json.loads(bs[bs.index("["): bs.rindex("]") + 1])
    seen_ids = set(ids) | set(gids) | {t["id"] for t in X} if xp.exists() else set(ids) | set(gids)
    keys = [b["key"] for b in BK]
    if keys != ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII"]: errors.append(f"bank: sections must be I-XIII, got {keys}")
    total = 0
    for b in BK:
        for t in b["sets"]:
            tag = f"bank {t['id']}"
            if t["id"] in seen_ids: errors.append(f"{tag}: id is used twice")
            seen_ids.add(t["id"])
            if len(t["sections"]) != 1 or t["sections"][0]["type"] != b["type"]: errors.append(f"{tag}: needs one section of type {b['type']}")
            nums = []
            for sec in t["sections"]:
                for g in sec["groups"]:
                    gaps = [int(x) for x in re.findall(r"\((\d+)\)\s*_{3,}", g.get("text", ""))]
                    if sec["type"] == "mc" and gaps and gaps != [it["n"] for it in g["items"]]: errors.append(f"{tag}: gap numbers do not match")
                    for it in g["items"]:
                        n = it["n"]; nums.append(n); w = f"{tag} #{n}"
                        if sec["type"] == "mc":
                            if len(it["o"]) != 4 or len({o.lower() for o in it["o"]}) != 4 or not 0 <= it["a"] < 4: errors.append(f"{w}: needs 4 different options and a valid answer")
                            if sec["key"] != "I" and it["q"] and not re.search(r"_{3,}|\?$", it["q"]): errors.append(f"{w}: question has no blank")
                        elif sec["type"] == "multi":
                            if len(it["s"]) != 5 or not 1 <= len(it["a"]) <= 4 or any(not 1 <= a <= 5 for a in it["a"]): errors.append(f"{w}: bad multi task")
                            if len({str(x) for x in it["s"]}) != 5: errors.append(f"{w}: duplicate sentences")
                        elif sec["type"] == "order":
                            gN = len(re.findall(r"_{2,}", it["text"]))
                            if gN != len(it["a"]) or len(it["words"]) != gN + 2 or len(set(it["words"])) != len(it["words"]) or len(set(it["a"])) != len(it["a"]): errors.append(f"{w}: bad gap-word task")
                        elif sec["type"] == "match":
                            if len(it["left"]) != 4 or len(set(it["a"])) != 4 or len(set(it["right"])) != len(it["right"]) or any(not 1 <= a <= len(it["right"]) for a in it["a"]): errors.append(f"{w}: bad matching")
            if nums != list(range(1, len(nums) + 1)) or t.get("count") != len(nums): errors.append(f"{tag}: tasks must be numbered 1-{len(nums)}")
            total += len(nums)
    print(f"bank: {len(BK)} sections, {sum(len(b['sets']) for b in BK)} sets, {total} tasks")

# ---- UFAR entrance-format tests (ufar.js) ----
up = ROOT / "ufar.js"
if up.exists():
    us = up.read_text(encoding="utf-8")
    U = json.loads(us[us.index("["): us.rindex("]") + 1])
    used = set(ids) | set(gids) | ({t["id"] for t in X} if xp.exists() else set())
    for t in U:
        tag = f"ufar {t['id']}"
        if not re.fullmatch(r"u-[a-z0-9-]+", t["id"]): errors.append(f"{tag}: id must start with u-")
        if t["id"] in used: errors.append(f"{tag}: id is used twice")
        used.add(t["id"])
        if [s["key"] for s in t["sections"]] != ["1", "2", "3", "4", "5A", "5B"]: errors.append(f"{tag}: sections must be 1, 2, 3, 4, 5A, 5B")
        nums, pts = [], 0
        for sec in t["sections"]:
            for g in sec["groups"]:
                if sec["type"] == "pick" and (len(g["opts"]) != len(g["items"]) + 3 or len(set(g["opts"])) != len(g["opts"])): errors.append(f"{tag}: vocabulary needs 3 extra different definitions")
                if sec["type"] == "pick" and len({it["a"] for it in g["items"]}) != len(g["items"]): errors.append(f"{tag}: two words share a definition")
                if sec["type"] == "odd":
                    xs = [it["x"] for it in g["items"]]
                    if not 3 <= xs.count(-1) <= 7: errors.append(f"{tag}: odd-word lines should mix correct and wrong lines")
                for it in g["items"]:
                    n = it["n"]; nums.append(n); pts += sec["pt"]; w = f"{tag} #{n}"
                    if sec["type"] == "mc":
                        k = 3 if sec.get("tf") or sec["key"] == "1" or t.get("fmt") == "2025" else 4
                        if len(it["o"]) != k or len({o.lower() for o in it["o"]}) != k or not 0 <= it["a"] < k: errors.append(f"{w}: needs {k} different options and a valid answer")
                        if sec["key"] == "1" and "___" not in it["q"]: errors.append(f"{w}: grammar question has no blank")
                    elif sec["type"] == "wf":
                        if it["q"].count("___") != 1 or not it["a"] or not it["w"].isupper(): errors.append(f"{w}: bad word-formation task")
                    elif sec["type"] == "pick":
                        if not 0 <= it["a"] < len(g["opts"]): errors.append(f"{w}: bad definition")
                    elif sec["type"] == "odd":
                        if not -1 <= it["x"] < len(it["line"].split(" ")): errors.append(f"{w}: bad extra word")
                    else: errors.append(f"{w}: unknown type {sec['type']}")
        if nums != list(range(1, len(nums) + 1)): errors.append(f"{tag}: tasks must be numbered from 1")
        want = {"2025": (80, 80), "2022": (90, 60)}.get(t.get("fmt"))
        if not want: errors.append(f"{tag}: unknown format {t.get('fmt')}")
        elif len(nums) != want[0] or abs(pts - want[1]) > 1e-9 or abs(t.get("pts", 0) - want[1]) > 1e-9: errors.append(f"{tag}: needs {want[0]} tasks and {want[1]} points, has {len(nums)} and {pts}")
    print(f"ufar: {len(U)} tests, {sum(len(g['items']) for t in U for s in t['sections'] for g in s['groups'])} tasks")

print(f"{len(E)} essays:", dict(per))
for k in lv:
    if k in avg: print(f"  {k}: avg sentence {avg[k][0]:.1f} words, long words {avg[k][1]:.0%}, readability grade {avg[k][2]:.1f}")
for w in warns: print("WARN ", w)
for x in errors: print("ERROR", x)
print("OK" if not errors else f"{len(errors)} error(s)")
sys.exit(1 if errors else 0)
