/* Gayane Torosyan | English Reading Room - offline support.
   Online: everything comes fresh from the internet (new lessons appear at once).
   Offline: pages, lessons, the dictionary and recordings already opened are served from the phone. */
const CACHE = "reading-room-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", ev => ev.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener("fetch", ev => {
  const r = ev.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  const same = u.origin === self.location.origin;
  const font = /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(u.hostname);
  if (!same && !font) return;                       // English definitions etc. stay online-only
  if (/\.mp3$/.test(u.pathname)) { ev.respondWith(audio(r)); return; }
  ev.respondWith(networkFirst(r, ev, u));
});

async function networkFirst(r, ev, u) {
  const c = await caches.open(CACHE);
  try {
    const res = await fetch(r);
    if (res && (res.ok || res.type === "opaque")) {
      ev.waitUntil(c.put(r, res.clone()).catch(() => {}));
      // a lesson page asked for its timing file -> keep its recording for offline too
      if (/\/audio\/[^/]+\.json$/.test(u.pathname) && /[?&]e=/.test(r.referrer || ""))
        ev.waitUntil(keepRecording(c, u.href.replace(/\.json(\?.*)?$/, ".mp3")));
    }
    return res;
  } catch (err) {
    const hit = await c.match(r, { ignoreSearch: r.mode === "navigate" })
             || (r.mode === "navigate" ? await c.match(new URL("./", self.location).href, { ignoreSearch: true }) : null);
    if (hit) return hit;
    throw err;
  }
}

async function keepRecording(c, url) {
  try {
    if (await c.match(url)) return;
    const res = await fetch(url);
    if (res.ok) await c.put(url, res);
  } catch (e) {}
}

async function audio(r) {
  try { return await fetch(r); }
  catch (err) {
    const c = await caches.open(CACHE);
    const hit = await c.match(r.url, { ignoreSearch: true });
    if (!hit) throw err;
    const range = r.headers.get("range");
    if (!range) return hit;
    const buf = await hit.arrayBuffer(), size = buf.byteLength;
    const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
    let s = m[1] ? +m[1] : 0, e = m[2] ? +m[2] : size - 1;
    if (!m[1] && m[2]) { s = Math.max(0, size - +m[2]); e = size - 1; }
    e = Math.min(e, size - 1);
    return new Response(buf.slice(s, e + 1), { status: 206, headers: {
      "Content-Type": "audio/mpeg", "Content-Range": `bytes ${s}-${e}/${size}`,
      "Content-Length": String(e - s + 1), "Accept-Ranges": "bytes" } });
  }
}
