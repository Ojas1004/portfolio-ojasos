// Shared pieces for the mini-games: best scores, LCD digits, canvas sizing
// and pixel-art Snowy sprites. (Kept apart from games.js so the game modules
// can import it without a circular dependency.)

/* ───────── best scores ───────── */
const KEY = "ojasos:games";
const readAll = () => {
  try { const v = JSON.parse(localStorage.getItem(KEY)); return v && typeof v === "object" ? v : {}; } catch { return {}; }
};
export const scores = {
  get: (k) => readAll()[k] ?? null,
  /** Save `v` if it beats the stored value. Returns true for a new record. */
  submit(k, v, lowerIsBetter = false) {
    const all = readAll();
    const old = all[k];
    const better = typeof old !== "number" || (lowerIsBetter ? v < old : v > old);
    if (better) {
      all[k] = v;
      try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage blocked */ }
      document.dispatchEvent(new CustomEvent("ojasos:scores"));
    }
    return better;
  },
};

/* ───────── shared helpers ───────── */
/** Zero-padded LCD digits, e.g. pad(7) -> "007", pad(-2) -> "-02". */
export const pad = (n, d = 3) => {
  const v = Math.trunc(n);
  return v < 0 ? "-" + String(Math.min(-v, 10 ** (d - 1) - 1)).padStart(d - 1, "0") : String(Math.min(v, 10 ** d - 1)).padStart(d, "0");
};
export const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Call `cb(width, height)` whenever `el` changes size. Returns a disconnect function. */
export function observeSize(el, cb) {
  const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); if (r.width && r.height) cb(r.width, r.height); });
  ro.observe(el);
  return () => ro.disconnect();
}

/** Size a canvas's backing store for crisp drawing; returns the 2D context scaled to CSS pixels. */
export function sizeCanvas(canvas, w, h) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

/** True while a game window should be running (visible, focused, tab in front). */
export const windowActive = (win) =>
  win.el.isConnected && win.el.classList.contains("is-focused") && !win.el.classList.contains("is-minimized") && !document.hidden;

/* Pixel-art Snowy, drawn from rows of palette letters. */
const PAL = { k: "#1c2626", w: "#ffffff", s: "#e6e1d4", o: "#f06a2c", p: "#f27b93", r: "#e2372d", y: "#f8c630" };
export const SPRITES = {
  face: [
    "k........k",
    "kk......kk",
    "kokkkkkkok",
    "kwwwwwwwwk",
    "kwkwwwwkwk",
    "kwwwppwwwk",
    "kwwwwwwwwk",
    "krrrryrrrk",
    ".kkkkkkkk.",
  ],
  sit: [
    ".k........k...",
    ".kk......kk...",
    ".kokkkkkkok...",
    ".kwwwwwwwwk...",
    ".kwkwwwwkwk...",
    ".kwwwppwwwk...",
    ".kwwwwwwwwk...",
    ".krrrryrrrk...",
    "kwwwwwwwwwwk..",
    "kwwwsswwwwwk.k",
    "kwwwsswwwwwkkk",
    "kwwkwwwwkwwkk.",
    "kkkkkkkkkkkk..",
  ],
};

export function drawSprite(ctx, rows, x, y, px) {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = PAL[row[i]];
      if (!c) continue;
      ctx.fillStyle = c;
      const x0 = Math.round(x + i * px), y0 = Math.round(y + j * px);
      ctx.fillRect(x0, y0, Math.round(x + (i + 1) * px) - x0, Math.round(y + (j + 1) * px) - y0);
    }
  });
}

/** The same sprites as inline SVG (for buttons). */
export function spriteSVG(rows, cls = "") {
  const w = Math.max(...rows.map((r) => r.length));
  let rects = "";
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) if (PAL[row[i]]) rects += `<rect x="${i}" y="${j}" width="1" height="1" fill="${PAL[row[i]]}"/>`;
  });
  return `<svg class="${cls}" viewBox="0 0 ${w} ${rows.length}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}
