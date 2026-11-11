// Tiny fetch wrapper: always resolves to { ok, status, data }.
// Every call is also reported to the network log (see netlog.js).
import { netlog } from "./netlog.js";

const PREVIEW = 4000; // characters of a response body kept for the Network Monitor

/** Request bodies are shown in the Network Monitor, except private ones. */
const describeBody = (path, body) =>
  body === undefined ? null : path.startsWith("/api/contact") ? "(hidden: contains your message)" : JSON.stringify(body, null, 2);

export async function api(path, body) {
  const init = body === undefined
    ? { headers: { Accept: "application/json" } }
    : { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) };
  const rec = netlog.begin(init.method || "GET", path, describeBody(path, body));
  try {
    const res = await fetch(path, init);
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* non-JSON body */ }
    netlog.end(rec, {
      status: res.status,
      statusText: res.statusText,
      headers: [...res.headers.entries()],
      body: text.length > PREVIEW ? text.slice(0, PREVIEW) + "\n…" : text,
      size: new Blob([text]).size,
    });
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    netlog.fail(rec, err);
    return { ok: false, status: 0, data: { error: "Network error: is the server running?" } };
  }
}
