// Desktop backgrounds: the default halftone sunset, other built-ins, solid
// colours, or the visitor's own photo (optionally turned into halftone dots).
// The choice is a per-visitor convenience, so it lives in localStorage. A
// visitor's photo never leaves their browser.
import { mountWallpaper } from "./halftone.js";
import { icons } from "./icons.js";
import { escapeHtml } from "./wm.js";
import oceanSunset from "./wallpapers/ocean-sunset.js";

const KEY = "ojasos:background";
const PHOTO_MAX = 1600; // longest side kept for an uploaded photo
export const DEFAULT_BG = { kind: "sunset" };

// Live scenes are loaded only when picked, so the default desktop stays light.
const LIVE = {
  orbit: () => import("./wallpapers/orbit-window-earth.js"),
  redwood: () => import("./wallpapers/redwood-forest-light.js"),
  harbour: () => import("./wallpapers/harbour-neon-skyline.js"),
};

export const BUILT_INS = [
  { id: "sunset", label: "Ocean Sunset", note: "animated halftone · default", value: { kind: "sunset" }, swatch: "linear-gradient(#3a0d06, #ff8a14 45%, #fffd1b 55%, #2a0705 60%, #0a0306)" },
  { id: "orbit", label: "Orbit Window Earth", note: "animated halftone · space station", value: { kind: "live", scene: "orbit" }, swatch: "radial-gradient(circle at 50% 50%, transparent 0 40%, #1c1e24 41% 47%, #4e5361 48%), radial-gradient(ellipse at 80% 135%, #1e5aa8 0 52%, #a8d0ff 54%, #04060c 57%)" },
  { id: "redwood", label: "Redwood Forest Light", note: "animated halftone · misty forest", value: { kind: "live", scene: "redwood" }, swatch: "linear-gradient(90deg, transparent 0 18%, #7a3e32 18% 30%, transparent 30% 64%, #a0603e 64% 78%, transparent 78%), linear-gradient(#e8eed8, #c8d4b0 70%, #6a9a50 78%, #3a5a32)" },
  { id: "harbour", label: "Neon Harbour Ferry", note: "animated halftone · night city", value: { kind: "live", scene: "harbour" }, swatch: "linear-gradient(#1c2060, #5038a0 35%, #d060a8 55%, #ffb09a 66%, #0c0e1e 67% 70%, #d060a8 80%, #2c2e7c)" },
  { id: "hills", label: "Retro Hills", note: "dithered pixel art", value: { kind: "image", src: "/img/wallpaper.png", pixelated: true }, swatch: "center / cover url(/img/wallpaper.png)" },
  { id: "teal", label: "Teal", note: "solid colour", value: { kind: "solid", color: "#1d4a4f" }, swatch: "#1d4a4f" },
  { id: "midnight", label: "Midnight", note: "solid colour", value: { kind: "solid", color: "#141a26" }, swatch: "#141a26" },
  { id: "plum", label: "Plum", note: "solid colour", value: { kind: "solid", color: "#3a2340" }, swatch: "#3a2340" },
  { id: "sand", label: "Sand", note: "solid colour", value: { kind: "solid", color: "#a8916a" }, swatch: "#a8916a" },
];

const idOf = (bg) =>
  bg.kind === "photo" ? "photo" : (BUILT_INS.find((b) => JSON.stringify(b.value) === JSON.stringify(bg)) || BUILT_INS[0]).id;

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

