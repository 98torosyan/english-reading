// Chaos test for index.html: thousands of random taps in many "bad phone" environments.
// Run:  npm i jsdom@24 --no-save && node tests/chaos.js
const { JSDOM } = require("jsdom");
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const ROOT = path.join(__dirname, "..");
const HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8")
  .replace('<script src="essays.js"></script>', "<script>" + fs.readFileSync(path.join(ROOT, "essays.js"), "utf8") + "</script>");
const PIN = process.env.TEST_PIN || "1234";
let seed = +(process.env.SEED || 12345); const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = a => a[Math.floor(rnd() * a.length)];
const wait = ms => new Promise(r => setTimeout(r, ms));
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? "PASS " : "FAIL ") + m); };

function envs() {
  const out = [];
  for (const share of [true, false]) for (const clip of [true, false]) for (const storage of [true, false])
    for (const tts of [true, false]) for (const mp3 of [true, false]) out.push({ share, clip, storage, tts, mp3 });
  return out;
}

async function openPage(url, env, errors) {
  const dom = new JSDOM(HTML, {
    url, runScripts: "dangerously", pretendToBeVisual: true,
    beforeParse(w) {
      w.crypto.subtle = crypto.webcrypto.subtle; w.TextEncoder = TextEncoder;
      w.HTMLElement.prototype.scrollIntoView = () => {}; w.scrollTo = () => {};
      w.matchMedia = () => ({ matches: rnd() < 0.2 });           // sometimes "reduce motion"
      w.fetch = async (u, o) => {
        if (rnd() < 0.05) throw new TypeError("network down");  // random network failures
        const isMp3 = /\.mp3$/.test(u), isJson = /\.json$/.test(u);
        if (!env.mp3) return { ok: false, json: async () => ({}), blob: async () => new w.Blob([]) };
        if (isMp3) return { ok: true, blob: async () => new w.Blob([new Uint8Array(10)], { type: "audio/mpeg" }) };
        if (isJson) return { ok: true, json: async () => pick([{ start: 2.1, end: 40, starts: [] }, [1, 2, 3], null, { start: 5, end: 3 }, {}]) };
        return { ok: false };
      };
      w.Audio = class { constructor(src) { this.src = src; this.currentTime = 0; this.duration = 60; this.readyState = pick([0, 1]); this.playbackRate = 1; this._l = {}; }
        play() { this.paused = false; return rnd() < 0.1 ? Promise.reject(new Error("NotAllowedError")) : Promise.resolve(); }
        pause() { this.paused = true; } addEventListener(t, f) { (this._l[t] ||= []).push(f); }
        tick() { this.currentTime = rnd() * 70; this.ontimeupdate && this.ontimeupdate(); if (rnd() < .05 && this.onended) this.onended(); } };
      if (env.tts) {
        w.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
        w.speechSynthesis = { getVoices: () => pick([[], [{ lang: "en-GB", name: "Daniel" }, { lang: "fr-FR", name: "x" }]]),
          speak(u) { setTimeout(() => (rnd() < .1 ? u.onerror && u.onerror() : u.onend && u.onend()), 1); }, cancel() {} };
      } else { delete w.speechSynthesis; }
      if (env.share) { w.navigator.share = async () => { if (rnd() < .3) throw new Error("AbortError"); }; w.navigator.canShare = () => rnd() < .5; }
      Object.defineProperty(w.navigator, "clipboard", { value: { writeText: async () => { if (!env.clip) throw new Error("denied"); } }, configurable: true });
      if (!env.storage) Object.defineProperty(w, "localStorage", { get() { throw new Error("SecurityError"); } });
      w.document.execCommand = () => false;
      w.URL.createObjectURL = () => "blob:x";
      w.addEventListener("error", e => errors.push("error: " + (e.message || e.error)));
      w.addEventListener("unhandledrejection", e => errors.push("unhandled: " + (e.reason && e.reason.message || e.reason)));
    },
  });
  await wait(30);
  return dom.window;
}

