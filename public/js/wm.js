// OjasOS window manager: open, close, minimize, maximize, drag, focus, taskbar.
import { icons } from "./icons.js";

/* ── touch edition ──
 * Narrow screens always get the touch layout (icon grid, full-screen windows,
 * single tap to open). Desktop visitors can switch to it from the desktop
 * menu; that choice is remembered in this browser. */
const narrow = window.matchMedia("(max-width: 767px)");
let touchChosen = (() => { try { return localStorage.getItem("ojasos:touch") === "1"; } catch { return false; } })();
const syncTouch = () => document.documentElement.classList.toggle("is-touch", touchChosen || narrow.matches);
narrow.addEventListener("change", syncTouch);
syncTouch();

export const isMobile = () => document.documentElement.classList.contains("is-touch");
export const touchEditionChosen = () => touchChosen;
export const narrowScreen = () => narrow.matches;
export function setTouchEdition(on) {
  touchChosen = !!on;
  try { localStorage.setItem("ojasos:touch", touchChosen ? "1" : "0"); } catch { /* storage blocked */ }
  syncTouch();
}

/** Broadcast a small OS event, e.g. "open:resume" or "cmd:sudo". */
export const emit = (name) => document.dispatchEvent(new CustomEvent("ojasos:event", { detail: name }));

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export class WindowManager {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.container  element windows are appended to
   * @param {HTMLElement} opts.taskbar    element taskbar buttons are appended to
   * @param {Record<string, object>} opts.apps  app registry
   */
  constructor({ container, taskbar, apps }) {
    this.container = container;
    this.taskbar = taskbar;
    this.apps = apps;
    this.windows = new Map(); // id -> win
    this.z = 10;
    this.spawnCount = 0;
  }

  /** Open a registered app (or focus it if already open). */
  open(appId, opts = {}) {
    const app = this.apps[appId];
    if (!app) return null;
    return this.openWindow({ id: appId, ...app, opts });
  }

  /**
   * Open a generic window. If a window with the same id exists it is restored
   * and focused instead.
   */
  openWindow({ id, title, icon, width = 560, height = 400, mount, unmount, bodyClass = "", folder = false, opts = {} }) {
    const existing = this.windows.get(id);
    if (existing) {
      this.restore(id);
      existing.onReopen?.(opts);
      return existing;
    }

    const el = document.createElement("section");
    el.className = "window";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", title);
    el.dataset.id = id;
    el.innerHTML = `
      <header class="titlebar">
        ${icon || ""}
        <h2>${escapeHtml(title)}</h2>
        <div class="controls">
          <button type="button" data-act="min" aria-label="Minimize" title="Minimize">${icons.min}</button>
          <button type="button" data-act="max" aria-label="Maximize" title="Maximize">${icons.max}</button>
          <button type="button" data-act="close" aria-label="Close" title="Close">${icons.close}</button>
        </div>
      </header>
      <div class="window-body ${bodyClass}"></div>`;

    // size + cascade position, kept inside the desktop
    const bounds = this.container.getBoundingClientRect();
    const w = Math.min(width, bounds.width - 24);
    const h = Math.min(height, bounds.height - 24);
    const step = (this.spawnCount++ % 7) * 28;
    const left = Math.max(8, Math.min((bounds.width - w) / 2 - 90 + step, bounds.width - w - 8));
    const top = Math.max(8, Math.min((bounds.height - h) / 2 - 70 + step, bounds.height - h - 8));
    Object.assign(el.style, { width: `${w}px`, height: `${h}px`, left: `${left}px`, top: `${top}px` });

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "task-btn";
    btn.innerHTML = `${icon || ""}<span>${escapeHtml(title)}</span>`;
    btn.title = title;

    const win = { id, el, btn, body: el.querySelector(".window-body"), minimized: false, folder, unmount, onReopen: null };
    this.windows.set(id, win);
    this.container.append(el);
    this.taskbar.append(btn);

    this.#wire(win);
    mount?.(win.body, { wm: this, win, opts });
    this.focus(id);
    emit(`open:${id}`);
    return win;
  }

  #wire(win) {
    const { el, btn, id } = win;
    const bar = el.querySelector(".titlebar");

    el.addEventListener("pointerdown", () => this.focus(id), true);

    el.querySelector(".controls").addEventListener("click", (e) => {
      const act = e.target.closest("button")?.dataset.act;
      if (act === "close") this.close(id);
      else if (act === "min") this.minimize(id);
      else if (act === "max") this.toggleMaximize(id);
    });

    bar.addEventListener("dblclick", (e) => {
      if (!e.target.closest(".controls")) this.toggleMaximize(id);
    });

    btn.addEventListener("click", () => {
      if (win.minimized) this.restore(id);
      else if (el.classList.contains("is-focused")) this.minimize(id);
      else this.focus(id);
    });

    // dragging via pointer events (mouse, pen and touch)
    bar.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest(".controls") || isMobile() || el.classList.contains("is-maximized")) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const origLeft = el.offsetLeft;
      const origTop = el.offsetTop;
      const maxX = this.container.clientWidth - 60;
      const maxY = this.container.clientHeight - 28;
      bar.setPointerCapture(e.pointerId);

      const move = (ev) => {
        const x = Math.min(Math.max(origLeft + ev.clientX - startX, 60 - el.offsetWidth), maxX);
        const y = Math.min(Math.max(origTop + ev.clientY - startY, 0), maxY);
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
      };
      const up = () => {
        bar.removeEventListener("pointermove", move);
        bar.removeEventListener("pointerup", up);
        bar.removeEventListener("pointercancel", up);
      };
      bar.addEventListener("pointermove", move);
      bar.addEventListener("pointerup", up);
      bar.addEventListener("pointercancel", up);
    });
  }

  focus(id) {
    const win = this.windows.get(id);
    if (!win) return;
    for (const other of this.windows.values()) {
      other.el.classList.toggle("is-focused", other === win);
      other.btn.classList.toggle("is-active", other === win);
    }
    if (win.el.style.zIndex != this.z) win.el.style.zIndex = ++this.z;
    win.el.dispatchEvent(new CustomEvent("wm:focus"));
  }

  minimize(id) {
    const win = this.windows.get(id);
    if (!win) return;
    emit(`minimize:${id}`);
    win.minimized = true;
    win.el.classList.add("is-minimized");
    win.el.classList.remove("is-focused");
    win.btn.classList.remove("is-active");
    this.#focusTopmost();
  }

  restore(id) {
    const win = this.windows.get(id);
    if (!win) return;
    win.minimized = false;
    win.el.classList.remove("is-minimized");
    this.focus(id);
  }

  /** Minimize everything; calling it again brings back what it hid. */
  showDesktop() {
    const visible = [...this.windows.values()].filter((w) => !w.minimized);
    if (visible.length) {
      this.hiddenByShowDesktop = visible.map((w) => w.id);
      visible.forEach((w) => this.minimize(w.id));
    } else {
      (this.hiddenByShowDesktop || []).forEach((id) => this.restore(id));
      this.hiddenByShowDesktop = [];
    }
  }

  toggleMaximize(id) {
    this.windows.get(id)?.el.classList.toggle("is-maximized");
  }

  close(id) {
    const win = this.windows.get(id);
    if (!win) return;
    emit(`close:${id}`);
    this.windows.delete(id);
    win.unmount?.(win);
    win.btn.remove();
    win.el.classList.add("is-closing");
    const done = () => win.el.remove();
    win.el.addEventListener("animationend", done, { once: true });
    setTimeout(done, 200); // fallback when animations are disabled
    this.#focusTopmost();
  }

  #focusTopmost() {
    let top = null;
    for (const w of this.windows.values()) {
      if (!w.minimized && (!top || +w.el.style.zIndex > +top.el.style.zIndex)) top = w;
    }
    if (top) this.focus(top.id);
  }
}

export { escapeHtml };
