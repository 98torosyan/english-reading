// Chaos test for index.html: thousands of random taps in many "bad phone" environments.
// Run:  npm i jsdom@24 --no-save && node tests/chaos.js
const { JSDOM } = require("jsdom");
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const ROOT = path.join(__dirname, "..");
const HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8")
  .replace('<script src="essays.js"></script>', "<script>" + fs.readFileSync(path.join(ROOT, "essays.js"), "utf8") + "</script>").replace('<script src="dict.js"></script>', "<script>" + fs.readFileSync(path.join(ROOT, "dict.js"), "utf8") + "</script>");
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
      if (env.dur !== undefined) w.__dur = env.dur; if (env.json) w.__json = env.json;
      w.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: () => (...a) => { w.__draws = (w.__draws || 0) + 1; }, set: () => true }); };
      w.crypto.subtle = crypto.webcrypto.subtle; w.TextEncoder = TextEncoder;
      w.HTMLElement.prototype.scrollIntoView = () => {}; w.scrollTo = () => {};
      w.matchMedia = () => ({ matches: env.calm ? false : rnd() < 0.2 });           // sometimes "reduce motion"
      w.fetch = async (u, o) => {
        if (!env.calm && rnd() < 0.05) throw new TypeError("network down");  // random network failures
        if (/mymemory/.test(u)) {
          const m = w.__mm || pick(["ok", "ok", "ok", "limit", "latin", "junk", "null", "net", "http", "evil"]);
          if (m === "net") throw new TypeError("offline");
          if (m === "http") return { ok: false };
          const body = { ok: { responseData: { translatedText: "աշխատանք" }, responseStatus: 200 },
            limit: { responseData: { translatedText: "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY" }, responseStatus: 429 },
            latin: { responseData: { translatedText: "hello" }, responseStatus: 200 }, junk: { foo: 1 }, null: null,
            evil: { responseData: { translatedText: "աշ <img src=x onerror=alert(1)> &amp; <script>alert(2)</script>" }, responseStatus: "200" } }[m];
          return { ok: true, json: async () => body };
        }
        if (/dictionaryapi/.test(u)) {
          const m = w.__dict || pick(["ok", "ok", "404", "junk", "evil", "net"]);
          if (m === "net") throw new TypeError("offline");
          if (m === "404") return { ok: false };
          const body = { ok: [{ meanings: [{ partOfSpeech: "noun", definitions: [{ definition: "a thing people do for money" }] }] }], junk: { title: "No Definitions Found" },
            evil: [{ meanings: [{ partOfSpeech: "<b>x</b>", definitions: [{ definition: "<img src=x onerror=alert(3)>" }] }] }] }[m];
          return { ok: true, json: async () => body };
        }
        const isMp3 = /\.mp3$/.test(u), isJson = /\.json$/.test(u);
        if (!env.mp3) return { ok: false, json: async () => ({}), blob: async () => new w.Blob([]) };
        if (isMp3) return { ok: true, blob: async () => new w.Blob([new Uint8Array(10)], { type: "audio/mpeg" }) };
        if (isJson) return { ok: true, json: async () => w.__json || pick([{ start: 2.1, end: 40, starts: [] }, [1, 2, 3], null, { start: 5, end: 3 }, {},
          { start: 2, end: 30, starts: [], env: Array.from({ length: 600 }, (_, i) => (i * 7) % 101), hop: 0.05 },
          { env: ["a", 1, null], hop: 0.05 }, { env: new Array(50000).fill(5), hop: 0.05 }, { env: [1, 2, 3], hop: 0 },
          { env: Array.from({ length: 50 }, () => NaN), hop: 0.05 }, { env: Array.from({ length: 50 }, () => 1e9), hop: 0.05 }, { env: "xx", hop: "y" }]) };
        return { ok: false };
      };
      w.Audio = class { constructor(src) { this.src = src; this.currentTime = 0; this.duration = w.__dur !== undefined ? w.__dur : pick([60, 60, 60, NaN, Infinity, 0, 45.5]); this.readyState = pick([0, 1]); this.playbackRate = 1; this._l = {}; }
        play() { this.paused = false; return (rnd() < 0.1 && !env.calm) ? Promise.reject(new Error("NotAllowedError")) : Promise.resolve(); }
        pause() { this.paused = true; } addEventListener(t, f) { (this._l[t] ||= []).push(f); }
        tick() { this.currentTime = rnd() * 70; if (rnd() < .3) { this.onloadedmetadata && this.onloadedmetadata(); this.ondurationchange && this.ondurationchange(); } this.ontimeupdate && this.ontimeupdate(); if (rnd() < .05 && this.onended) this.onended(); } };
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
      () => { const x = [...d.querySelectorAll(".w")]; if (x.length) pick(x).click(); },
      () => { const sk = d.getElementById("seek"); if (sk) { sk.value = pick(["0", "30", "-5", "999999", "abc", "12.3", String(rnd() * 100)]); sk.dispatchEvent(new w.Event("input")); if (rnd() < .8) sk.dispatchEvent(new w.Event("change")); } },
      () => { const x = [...d.querySelectorAll("#wordcard button, #prevS, #nextS, #back10, #fwd10, #loop, #themeBtn")]; if (x.length) pick(x).click(); },
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
    if (d.querySelectorAll("#wordcard").length > 1) errors.push("two word cards");
    if (!d.getElementById("wordcard") && d.body.classList.contains("wc-open")) errors.push("wc-open without a card");
    if (d.querySelector("img[src=x], #wordcard script, #wordcard img, #wcDef > *, #wcTr img, #wcTr script, #wcTr b")) errors.push("injected HTML in word card");
    for (const id of ["tcur", "tdur", "mcur", "mdur"]) { const t = d.getElementById(id); if (t && !/^(\d+:\d\d|\d+\/\d+|)$/.test(t.textContent)) errors.push(id + " shows '" + t.textContent + "'"); }
    const sk2 = d.getElementById("seek"); if (sk2) { const v = +sk2.value, mx = +sk2.max; if (!isFinite(v) || !isFinite(mx) || v < 0 || v > mx + 0.001) errors.push(`seek out of range ${sk2.value}/${sk2.max}`); }
    if (d.documentElement.dataset.theme && !/^(light|dark)$/.test(d.documentElement.dataset.theme)) errors.push("bad theme");
  }
}