const TEXT_BAD = /undefined|NaN|\[object|null(?![a-z])/;
async function walk(w, env, steps, errors, studentOnly) {
  const d = w.document;
  for (let s = 0; s < steps; s++) {
    const actions = [
      () => { const b = [...d.querySelectorAll("button:not([disabled]), a[data-go], #back, .s, .say")]; if (b.length) pick(b).click(); },
      () => { const r = [...d.querySelectorAll("input[type=radio]")]; if (r.length) pick(r).checked = true; },
      () => { const c = d.getElementById("check"); c && c.click(); },
      () => { const p = d.getElementById("pin"); if (p) { p.value = pick([PIN, "0000", "", " 1234 ", "🙂", "9".repeat(50)]); d.getElementById("lockForm").dispatchEvent(new w.Event("submit")); } },
      () => pick([() => w.history.back(), () => w.history.forward()])(),
      () => d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape" })),
      () => { const bd = d.querySelector(".backdrop"); bd && bd.click(); },
      () => { const p = d.getElementById("play"); for (let i = 0; i < 5; i++) p && p.click(); },
      () => { w.eval("audioEl") && w.eval("audioEl").tick(); },
      () => { const sp = d.getElementById("speed"); sp && sp.click(); },
    ];
    try { pick(actions)(); } catch (e) { errors.push("action threw: " + e.message); }
    await wait(pick([0, 0, 1, 3]));
    // invariants
    if (d.querySelectorAll(".sheet").length > 1) errors.push("two share sheets open");
    const clone = d.body.cloneNode(true); clone.querySelectorAll("script").forEach(x => x.remove()); const txt = clone.textContent;
    if (TEXT_BAD.test(txt)) errors.push("bad text on page: " + txt.match(TEXT_BAD)[0] + " @ " + w.location.search);
    if (studentOnly && d.querySelector("[data-share], #back")) errors.push("student reached the lesson list");
    const sc = d.getElementById("score"); if (sc && /of -|-\d/.test(sc.textContent)) errors.push("bad score text");
    if (d.querySelectorAll(".s.on").length > 1) errors.push("two sentences highlighted");
  }
}

(async () => {
  const E = JSON.parse(fs.readFileSync(path.join(ROOT, "essays.js"), "utf8").replace(/^window\.ESSAYS = /, "").replace(/;\s*$/, ""));
  const all = envs(); let runs = 0, taps = 0; const errs = new Set();
  for (const env of all) {
    // teacher session
    let errors = [];
    let w = await openPage("https://x.github.io/er/", env, errors);
    await walk(w, env, 120, errors, false); taps += 120; runs++;
    // student sessions: fresh device, random lessons, hostile URLs
    for (const id of [pick(E).id, pick(E).id, "nope", "<img src=x onerror=alert(1)>", ""]) {
      const e2 = []; const ws = await openPage("https://x.github.io/er/?e=" + encodeURIComponent(id), env, e2);
      const isLesson = E.some(e => e.id === id);
      await walk(ws, env, 60, e2, isLesson); taps += 60; runs++;
      if (id.startsWith("<img") && ws.document.querySelector("img[src=x]")) e2.push("XSS through lesson id");
      e2.forEach(x => errors.push(x));
    }
    errors.filter(x => !/Not implemented/.test(x)).forEach(x => errs.add(`${JSON.stringify(env)} ${x}`));
  }
  console.log(`${runs} sessions, ${taps} random taps, ${all.length} phone environments`);
  ok(errs.size === 0, "no crashes, no broken text, no invariant violations");
  [...errs].slice(0, 15).forEach(x => console.log("   ", x));

  // deterministic checks
  let errors = [];
  let w = await openPage("https://x.github.io/er/", { share: true, clip: true, storage: true, tts: true, mp3: false }, errors);
  const d = w.document;
  ok(!!d.getElementById("pin") && !d.querySelector("[data-share]"), "lock screen first, lessons hidden");
  d.getElementById("pin").value = PIN; d.getElementById("lockForm").dispatchEvent(new w.Event("submit")); await wait(50);
  ok(d.querySelectorAll("[data-share]").length === E.length, `all ${E.length} lessons after the right PIN`);
  ok(d.querySelector(".mark.anim .st") !== null, "animated logo on first screen");
  d.querySelector('[data-f="C1"]').click(); await wait(10);
  ok(d.querySelector(".list.rise") && d.querySelectorAll("[data-share]").length === 10, "filter C1 = 10 lessons with a soft reveal");
  d.querySelector("[data-share]").click(); await wait(30);
  ok(d.querySelectorAll(".tri").length === 3, "share sheet: Text / Voice / Together");
  const msg = w.eval("message(ESSAYS[0])");
  ok(/^📘 Gayane Torosyan/.test(msg) && /\/l\/[a-z-]+\.html$/.test(msg), "message is signed and links to the branded page");
  ok(/— Gayane Torosyan, English teacher$/.test(w.eval("fullLesson(ESSAYS[0])")), "lesson text is signed");
  // quiz: partial answers must not reveal answers
  let e3 = []; w = await openPage("https://x.github.io/er/?e=memory", { share: true, clip: true, storage: true, tts: true, mp3: false }, e3);
  w.document.querySelector("input[name=q0]").checked = true; w.document.getElementById("check").click(); await wait(10);
  ok(w.document.querySelectorAll(".q")[1].querySelector(".right") === null, "unanswered questions stay hidden");
  for (let q = 0; q < 4; q++) w.document.querySelector(`.q:nth-of-type(${q + 1}) [data-ok="true"] input`).checked = true;
  w.document.getElementById("check").click(); await wait(900);
  ok(/You got 4 of 4/.test(w.document.getElementById("score").textContent), "perfect score counts up to 4 of 4");
  // timing: logo/title/outro never highlighted
  const t = w.eval("(starts=null, span={start:3,end:30}, [sentenceAt(1,40), sentenceAt(3.01,40), sentenceAt(29.9,40)>=0, sentenceAt(35,40)])");
  ok(t[0] === -1 && t[1] === 0 && t[2] === true && t[3] === -1, "sound logo, title and outro are never highlighted");
  console.log("\n" + (fails.length ? `${fails.length} FAILED` : "ALL PASSED")); process.exit(fails.length ? 1 : 0);
})();
