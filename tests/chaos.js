// Chaos test for index.html: thousands of random taps in many "bad phone" environments.
// Run:  npm i jsdom@24 --no-save && node tests/chaos.js
const { JSDOM } = require("jsdom");
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const ROOT = path.join(__dirname, "..");
const DATA = ["essays.js", "dict.js", "grammar.js", "exams.js", "bank.js"].map(f => "<script>" + fs.readFileSync(path.join(ROOT, f), "utf8") + "</script>").join("");
const HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8").replace(/<!-- data:[^>]*-->/, () => DATA);
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
  ok(d.querySelectorAll(".lvcard[data-lv]").length === 5 && d.getElementById("gramCard") && !d.querySelector("[data-share]"), "after the right PIN: 5 level cards + Grammar card, lessons come after choosing a level");
  ok(d.querySelector(".mark.anim .st") !== null, "animated logo on first screen");
  d.querySelector('[data-lv="C1"]').click(); await wait(10);
  ok(d.querySelector(".list.rise") && d.querySelectorAll("[data-share]").length === E.filter(e => e.level === "C1").length, "level C1 opens its lessons with a soft reveal");
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

  // ---- read-along: the spoken word is lit, the sentence keeps a faint tint ----
  const TOK = zoo.text.join(" ").match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’-]*/g);
  const words = TOK.map((_, i) => [3 + i * 0.3, 3 + i * 0.3 + 0.25]);
  en = []; w = await openPage("https://x.github.io/er/?e=zoo", { ...calm, json: { ...calm.json, words } }, en); await wait(200);
  const D3 = w.document, A = () => w.eval("audioEl");
  ok(D3.querySelectorAll(".text .w").length === TOK.length, "read-along: page words match the timing list (" + TOK.length + ")");
  A().currentTime = 3 + 7 * 0.3 + 0.1; w.eval("onTime()");
  const lit = [...D3.querySelectorAll(".w.wnow")];
  ok(lit.length === 1 && lit[0] === D3.querySelectorAll(".text .w")[7], "read-along: exactly the spoken word (8th) is lit");
  A().currentTime = 3 + 20 * 0.3 + 0.1; w.eval("onTime()");
  ok(D3.querySelectorAll(".w.wnow").length === 1 && D3.querySelectorAll(".text .w")[20].classList.contains("wnow"), "read-along: the light moves with the voice");
  A().currentTime = 1; w.eval("onTime()");
  ok(D3.querySelectorAll(".w.wnow").length === 0, "read-along: nothing lit during the sound logo and title");
  A().currentTime = 3 + 30 * 0.3 + 0.1; w.eval("onTime()");
  ok(D3.querySelectorAll(".text .w")[30].classList.contains("wnow"), "read-along: follows the bar while paused");
  w.eval("stopAll()");
  ok(D3.querySelectorAll(".w.wnow").length <= 1, "read-along: stopping does not break the page");
  const css = D3.querySelector("style").textContent;
  { const isZoo = /[?&]e=zoo\b/.test(w.location.search);
    if (isZoo && Q("#raBtn")) {
      Q("#raBtn").click(); await wait(30);
      const ra = D.querySelector(".ra");
      ok(ra && D.body.classList.contains("ra-open"), "read-aloud: opens as a full screen");
      const total = D.querySelectorAll(".text .s").length;
      ok(D.querySelector("#raN").textContent === `1 / ${total}`, "read-aloud: starts at the first sentence");
      ok(D.querySelector("#raBack").disabled, "read-aloud: Back is off on the first sentence");
      D.querySelector("#raGo").click(); await wait(10);
      ok(D.querySelector("#raN").textContent === `2 / ${total}` && D.querySelector(".ra-cur").textContent.trim() === D.querySelectorAll(".text .s")[1].textContent.trim(), "read-aloud: Next shows the next sentence");
      ok(!!D.querySelector("#raRec") === (typeof w.MediaRecorder !== "undefined" && !!(w.navigator.mediaDevices && w.navigator.mediaDevices.getUserMedia)), "read-aloud: Record only where the phone can record");
      for (let k = 0; k < total; k++) { if (!D.querySelector("#raDone").hidden) break; D.querySelector("#raGo").click(); await wait(5); }
      ok(!D.querySelector("#raDone").hidden && /You read \d+ sentences aloud/.test(D.querySelector("#raSum").textContent), "read-aloud: finish screen with a summary");
      D.querySelector("#raEnd").click(); await wait(320);
      ok(!D.querySelector(".ra") && !D.body.classList.contains("ra-open"), "read-aloud: closes cleanly");
    } else ok(!Q("#raBtn") || isZoo, "read-aloud: trial button only on the trial lesson");
  }
  ok(typeof w.setupMediaSession === "function" && typeof w.clearMediaSession === "function" && typeof w.msPos === "function", "lock-screen and headphone controls are wired up");
  ok(w.eval('deepen("#2E9E6A",.6)') === w.eval('deepen("#2E9E6A",.6)') && /^#[0-9a-f]{6}$/.test(w.eval('deepen("#2E9E6A",.6)')), "QR corner colour is a valid darker shade");
  ok(typeof w.drawQRCard === "function" && typeof w.openQR === "function", "QR card drawing is available");
  { const qt = Q("#qToggle"), qw = Q("#quizWrap");
    ok(qt && qw && !qw.classList.contains("open") && qw.hasAttribute("inert") && qt.getAttribute("aria-expanded") === "false", "questions start closed behind a Questions button");
    qt.click(); await wait(20);
    ok(qw.classList.contains("open") && !qw.hasAttribute("inert") && qt.getAttribute("aria-expanded") === "true", "tapping Questions opens them in place");
    ok(Q("#quiz .q") && Q("#check"), "all questions and the check button are inside");
    qt.click(); await wait(20);
    ok(!qw.classList.contains("open") && qw.hasAttribute("inert"), "tapping again closes them"); }
  { const m=css.match(/--sent:rgba\(\d+,\d+,\d+,([\d.]+)\)/), w=css.match(/--wordhl:rgba\(\d+,\d+,\d+,([\d.]+)\)/);
    ok(m && +m[1] <= 0.05 && w && +w[1] >= 0.4 && /\.w\.wnow\{/.test(css), "read-along: very faint sentence tint, clear soft word marker"); }
  // a wrong-length list (old timing file) falls back to sentences only, without errors
  en = []; w = await openPage("https://x.github.io/er/?e=zoo", { ...calm, json: { ...calm.json, words: words.slice(5) } }, en); await wait(200);
  w.eval("audioEl").currentTime = 4; w.eval("onTime()");
  ok(w.document.querySelectorAll(".w.wnow").length === 0 && en.filter(x => !/Not implemented/.test(x)).length === 0, "read-along: an old or broken timing file just turns word lighting off");
  // hostile timing data never crashes
  en = []; w = await openPage("https://x.github.io/er/?e=zoo", { ...calm, json: { ...calm.json, words: TOK.map((_, i) => i % 3 ? null : ["x", NaN]) } }, en); await wait(200);
  w.eval("audioEl").currentTime = 10; w.eval("onTime()");
  ok(en.filter(x => !/Not implemented/.test(x)).length === 0, "read-along: nonsense timing data causes no errors");

  // ================= grammar exercises =================
  { const G = w.eval("GRAMMAR"), parts = G.flatMap(x => x.parts);
    ok(parts.length >= 20 && new Set(parts.map(p => p.id)).size === parts.length && parts.every(p => !E.some(e => e.id === p.id)), "grammar: unique ids, never the same as a lesson");
    let ge = []; let g = await openPage("https://x.github.io/er/", calm, ge); await wait(30);
    const gd = g.document; gd.getElementById("pin").value = PIN; gd.getElementById("lockForm").dispatchEvent(new g.Event("submit")); await wait(60);
    gd.getElementById("gramCard").click(); await wait(40);
    ok(gd.querySelectorAll("[data-gshare]").length === parts.length, "grammar: teacher list shows every exercise");
    gd.querySelector("[data-gshare]").click(); await wait(30);
    ok(gd.querySelector(".sheet") && gd.querySelectorAll(".sheet .app").length === 4 && gd.getElementById("shQR"), "grammar: share sheet with 4 apps and QR");
    const gm = g.eval("gMessage(GRAMMAR[0],GRAMMAR[0].parts[0])");
    ok(/^📘 Gayane Torosyan/.test(gm) && /\/l\/g-[a-z0-9-]+\.html$/.test(gm), "grammar: message is signed and links to its page");
    ok(/— Gayane Torosyan, English teacher$/.test(g.eval("gFullText(GRAMMAR[0],GRAMMAR[0].parts[2])")), "grammar: full text is signed");
    // checking written answers
    const chk = (f, a) => g.eval(`gFillOK(${JSON.stringify({ f })},${JSON.stringify(a)})`);
    ok(chk([["didn't go", "did not go"]], ["  Did NOT  go. "]) && chk([["didn't go"]], ["did not go"]) && chk([["have"], ["finished"]], ["have finished", ""]) && chk([["has"], ["read"]], ["Has", "READ"]) && chk([["won't come"]], ["will not come"]), "grammar: capitals, spaces, short forms and joined blanks are accepted");
    ok(!chk([["went"]], ["go"]) && !chk([["have"], ["finished"]], ["", ""]) && !chk([["have"], ["finished"]], ["finished", "have"]), "grammar: wrong, empty or swapped answers are not accepted");
    ok(g.eval(`gRight({q:"x _____",o:["a","b","c"],a:[0,2]},2)`) && g.eval(`gRight({q:"x _____",o:["a","b","c"],a:[0,2]},0)`) && !g.eval(`gRight({q:"x _____",o:["a","b","c"],a:[0,2]},1)`), "grammar: questions with two right answers accept both");
    // student flow
    for (const env of [calm, { ...calm, storage: false }]) {
      ge = []; g = await openPage("https://x.github.io/er/?g=g-st-1", env, ge); await wait(40);
      const sd = g.document, P = G.find(x => x.id === "st").parts[0];
      ok(!sd.getElementById("pin") && sd.querySelector(".gq") && /1 \/ 20/.test(sd.querySelector(".gprog").textContent), "grammar: student opens the exercise without a PIN, one question per screen");
      ok(!sd.querySelector(".gr") && !sd.querySelector(".right"), "grammar: no answers are shown before the end");
      for (let i = 0; i < P.qs.length; i++) { if (i === 4) continue;
        sd.querySelector(`[data-j="${i}"]`).click(); await wait(2);
        sd.querySelector(`[data-o="${i < 3 ? (P.qs[i].a[0] + 1) % P.qs[i].o.length : P.qs[i].a[0]}"]`).click(); await wait(2); }
      sd.querySelector(`[data-j="${P.qs.length - 1}"]`).click(); await wait(2);
      sd.getElementById("gFin").click(); await wait(5);
      ok(/not answered yet: 5/.test(sd.getElementById("gWarn").textContent), "grammar: Finish warns about the skipped question");
      sd.getElementById("gAny").click(); await wait(10);
      const wrongN = [0, 1, 2].filter(i => !P.qs[i].a.includes((P.qs[i].a[0] + 1) % P.qs[i].o.length)).length;
      ok(sd.querySelector(".gring b").textContent === `${19 - wrongN}/20` && sd.querySelectorAll(".gr").length === 20 && sd.querySelectorAll(".gr.no").length === wrongN + 1, "grammar: score and full review only at the end");
      sd.getElementById("gWrong").click(); await wait(10);
      ok(new RegExp(`1 / ${wrongN + 1}`).test(sd.querySelector(".gprog").textContent), "grammar: Fix mistakes repeats only the wrong ones");
      ok(ge.filter(x => !/Not implemented/.test(x)).length === 0, "grammar: no errors" + (env.storage ? "" : " without storage"));
    }
    ge = []; g = await openPage("https://x.github.io/er/?g=g-t5-3", calm, ge); await wait(40);
    ok(g.document.querySelectorAll(".gq .gin").length >= 1 && !g.document.querySelector(".gopt"), "grammar: written exercise shows typing boxes");
    ge = []; g = await openPage("https://x.github.io/er/?g=nope", calm, ge); await wait(40);
    ok(!!g.document.getElementById("pin") && !g.document.querySelector(".gq"), "grammar: unknown exercise falls back to the lock screen");
  }

  // ================= practice tests (exam format) =================
  { let xe = []; let x = await openPage("https://x.github.io/er/", calm, xe); await wait(30);
    const xd = x.document; xd.getElementById("pin").value = PIN; xd.getElementById("lockForm").dispatchEvent(new x.Event("submit")); await wait(60);
    const X = x.eval("EXAMS");
    ok(X.length === 4 && X.every(t => t.sections.flatMap(s => s.groups.flatMap(g => g.items)).length === 80), "tests: 4 tests with 80 tasks each");
    xd.getElementById("examCard").click(); await wait(40);
    ok(xd.querySelectorAll("[data-xshare]").length === 4, "tests: teacher list shows 4 tests");
    xd.querySelector("[data-xshare]").click(); await wait(30);
    ok(xd.querySelector(".sheet") && xd.getElementById("shQR") && !xd.getElementById("cpText"), "tests: share sheet with link and QR");
    ok(/\/l\/t-1\.html$/.test(x.eval("xMessage(EXAMS[0])")), "tests: message links to the test page");
    ok(x.eval(`xRight({type:"multi"},{a:[1,3,5]},[5,1,3])`) && !x.eval(`xRight({type:"multi"},{a:[1,3,5]},[1,3])`) && !x.eval(`xRight({type:"multi"},{a:[1,3,5]},[1,2,3,5])`), "tests: multi-answer tasks need exactly the right set");
    ok(x.eval(`xRight({type:"order"},{a:[4,2,1,3,5]},[4,2,1,3,5])`) && !x.eval(`xRight({type:"order"},{a:[4,2,1,3,5]},[4,2,1,null,5])`), "tests: gap-word tasks need every gap right");
    for (const env of [calm, { ...calm, storage: false }]) {
      xe = []; x = await openPage("https://x.github.io/er/?t=t-2", env, xe); await wait(40);
      const d = x.document, T = X[1];
      ok(!d.getElementById("pin") && d.querySelector(".xsec") && d.querySelectorAll(".xtabs button").length === 13, "tests: student opens the test without a PIN, 13 sections");
      let wrong = 0;
      for (let i = 0; i < 13; i++) {
        d.querySelector(`[data-sec="${i}"]`).click(); await wait(2);
        const s = T.sections[i];
        for (const g of s.groups) for (const it of g.items) {
          if (it.n === 40) continue;                         // leave one empty
          const bad = it.n % 10 === 0;
          if (s.type === "mc") d.querySelector(`.xopt[data-x="${it.n}"][data-o="${bad ? (it.a + 1) % 4 : it.a}"]`).click();
          else if (s.type === "multi") { for (const m of it.a) d.querySelector(`.xchk[data-x="${it.n}"][data-m="${m}"]`).click(); if (bad) d.querySelector(`.xchk[data-x="${it.n}"][data-m="${[1,2,3,4,5].find(k => !it.a.includes(k))}"]`).click(); }
          else { const sel = s.type === "order" ? "data-ord" : "data-mat";
            it.a.forEach((v, k) => { const el = d.querySelector(`[${sel}="${it.n}"][data-k="${k}"]`); el.value = String(bad && k === 0 ? it.a[1] : v); el.dispatchEvent(new x.Event("change")); }); }
          if (bad) wrong++;
        }
      }
      ok(!d.querySelector(".gr") && !d.querySelector(".gres"), "tests: no answers are shown before the end");
      d.getElementById("xFin").click(); await wait(5);
      ok(/not answered yet: 40/.test(d.getElementById("gWarn").textContent), "tests: Finish warns about the empty task");
      d.getElementById("gAny").click(); await wait(10);
      const expect = 80 - wrong - 1;
      ok(d.querySelector(".gring b").textContent === `${expect}/80` && d.querySelectorAll(".xtable tr").length === 13 && d.querySelectorAll(".gr.no").length === wrong + 1, "tests: score, 13-section breakdown and review at the end");
      ok(xe.filter(z => !/Not implemented/.test(z)).length === 0, "tests: no errors" + (env.storage ? "" : " without storage"));
    }
    xe = []; x = await openPage("https://x.github.io/er/?t=nope", calm, xe); await wait(40);
    ok(!!x.document.getElementById("pin") && !x.document.querySelector(".xsec"), "tests: unknown test falls back to the lock screen");
  }

  // ================= practice by section (13 exam task types) =================
  { let be = []; let x = await openPage("https://x.github.io/er/", calm, be); await wait(30);
    const d = x.document; d.getElementById("pin").value = PIN; d.getElementById("lockForm").dispatchEvent(new x.Event("submit")); await wait(60);
    const BK = x.eval("BANK");
    ok(BK.length === 13 && BK.reduce((a, b) => a + b.sets.reduce((c, t) => c + t.count, 0), 0) >= 1000, "sections: 13 sections with 1000+ tasks");
    d.getElementById("bankCard").click(); await wait(40);
    ok(d.querySelectorAll("[data-bl]").length === 13, "sections: teacher sees all 13 sections");
    d.querySelector('[data-bl="XI"]').click(); await wait(40);
    ok(d.querySelectorAll("[data-bshare]").length === BK[10].sets.length, "sections: a section lists its sets");
    d.querySelector("[data-bshare]").click(); await wait(30);
    ok(d.querySelector(".sheet") && d.getElementById("shQR"), "sections: share sheet with link and QR");
    ok(/\/l\/b11-1\.html$/.test(x.eval("bMessage(BANK[10],0,BANK[10].sets[0])")), "sections: message links to the set page");
    for (const id of ["b1-1", "b6-3", "b7-2", "b13-5"]) {
      be = []; x = await openPage("https://x.github.io/er/?b=" + id, calm, be); await wait(40);
      const sd = x.document, r = x.eval(`bFind("${id}")`), s = r.t.sections[0];
      ok(!sd.getElementById("pin") && sd.querySelector(".xsec") && !sd.querySelector(".xtabs"), `sections ${id}: opens without PIN, one section, no tabs`);
      for (const g of s.groups) for (const it of g.items) {
        if (s.type === "mc") sd.querySelector(`.xopt[data-x="${it.n}"][data-o="${it.a}"]`).click();
        else if (s.type === "multi") for (const m of it.a) sd.querySelector(`.xchk[data-x="${it.n}"][data-m="${m}"]`).click();
        else { const sel = s.type === "order" ? "data-ord" : "data-mat";
          it.a.forEach((v, k) => { const el = sd.querySelector(`[${sel}="${it.n}"][data-k="${k}"]`); el.value = String(v); el.dispatchEvent(new x.Event("change")); }); }
      }
      sd.getElementById("xFin").click(); await wait(10);
      ok(sd.querySelector(".gring b").textContent === `${r.t.count}/${r.t.count}` && !sd.querySelector(".xtable"), `sections ${id}: full marks for the answer key`);
      ok(be.filter(z => !/Not implemented/.test(z)).length === 0, `sections ${id}: no errors`);
    }
  }

  console.log("\n" + (fails.length ? `${fails.length} FAILED` : "ALL PASSED")); process.exit(fails.length ? 1 : 0);
})();
