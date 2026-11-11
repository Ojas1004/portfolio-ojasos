// Network Monitor: a live request inspector for this page's real traffic.
// Rows stream in as the page talks to the server (terminal commands, Ask Ojas,
// the visitor counter, contact form...) and as assets load. Pick a row to see
// its headers, response and timing, including Flask/MongoDB time from the
// Server-Timing header.
import { api } from "./api.js";
import { netlog } from "./netlog.js";
import { escapeHtml, isMobile } from "./wm.js";

const FILTERS = ["All", "API", "Doc", "JS", "CSS", "Img", "Font", "Other"];
const PHASE_CLASS = { Queue: "q", DNS: "dns", Connect: "con", TLS: "tls", Waiting: "wait", Download: "dl" };

const kb = (n) => (n == null ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`);
const ms = (n) => (n == null ? "" : n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${Math.round(n)} ms`);
const statusClass = (e) => (e.error ? "s5" : !e.status ? "s0" : e.status >= 500 ? "s5" : e.status >= 400 ? "s4" : e.status >= 300 ? "s3" : "s2");
const matchFilter = (e, f) => f === "All" || (f === "API" ? e.type === "API" || e.type === "Fetch" : e.type === f);

function sizeLabel(e) {
  if (e.pending) return "";
  if (e.error) return "failed";
  if (e.source === "api") return kb(e.transfer || e.size);
  if (e.transfer) return kb(e.transfer);
  if (e.encoded) return "(cache)";
  return e.sameOrigin ? "0 B" : "-";
}

const STATUS_TEXT = { 200: "OK", 201: "Created", 204: "No Content", 304: "Not Modified", 400: "Bad Request", 401: "Unauthorized", 404: "Not Found", 429: "Too Many Requests", 500: "Internal Server Error", 503: "Service Unavailable" };