export class Backgrounds {
  constructor(desktop, canvas) {
    this.desktop = desktop;
    this.canvas = canvas;
    this.handle = null;
    this.current = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || DEFAULT_BG; } catch { return DEFAULT_BG; } })();
  }

  get currentId() { return idOf(this.current); }

  /** Human name of the current background, e.g. "Neon Harbour Ferry" (shown by neofetch). */
  get label() {
    if (this.current.kind === "photo") return "My photo";
    return BUILT_INS.find((b) => b.id === this.currentId)?.label || "Ocean Sunset";
  }

  /** Show a background. Returns false if it could not be remembered (storage full). */
  async apply(bg, { save = true } = {}) {
    const token = (this.token = (this.token || 0) + 1);
    // load a live scene before tearing down the current wallpaper (no blank flash)
    let scene = null;
    if (bg.kind === "live") {
      try { scene = (await LIVE[bg.scene]()).default; } catch { scene = null; }
      if (token !== this.token) return true; // a newer choice won the race
      if (!scene) return this.apply(DEFAULT_BG, { save: false });
    }
    this.handle?.destroy();
    this.handle = null;
    this.canvas.hidden = true;
    this.desktop.style.background = "";
    this.desktop.classList.remove("bg-pixelated");

    try {
      if (bg.kind === "sunset") {
        this.canvas.hidden = false;
        this.handle = mountWallpaper(this.canvas, oceanSunset);
      } else if (bg.kind === "live") {
        this.canvas.hidden = false;
        this.handle = mountWallpaper(this.canvas, scene);
      } else if (bg.kind === "image") {
        this.desktop.style.background = `#0a0306 url("${bg.src}") center / cover no-repeat`;
        this.desktop.classList.toggle("bg-pixelated", !!bg.pixelated);
      } else if (bg.kind === "solid") {
        this.desktop.style.background = bg.color;
      } else if (bg.kind === "photo") {
        if (bg.dots) {
          const img = await loadImage(bg.dataUrl);
          this.canvas.hidden = false;
          this.handle = mountWallpaper(this.canvas, { image: img });
        } else {
          this.desktop.style.background = `#0a0306 url("${bg.dataUrl}") center / cover no-repeat`;
        }
      }
    } catch {
      return this.apply(DEFAULT_BG, { save: false }); // broken photo etc.
    }

    this.current = bg;
    let saved = true;
    if (save) {
      try { localStorage.setItem(KEY, JSON.stringify(bg)); } catch { saved = false; }
    }
    document.dispatchEvent(new CustomEvent("ojasos:background"));
    return saved;
  }

  restoreDefault() {
    try { localStorage.removeItem(KEY); } catch { /* storage blocked */ }
    return this.apply(DEFAULT_BG, { save: false });
  }

  /** Read a File, shrink it, and return a JPEG data URL. */
  static async photoFromFile(file) {
    if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const scale = Math.min(1, PHOTO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.85); // re-encoding also drops EXIF/GPS data
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** The "Display Properties" window. */
export function createDisplayApp(backgrounds) {
  return {
    title: "Display Properties",
    icon: icons.display,
    width: 430,
    height: 560,
    mount(body, { wm, win }) {
      body.innerHTML = `
        <div class="fill display-props">
          <div class="monitor" aria-hidden="true"><div class="monitor-screen"></div><div class="monitor-stand"></div></div>
          <fieldset class="groupbox">
            <legend>Background</legend>
            <ul class="bg-list" role="listbox" aria-label="Desktop backgrounds"></ul>
            <div class="bg-upload">
              <button type="button" class="btn" data-act="browse">Browse...</button>
              <input type="file" accept="image/*" hidden>
              <label><input type="checkbox" class="bg-dots" checked> show my photo as halftone dots</label>
            </div>
            <p class="bg-msg" role="status">Your photo stays in this browser. It is never uploaded.</p>
          </fieldset>
          <div class="dialog-buttons">
            <button type="button" class="btn" data-act="default">Restore default</button>
            <button type="button" class="btn primary" data-act="ok">OK</button>
          </div>
        </div>`;
      const list = body.querySelector(".bg-list");
      const screen = body.querySelector(".monitor-screen");
      const fileInput = body.querySelector('input[type="file"]');
      const dots = body.querySelector(".bg-dots");
      const msg = body.querySelector(".bg-msg");

      const entries = () => {
        const out = BUILT_INS.map((b) => ({ ...b }));
        const cur = backgrounds.current;
        if (cur.kind === "photo") out.push({ id: "photo", label: "My photo", note: cur.dots ? "halftone dots" : "photo", value: cur, swatch: `center / cover url("${cur.dataUrl}")` });
        return out;
      };

      const render = () => {
        const selected = backgrounds.currentId;
        list.innerHTML = entries().map((e) => `
          <li role="option" tabindex="0" data-id="${e.id}" aria-selected="${e.id === selected}">
            <span class="bg-swatch" style="background:${escapeHtml(e.swatch)}"></span>
            <span>${escapeHtml(e.label)}<small>${escapeHtml(e.note)}</small></span>
          </li>`).join("");
        const sel = entries().find((e) => e.id === selected);
        screen.style.background = sel?.swatch || "#000";
        if (backgrounds.current.kind === "photo") dots.checked = !!backgrounds.current.dots;
      };

      const choose = (id) => {
        const entry = entries().find((e) => e.id === id);
        if (entry) backgrounds.apply(entry.value);
      };
      list.addEventListener("click", (e) => { const li = e.target.closest("li"); if (li) choose(li.dataset.id); });
      list.addEventListener("keydown", (e) => {
        const li = e.target.closest("li");
        if (!li) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(li.dataset.id); }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          (e.key === "ArrowDown" ? li.nextElementSibling : li.previousElementSibling)?.focus();
        }
      });

      body.addEventListener("click", async (e) => {
        const act = e.target.closest("[data-act]")?.dataset.act;
        if (act === "browse") fileInput.click();
        else if (act === "default") { await backgrounds.restoreDefault(); msg.textContent = "Back to the default Ocean Sunset."; }
        else if (act === "ok") wm.close(win.id);
      });

      fileInput.addEventListener("change", async () => {
        const file = fileInput.files?.[0];
        fileInput.value = "";
        if (!file) return;
        msg.textContent = "Loading photo...";
        try {
          const dataUrl = await Backgrounds.photoFromFile(file);
          const saved = await backgrounds.apply({ kind: "photo", dataUrl, dots: dots.checked });
          msg.textContent = saved
            ? "Done. Your photo stays in this browser. It is never uploaded."
            : "Applied, but the photo is too large to remember after a reload.";
        } catch (err) {
          msg.textContent = err?.message || "Could not read that image.";
        }
      });

      dots.addEventListener("change", () => {
        const cur = backgrounds.current;
        if (cur.kind === "photo") backgrounds.apply({ ...cur, dots: dots.checked });
      });

      const onChange = () => render();
      document.addEventListener("ojasos:background", onChange);
      win.cleanup = () => document.removeEventListener("ojasos:background", onChange);
      render();
    },
    unmount(win) { win.cleanup?.(); },
  };
}
