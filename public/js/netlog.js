// Network log: the real requests this page makes, for the Network Monitor.
//
// Two sources are merged:
//   1. api.js reports every API call it makes (method, status, response
//      headers and body), including calls that are still in flight.
//   2. The browser's Resource Timing API reports everything else the page
//      loaded (HTML, JS, CSS, images, fonts) plus the timing phases of each
//      request (DNS, connect, TLS, waiting, download) and any Server-Timing
//      header the backend sent (Flask + MongoDB time).
// Nothing leaves the browser; this only shows the visitor their own traffic.

const MAX = 500;
const entries = [];
const listeners = new Set();
let seq = 0;
let queued = false;

function changed() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => { queued = false; for (const fn of listeners) fn(); });
}

const abs = (u) => { try { return new URL(u, location.href).href; } catch { return String(u); } };
const pathOf = (u) => { try { const x = new URL(u); return x.origin === location.origin ? x.pathname + x.search : x.host + x.pathname; } catch { return u; } };
const sameOrigin = (u) => { try { return new URL(u).origin === location.origin; } catch { return false; } };

function typeOf(initiator, url) {
  const p = (() => { try { return new URL(url).pathname.toLowerCase(); } catch { return ""; } })();
  if (initiator === "navigation") return "Doc";
  if (initiator === "fetch" || initiator === "xmlhttprequest" || initiator === "beacon") return p.startsWith("/api/") ? "API" : "Fetch";
  if (/\.(woff2?|ttf|otf)$/.test(p) || url.includes("fonts.gstatic")) return "Font";
  if (initiator === "css" || /\.css$/.test(p) || url.includes("fonts.googleapis")) return "CSS";
  if (initiator === "script" || /\.m?js$/.test(p)) return "JS";
  if (initiator === "img" || initiator === "image" || /\.(png|jpe?g|gif|svg|webp|avif|ico)$/.test(p)) return "Img";
  if (/\.pdf$/.test(p)) return "Doc";
  return "Other";
}

function add(e) {
  entries.push(e);
  if (entries.length > MAX) entries.splice(0, entries.length - MAX);
  changed();
  return e;
}

/** Copy timing phases out of a PerformanceResourceTiming / NavigationTiming entry. */
function applyTiming(e, t) {
  const z = (a, b) => (a > 0 && b > 0 && b >= a ? b - a : 0);
  e.start = t.startTime;
  e.end = t.responseEnd || t.startTime + t.duration;
  e.transfer = t.transferSize ?? 0;
  e.encoded = t.encodedBodySize ?? 0;
  e.decoded = t.decodedBodySize ?? 0;
  e.protocol = t.nextHopProtocol || e.protocol || "";
  if (t.responseStatus && !e.status) e.status = t.responseStatus;
  // Cross-origin resources without Timing-Allow-Origin report zeros here.
  e.detailed = t.requestStart > 0 || t.responseStart > 0;
  e.phases = [
    ["Queue", z(t.startTime, t.domainLookupStart || t.fetchStart)],
    ["DNS", z(t.domainLookupStart, t.domainLookupEnd)],
    ["Connect", z(t.connectStart, t.secureConnectionStart || t.connectEnd)],
    ["TLS", z(t.secureConnectionStart, t.connectEnd)],
    ["Waiting", z(t.requestStart, t.responseStart)],
    ["Download", z(t.responseStart, t.responseEnd)],
  ];
  e.serverTiming = (t.serverTiming || []).map((s) => ({ name: s.name, dur: s.duration, desc: s.description }));
  e.timed = true;
}

/* ── 1. calls made through api.js ── */
export const netlog = {
  /** Start of an API call. Returns the record to pass to end()/fail(). */
  begin(method, url, reqBody) {
    const u = abs(url);
    return add({
      id: ++seq, source: "api", method, url: u, path: pathOf(u), type: typeOf("fetch", u),
      start: performance.now(), end: null, pending: true, status: 0,
      reqBody, resHeaders: null, resBody: null, timed: false, sameOrigin: sameOrigin(u),
    });
  },
  end(rec, { status, statusText, headers, body, size }) {
    Object.assign(rec, { pending: false, status, statusText, resHeaders: headers, resBody: body, size });
    if (!rec.timed) rec.end = performance.now();
    adoptTiming(rec);
    changed();
  },
  fail(rec, error) {
    Object.assign(rec, { pending: false, error: String(error?.message || error), end: performance.now() });
    changed();
  },
  entries: () => entries,
  clear() { entries.length = 0; changed(); },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

/* ── 2. everything the browser loaded ── */
const unmatched = []; // fetch timings that arrived before api.js finished with the call

function adoptTiming(rec) {
  const i = unmatched.findIndex((t) => t.name === rec.url && Math.abs(t.startTime - rec.start) < 150);
  if (i >= 0) applyTiming(rec, unmatched.splice(i, 1)[0]);
}

function onTiming(t) {
  const isFetch = t.initiatorType === "fetch" || t.initiatorType === "xmlhttprequest";
  if (isFetch) {
    const rec = entries.find((e) => e.source === "api" && !e.timed && e.url === t.name && Math.abs(e.start - t.startTime) < 150);
    if (rec) { applyTiming(rec, t); changed(); return; }
    // api.js may not have created the record yet; hold on to it briefly
    unmatched.push(t);
    setTimeout(() => {
      const i = unmatched.indexOf(t);
      if (i >= 0) { unmatched.splice(i, 1); addResource(t); }
    }, 3000);
    return;
  }
  addResource(t);
}

function addResource(t) {
  const isNav = t.entryType === "navigation";
  const e = {
    id: ++seq, source: isNav ? "navigation" : "resource", method: "GET", url: t.name, path: pathOf(t.name),
    type: typeOf(isNav ? "navigation" : t.initiatorType, t.name), pending: false, status: 0,
    sameOrigin: sameOrigin(t.name),
  };
  applyTiming(e, t);
  add(e);
}

try {
  performance.setResourceTimingBufferSize?.(1000);
  const nav = performance.getEntriesByType("navigation")[0];
  if (nav) addResource(nav);
  new PerformanceObserver((list) => list.getEntries().forEach(onTiming)).observe({ type: "resource", buffered: true });
} catch { /* very old browser: only api.js calls are shown */ }