export function createNetwork() {
  return {
    title: "Network Monitor",
    width: 860,
    height: 560,
    unmount: (win) => win.cleanup?.(),
    mount(body, { win }) {
      body.classList.add("net-wrap");
      body.innerHTML = `
        <div class="net">
          <div class="net-bar">
            <button type="button" class="net-rec is-on" data-rec aria-pressed="true" title="Pause / resume the live view">● rec</button>
            <button type="button" class="net-btn" data-clear title="Clear the list">Clear</button>
            <button type="button" class="net-btn" data-ping title="Send GET /api/health: a real round trip to the server and MongoDB">Ping server</button>
            <input class="net-filter" type="search" placeholder="Filter: /api/" aria-label="Filter by path" spellcheck="false">
            <div class="net-chips" role="group" aria-label="Request type">
              ${FILTERS.map((f) => `<button type="button" data-f="${f}" aria-pressed="${f === "All"}">${f}</button>`).join("")}
            </div>
          </div>
          <div class="net-table" role="table" aria-label="Requests">
            <div class="net-row net-head" role="row">
              <span role="columnheader">Method</span><span role="columnheader">Path</span><span role="columnheader">Status</span>
              <span role="columnheader" class="c-type">Type</span><span role="columnheader">Time</span><span role="columnheader" class="c-size">Size</span>
              <span role="columnheader" class="c-wf">Waterfall</span>
            </div>
            <div class="net-rows" role="rowgroup"></div>
          </div>
          <div class="net-detail" hidden>
            <div class="net-tabs" role="tablist">
              <button type="button" role="tab" data-tab="headers" aria-selected="true">Headers</button>
              <button type="button" role="tab" data-tab="response" aria-selected="false">Response</button>
              <button type="button" role="tab" data-tab="timing" aria-selected="false">Timing</button>
              <button type="button" class="net-x" data-close aria-label="Close details">×</button>
            </div>
            <div class="net-pane" role="tabpanel"></div>
          </div>
          <div class="net-status"><span class="net-summary"></span><span class="net-note">your own traffic · stays in your browser</span></div>
        </div>`;

      const $ = (s) => body.querySelector(s);
      const rowsEl = $(".net-rows");
      const detail = $(".net-detail");
      const pane = $(".net-pane");
      const summary = $(".net-summary");
      const recBtn = $("[data-rec]");
      let filter = "All";
      let text = "";
      let live = true;
      let selected = null;
      let tab = "headers";
      let frame = 0;
      let reveal = false; // scroll the selected row into view on the next render

      const visible = () => netlog.entries().filter((e) => matchFilter(e, filter) && (!text || e.path.toLowerCase().includes(text)));

      function render() {
        frame = 0;
        const list = visible();
        const all = netlog.entries();
        const errors = all.filter((e) => e.error || e.status >= 400).length;
        const bytes = all.reduce((n, e) => n + (e.transfer || (e.source === "api" ? e.size || 0 : 0)), 0);
        summary.innerHTML = `<b>${list.length}</b>${list.length !== all.length ? ` / ${all.length}` : ""} requests · <span class="${errors ? "s4" : ""}">${errors} error${errors === 1 ? "" : "s"}</span> · ${kb(bytes)} transferred`;

        // waterfall scale: from the first visible request to the latest finish
        const now = performance.now();
        const t0 = list.length ? Math.min(...list.map((e) => e.start)) : 0;
        const t1 = Math.max(t0 + 50, ...list.map((e) => (e.pending ? now : e.end ?? e.start)));
        const span = t1 - t0;

        const atBottom = rowsEl.scrollHeight - rowsEl.scrollTop - rowsEl.clientHeight < 24;
        const focusedId = document.activeElement?.closest?.(".net-row")?.dataset.id;
        rowsEl.innerHTML = list.length ? list.map((e) => {
          const end = e.pending ? now : e.end ?? e.start;
          const left = ((e.start - t0) / span) * 100;
          const width = Math.max(0.6, ((end - e.start) / span) * 100);
          const wait = e.phases ? e.phases.slice(0, 4).reduce((n, [, v]) => n + v, 0) : 0; // queue + DNS + connect + TLS, drawn grey
          const waitPct = e.timed && end > e.start ? Math.min(100, (wait / (end - e.start)) * 100) : 0;
          const st = e.pending ? `<span class="spin" aria-label="pending"></span>` : e.error ? "(failed)" : e.status || (e.sameOrigin ? "-" : "(opaque)");
          return `<div class="net-row${e.id === selected ? " is-sel" : ""}${e.pending ? " is-pending" : ""}" role="row" tabindex="0" data-id="${e.id}">
            <span class="m m-${e.method}">${e.method}</span>
            <span class="p" title="${escapeHtml(e.url)}">${escapeHtml(e.path)}</span>
            <span class="${statusClass(e)}">${st}</span>
            <span class="c-type t">${e.type}</span>
            <span class="${(end - e.start) > 500 ? "slow" : "dim"}">${e.pending ? "" : ms(end - e.start)}</span>
            <span class="c-size dim">${sizeLabel(e)}</span>
            <span class="c-wf wf"><i class="bar ${statusClass(e)}" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%;--wait:${waitPct.toFixed(1)}%"></i></span>
          </div>`;
        }).join("") : `<p class="net-empty">${netlog.entries().length ? "No requests match this filter." : "Waiting for requests... try typing a command in the Terminal."}</p>`;
        if (atBottom) rowsEl.scrollTop = rowsEl.scrollHeight;
        if (focusedId) rowsEl.querySelector(`[data-id="${focusedId}"]`)?.focus({ preventScroll: true });
        if (selected != null) renderDetail(false);
        if (reveal) { reveal = false; rowsEl.querySelector(".is-sel")?.scrollIntoView({ block: "nearest" }); }
        // keep spinners and pending bars moving while anything is in flight
        if (list.some((e) => e.pending)) schedule();
      }

      const schedule = () => { if (!frame) frame = requestAnimationFrame(render); };
      const unlisten = netlog.on(() => { if (live) schedule(); });

      /* ── detail panel ── */
      const kv = (rows) => `<dl class="net-kv">${rows.map(([k, v, cls = ""]) => `<dt>${escapeHtml(k)}</dt><dd class="${cls}">${escapeHtml(String(v))}</dd>`).join("")}</dl>`;

      let shown = "";
      function renderDetail(force = true) {
        const e = netlog.entries().find((x) => x.id === selected);
        if (!e) { closeDetail(); return; }
        // live updates only redraw the panel when this request changed (keeps scroll position)
        const key = `${e.id}:${tab}:${e.pending}:${e.timed}:${e.status}`;
        if (!force && key === shown) return;
        shown = key;
        detail.hidden = false;
        body.querySelectorAll("[data-tab]").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === tab)));
        if (tab === "headers") {
          const general = [
            ["Request URL", e.url],
            ["Method", e.method, `m-${e.method}`],
            ["Status", e.pending ? "pending..." : e.error ? `failed: ${e.error}` : e.status ? `${e.status} ${e.statusText || STATUS_TEXT[e.status] || ""}` : "not reported by the browser", statusClass(e)],
            ["Type", e.type],
          ];
          if (e.protocol) general.push(["Protocol", e.protocol]);
          let html = `<h5>General</h5>${kv(general)}`;
          if (e.resHeaders?.length) html += `<h5>Response headers</h5>${kv(e.resHeaders.map(([k, v]) => [k, v, k === "server-timing" ? "hl" : ""]))}`;
          else if (e.source !== "api") html += `<p class="dim">Response headers are only captured for API calls the page makes itself. The browser doesn't expose them for scripts, styles and images.</p>`;
          if (e.reqBody) html += `<h5>Request body</h5><pre>${escapeHtml(e.reqBody)}</pre>`;
          pane.innerHTML = html;
        } else if (tab === "response") {
          if (e.resBody != null) {
            let pretty = e.resBody;
            try { pretty = JSON.stringify(JSON.parse(e.resBody), null, 2); } catch { /* not JSON */ }
            pane.innerHTML = `<pre>${escapeHtml(pretty)}</pre>`;
          } else pane.innerHTML = `<p class="dim">${e.pending ? "Waiting for the response..." : "The response body is only kept for API calls. Open the URL to see this file."}</p>${e.sameOrigin && !e.pending ? `<p><a href="${escapeHtml(e.url)}" target="_blank" rel="noopener">${escapeHtml(e.path)}</a></p>` : ""}`;
        } else {
          let html = "";
          if (e.timed && e.detailed) {
            const total = Math.max(1, ...e.phases.map(([, v]) => v), 1);
            html += `<h5>Browser timing</h5><div class="net-phases">${e.phases.map(([k, v]) =>
              `<span>${k}</span><span class="track"><i class="ph ph-${PHASE_CLASS[k]}" style="width:${Math.max(v ? 1.5 : 0, (v / total) * 100).toFixed(1)}%"></i></span><span class="num">${v ? ms(v) : "0 ms"}</span>`).join("")}</div>`;
          } else if (e.timed) html += `<p class="dim">This is a cross-origin file, so the browser hides its timing details (no Timing-Allow-Origin header).</p>`;
          else html += `<p class="dim">${e.pending ? "Still in flight..." : "No timing details were reported for this request."}</p>`;
          if (e.serverTiming?.length) {
            const max = Math.max(...e.serverTiming.map((s) => s.dur), 1);
            html += `<h5>Server timing <small>(from the Server-Timing header)</small></h5><div class="net-phases">${e.serverTiming.map((s) =>
              `<span>${escapeHtml(s.desc || s.name)}</span><span class="track"><i class="ph ph-${s.name === "db" ? "db" : "app"}" style="width:${((s.dur / max) * 100).toFixed(1)}%"></i></span><span class="num">${ms(s.dur)}</span>`).join("")}</div>`;
          }
          const total = (e.end ?? performance.now()) - e.start;
          html += kv([["Started", `${ms(e.start)} after page load`], ["Total", ms(total)], ...(e.transfer ? [["Transferred", kb(e.transfer)]] : []), ...(e.decoded ? [["Resource size", kb(e.decoded)]] : [])]);
          pane.innerHTML = html;
        }
      }

      function select(id) {
        selected = id;
        reveal = true;
        renderDetail();
        render();
      }
      function closeDetail() {
        selected = null;
        detail.hidden = true;
        rowsEl.querySelectorAll(".is-sel").forEach((r) => r.classList.remove("is-sel"));
      }

      /* ── controls ── */
      rowsEl.addEventListener("click", (ev) => { const r = ev.target.closest(".net-row"); if (r) select(+r.dataset.id); });
      rowsEl.addEventListener("keydown", (ev) => {
        const r = ev.target.closest(".net-row");
        if (!r) return;
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select(+r.dataset.id); }
        else if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
          ev.preventDefault();
          const next = ev.key === "ArrowDown" ? r.nextElementSibling : r.previousElementSibling;
          if (next?.dataset.id) { next.focus(); select(+next.dataset.id); }
        }
      });
      $(".net-tabs").addEventListener("click", (ev) => {
        if (ev.target.closest("[data-close]")) return closeDetail();
        const t = ev.target.closest("[data-tab]");
        if (t) { tab = t.dataset.tab; renderDetail(); }
      });
      $(".net-chips").addEventListener("click", (ev) => {
        const b = ev.target.closest("[data-f]");
        if (!b) return;
        filter = b.dataset.f;
        body.querySelectorAll("[data-f]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        render();
      });
      $(".net-filter").addEventListener("input", (ev) => { text = ev.target.value.trim().toLowerCase(); render(); });
      recBtn.addEventListener("click", () => {
        live = !live;
        recBtn.classList.toggle("is-on", live);
        recBtn.setAttribute("aria-pressed", String(live));
        recBtn.textContent = live ? "● rec" : "❚❚ paused";
        if (live) render();
      });
      $("[data-clear]").addEventListener("click", () => { closeDetail(); netlog.clear(); render(); });
      $("[data-ping]").addEventListener("click", async (ev) => {
        const btn = ev.currentTarget;
        btn.disabled = true;
        await api("/api/health");
        btn.disabled = false;
        const last = [...netlog.entries()].reverse().find((e) => e.path.startsWith("/api/health"));
        if (last) { tab = "timing"; select(last.id); }
      });
      if (isMobile()) $(".net-note").textContent = "your own traffic";

      win.cleanup = () => { unlisten(); cancelAnimationFrame(frame); };
      render();
    },
  };
}