(async () => {
  const E = JSON.parse(fs.readFileSync(path.join(ROOT, "essays.js"), "utf8").replace(/^window\.ESSAYS = /, "").replace(/;\s*$/, ""));
  const all = envs(); let runs = 0, taps = 0; const errs = new Set();
  for (const env of (process.env.ONLY_DET ? [] : all)) {
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
  ok(d.querySelectorAll(".lvcard").length === 5 && !d.querySelector("[data-share]"), "after the right PIN: 5 level cards, lessons come after choosing a level");
  ok(d.querySelector(".mark.anim .st") !== null, "animated logo on first screen");
  d.querySelector('[data-lv="C1"]').click(); await wait(10);
  ok(d.querySelector(".list.rise") && d.querySelectorAll("[data-share]").length === 20, "level C1 opens its lessons with a soft reveal");
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

  // ================= new features: deterministic checks =================
  const SPLIT = p => p.match(/[^.!?]+[.!?]+["”]?\s*|[^.!?]+$/g) || [p];
  const zoo = E.find(e => e.id === "zoo"); const nS = zoo.text.map(SPLIT).flat().length;
  const starts = Array.from({ length: nS }, (_, i) => 3 + i * (47 / nS));
  const calm = { share: true, clip: true, storage: true, tts: true, mp3: true, calm: true, dur: 60, json: { start: 3, end: 50, starts, env: Array.from({ length: 1200 }, (_, i) => Math.round(50 + 50 * Math.sin(i / 7))), hop: 0.05 } };
  let en = [];
  w = await openPage("https://x.github.io/er/?e=zoo", calm, en); await wait(200);
  const D = w.document, Q = s => D.querySelector(s);
  ok(Q("#player") && !Q("#player").hidden, "player appears when the recording exists");
  ok(Q("#seek").max === "60" && Q("#tdur").textContent === "1:00", "time bar knows the length (1:00)");
  Q("#seek").value = "30"; Q("#seek").dispatchEvent(new w.Event("input")); Q("#seek").dispatchEvent(new w.Event("change")); await wait(20);
  ok(Math.abs(w.eval("audioEl.currentTime") - 30) < 0.06, "dragging the bar jumps the audio to 0:30");
  ok(Q(".s.on") !== null, "…and the right sentence lights up");
  Q("#fwd10").click(); ok(Math.abs(w.eval("audioEl.currentTime") - 40) < 0.06, "+10 s works");
  Q("#back10").click(); Q("#back10").click(); Q("#back10").click(); Q("#back10").click();
  ok(w.eval("audioEl.currentTime") === 0, "-10 s never goes below 0:00");
  const i0 = +(Q(".s.on") ? Q(".s.on").dataset.i : -1);
  Q("#nextS").click(); Q("#nextS").click(); await wait(10);
  ok(+Q(".s.on").dataset.i === i0 + 2 || +Q(".s.on").dataset.i === 1 || +Q(".s.on").dataset.i === 2, "next-sentence button moves forward");
  Q("#loop").click(); ok(Q("#loop").getAttribute("aria-pressed") === "true", "repeat-sentence button toggles");
  ok(Q("#ticks").children.length > 3, "sentence marks are drawn on the bar");

  // slim player + icons
  ok(!!Q("#mini") && !!Q("#mplay") && !!Q("#mseek"), "slim top player exists");
  ok(Q("#play svg") && Q("#prevS svg") && Q("#back10 svg") && Q("#loop svg"), "all player buttons use the same icon set (no emoji)");
  const wasPlaying = w.eval("playing"); Q("#mplay").click(); await wait(10);
  ok(w.eval("playing") !== wasPlaying, "slim player's play button toggles playback");
  ok(Q("#play").getAttribute("aria-label") === Q("#mplay").getAttribute("aria-label"), "both play buttons stay in sync");
  Q("#mseek").value = "20"; Q("#mseek").dispatchEvent(new w.Event("input")); ok(Q("#seek").value === "20" && Q("#tcur").textContent === Q("#mcur").textContent, "dragging the slim bar moves the big bar and both clocks");
  Q("#mseek").dispatchEvent(new w.Event("change")); await wait(10);
  ok(Math.abs(w.eval("audioEl.currentTime") - 20) < 0.06, "slim bar seeks the audio");
  ok(/of/.test(Q("#seek").getAttribute("aria-valuetext") || ""), "screen readers get '0:20 of 1:00'");
  w.eval("pause()");

  // live waveform
  ok(!!Q("#wave"), "waveform canvas is in the player");
  ok(w.eval("envArr!==null&&envArr.length===1200"), "loudness data of the recording is loaded");
  w.eval("playFrom(null)"); await wait(40); const d0 = w.__draws || 0; await wait(200);
  ok((w.__draws || 0) > d0 + 3, "waveform keeps redrawing while playing");
  w.eval("pause()"); await wait(40); const d1 = w.__draws || 0; await wait(200);
  ok((w.__draws || 0) === d1 && w.eval("waveRAF") === 0, "animation loop stops on pause (saves battery)");
  const d2 = w.__draws || 0; Q("#seek").value = "25"; Q("#seek").dispatchEvent(new w.Event("input")); ok((w.__draws || 0) > d2, "dragging the bar redraws the waveform");
  Q("#seek").dispatchEvent(new w.Event("change"));

  // word card
  const wordEl = t => [...D.querySelectorAll(".w")].find(x => x.dataset.w === t);
  wordEl("lazy").click(); await wait(20);
  ok(Q("#wordcard") && /ծույլ/.test(Q("#wcTr").textContent), "tapping a lesson word shows its Armenian meaning instantly");
  ok(D.body.classList.contains("wc-open"), "word card marks the page as open");
  D.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape" })); ok(!Q("#wordcard"), "Escape closes the word card");
  w.__dict = "ok"; wordEl("sun").click(); await wait(60);
  ok(/արև/.test(Q("#wcTr").textContent) && !/automatic|approximate/i.test(Q("#wcTr").textContent), "every other word comes from the checked dictionary, with no 'automatic' note");
  ok(/money/.test(Q("#wcDef").textContent), "English definition appears");
  w.__dict = "net"; wordEl("hot").click(); await wait(60);
  ok(/շոգ/.test(Q("#wcTr").textContent), "translation works offline (no internet needed)");
  w.__dict = "evil"; wordEl("blue").click(); await wait(60);
  ok(!Q("#wcTr img") && !Q("#wcDef img") && !Q("img[src=x]") && !Q("#wcDef > *"), "a hostile English definition cannot inject HTML");
  wordEl("lions").click(); Q("#wcPlay").click(); await wait(10);
  ok(!Q("#wordcard") && Q(".s.on") !== null, "'Play this sentence' closes the card and starts there");

  // day / night button (the only reading setting left)
  ok(!Q("#aaBtn") && !!Q("#themeBtn"), "one day/night button instead of the settings panel");
  const startDark = D.documentElement.dataset.mode === "dark";
  Q("#themeBtn").click();
  ok(D.documentElement.dataset.mode === (startDark ? "light" : "dark"), "tapping switches day <-> night");
  ok(D.documentElement.dataset.theme === D.documentElement.dataset.mode, "colours follow the button");
  ok(Q("#themeBtn").getAttribute("aria-pressed") === String(!startDark) && /mode/i.test(Q("#themeBtn").getAttribute("aria-label")), "button tells screen readers what it will do");
  ok(JSON.parse(w.localStorage.getItem("reading-room-prefs")).theme === (startDark ? "light" : "dark"), "choice is remembered");
  Q("#themeBtn").click(); ok(D.documentElement.dataset.mode === (startDark ? "dark" : "light"), "second tap switches back");
  ok(!D.querySelector(".sheet"), "no settings sheet opens");

  // no recording: phone voice fallback
  en = []; w = await openPage("https://x.github.io/er/?e=zoo", { ...calm, mp3: false, dur: undefined, json: undefined }, en); await wait(150);
  const D2 = w.document;
  ok(D2.getElementById("seek") && +D2.getElementById("seek").max === nS - 1, "without a recording the bar moves by sentence");
  ok(D2.getElementById("back10").hidden && D2.getElementById("fwd10").hidden, "±10 s hidden without a recording");
  D2.getElementById("nextS").click(); await wait(10);
  ok(/^\d+\/\d+$/.test(D2.getElementById("tcur").textContent), "sentence counter shown (e.g. 2/12)");
  ok(en.filter(x => !/Not implemented/.test(x)).length === 0, "no JavaScript errors in the new features");

  console.log("\n" + (fails.length ? `${fails.length} FAILED` : "ALL PASSED")); process.exit(fails.length ? 1 : 0);
})();
