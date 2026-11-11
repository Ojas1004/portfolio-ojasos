// Halftone wallpaper renderer.
//
// Two kinds of input:
//   palette piece  { meta, data, options }  (e.g. wallpapers/ocean-sunset.js)
//       data.color[row][col] is a palette key, data.level[row][col] a 0-9 level
//   photo          { image: HTMLImageElement, options }
//       the photo is sampled down to a grid of cells (cover-cropped)
//
// Each cell becomes one dot: its colour comes from the cell (saturation pulled
// toward grey by tone.sat) and its size from the colour's luminance (shaped by
// tone.gamma, never below tone.floor), scaled by the cell's level.
//
// The dot field is static, so it is drawn once to an offscreen canvas. Each
// animation frame (fps) just copies it and draws the light layers on top:
// shimmer on bright sea cells, swaying palm silhouettes and flapping birds.
// mountWallpaper() returns { destroy } so backgrounds can be swapped.

const TWO_PI = Math.PI * 2;
const SILHOUETTE = "#12050a";
const DEFAULT_TONE = { gamma: 0.62, floor: 0.03, sat: 0.85 };

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/** Pull a colour toward its own grey by (1 - sat). */
function saturate(rgb, sat) {
  const l = luminance(rgb) * 255;
  return rgb.map((c) => Math.round(l + (c - l) * sat));
}

/** Level 5 is neutral; lower levels shrink dots, higher ones grow them. */
const levelScale = (lvl) => (lvl === 0 ? 0.55 : 0.6 + lvl * 0.08);

const swatch = (rgb, tone) => {
  const shown = saturate(rgb, tone.sat);
  return { fill: `rgb(${shown.join(",")})`, size: tone.floor + (1 - tone.floor) * Math.pow(luminance(rgb), tone.gamma) };
};

/** Build a uniform grid: { cols, rows, cells: [{ key, lvl }], swatches: { key: { fill, size } } }. */
function paletteGrid({ meta, data }) {
  const tone = { ...DEFAULT_TONE, ...(meta.dots?.tone || {}) };
  const swatches = {};
  for (const [key, hex] of Object.entries(meta.palette)) swatches[key] = swatch(hexToRgb(hex), tone);
  const cells = [];
  for (let y = 0; y < meta.rows; y++) {
    const crow = data.color[y] || "";
    const lrow = data.level[y] || "";
    for (let x = 0; x < meta.cols; x++) cells.push({ key: crow[x], lvl: Number(lrow[x] ?? 5) });
  }
  return { cols: meta.cols, rows: meta.rows, cells, swatches, glints: true };
}

function photoGrid(image, cols = 192, rows = 108) {
  const tone = DEFAULT_TONE;
  const c = document.createElement("canvas");
  c.width = cols;
  c.height = rows;
  const g = c.getContext("2d", { willReadFrequently: true });
  // cover-crop the photo into the grid's aspect ratio
  const scale = Math.max(cols / image.naturalWidth, rows / image.naturalHeight);
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  g.imageSmoothingQuality = "high";
  g.drawImage(image, (cols - w) / 2, (rows - h) / 2, w, h);
  const px = g.getImageData(0, 0, cols, rows).data;
  const swatches = {};
  const cells = [];
  for (let i = 0; i < cols * rows; i++) {
    // quantise to 4 bits per channel so dots batch into a few thousand paths
    const rgb = [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]].map((v) => (v & 0xf0) | 0x08);
    const key = rgb.join(",");
    swatches[key] ??= swatch(rgb, tone);
    cells.push({ key, lvl: 5 });
  }
  return { cols, rows, cells, swatches, glints: false };
}

/**
 * Live pieces { meta, palette, create, still } paint a fresh grid of RGB cells
 * every frame (create() returns frame(t) -> Float32Array of cols*rows*3).
 * Each cell is snapped to the nearest palette colour plus a size level, and
 * only the cells that changed since the last frame are redrawn. Cells are
 * whole device pixels, so a dot never spills into its neighbours and a
 * changed cell can simply be cleared and repainted.
 */
function mountLive(canvas, piece) {
  const { meta } = piece;
  const { cols, rows } = meta;
  const fps = meta.fps || 15;
  const tone = { ...DEFAULT_TONE, ...(meta.dots?.tone || {}) };
  const pal = piece.palette.map((c) => c.map((v) => Math.round(Math.min(255, Math.max(0, v)))));
  const palLum = pal.map(luminance);
  const swatches = pal.map((c) => swatch(c, tone));
  const frameAt = piece.create();
  const ctx = canvas.getContext("2d");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const BG = "#0a0306";

  // nearest palette colour, cached on 5 bits per channel
  const cache = new Map();
  const nearest = (r, g, b) => {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let hit = cache.get(key);
    if (hit !== undefined) return hit;
    let bd = Infinity;
    for (let i = 0; i < pal.length; i++) {
      const p = pal[i], d = (p[0] - r) ** 2 * 0.3 + (p[1] - g) ** 2 * 0.59 + (p[2] - b) ** 2 * 0.11;
      if (d < bd) { bd = d; hit = i; }
    }
    cache.set(key, hit);
    return hit;
  };

  const keys = new Int16Array(cols * rows);
  const levels = new Uint8Array(cols * rows);
  let cell = 0, ox = 0, oy = 0, Wd = 0, Hd = 0, raf = 0, last = 0, alive = true;

  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    Wd = Math.round(canvas.clientWidth * dpr);
    Hd = Math.round(canvas.clientHeight * dpr);
    if (!Wd || !Hd) return false;
    canvas.width = Wd;
    canvas.height = Hd;
    cell = Math.ceil(Math.max(Wd / cols, Hd / rows)); // "cover", in whole device pixels
    ox = Math.floor((Wd - cols * cell) / 2);
    oy = Math.floor((Hd - rows * cell) / 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, Wd, Hd);
    keys.fill(-1); // repaint everything on the next frame
    return true;
  }

  function draw(t) {
    const out = frameAt(t);
    const clear = new Path2D();
    const paths = new Map();
    let dirty = false;
    for (let y = 0; y < rows; y++) {
      const y0 = oy + y * cell;
      if (y0 + cell <= 0 || y0 >= Hd) continue;
      for (let x = 0; x < cols; x++) {
        const x0 = ox + x * cell;
        if (x0 + cell <= 0 || x0 >= Wd) continue;
        const i = y * cols + x, k3 = i * 3;
        const r = Math.min(255, Math.max(0, out[k3])) | 0, g = Math.min(255, Math.max(0, out[k3 + 1])) | 0, b = Math.min(255, Math.max(0, out[k3 + 2])) | 0;
        const k = nearest(r, g, b);
        const Y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        const lv = Y > 0.86 ? 7 : Math.min(6, Math.max(3, Math.round(5 + (Y - palLum[k]) * 12)));
        if (keys[i] === k && levels[i] === lv) continue;
        keys[i] = k;
        levels[i] = lv;
        dirty = true;
        clear.rect(x0, y0, cell, cell);
        const rad = (cell / 2) * Math.min(1, swatches[k].size * levelScale(lv));
        let p = paths.get(k);
        if (!p) paths.set(k, (p = new Path2D()));
        p.moveTo(x0 + cell / 2 + rad, y0 + cell / 2);
        p.arc(x0 + cell / 2, y0 + cell / 2, rad, 0, TWO_PI);
      }
    }
    if (!dirty) return;
    ctx.fillStyle = BG;
    ctx.fill(clear);
    for (const [k, p] of paths) {
      ctx.fillStyle = swatches[k].fill;
      ctx.fill(p);
    }
  }

  function loop(now) {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    if (now - last < 1000 / fps) return;
    last = now;
    draw(now / 1000);
  }

  let resizeTimer;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (alive && layout()) draw(reduce ? piece.still ?? 0 : performance.now() / 1000); }, 120);
  };
  window.addEventListener("resize", onResize);

  if (layout()) draw(reduce ? piece.still ?? 0 : performance.now() / 1000);
  if (!reduce) raf = requestAnimationFrame(loop);

  return {
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}

export function mountWallpaper(canvas, piece) {
  if (piece.create) return mountLive(canvas, piece);
  const grid = piece.image ? photoGrid(piece.image) : paletteGrid(piece);
  const options = piece.options || {};
  const fps = piece.meta?.fps || 15;
  const { cols, rows } = grid;
  const ctx = canvas.getContext("2d");
  const still = document.createElement("canvas");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let W = 0, H = 0, dpr = 1, cell = 0, ox = 0, oy = 0;
  let glints = [];
  let palms = [];
  let birds = [];
  let raf = 0;
  let alive = true;

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    if (!W || !H) return false;
    canvas.width = still.width = Math.round(W * dpr);
    canvas.height = still.height = Math.round(H * dpr);
    cell = Math.max(W / cols, H / rows); // "cover": square cells fill the screen
    ox = (W - cols * cell) / 2;
    oy = (H - rows * cell) / 2;
    drawStill();
    placeExtras();
    return true;
  }

  function drawStill() {
    const s = still.getContext("2d");
    s.setTransform(dpr, 0, 0, dpr, 0, 0);
    s.fillStyle = "#0a0306";
    s.fillRect(0, 0, W, H);
    const paths = {}; // batch every dot of one colour into a single path
    glints = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const { key, lvl } = grid.cells[y * cols + x];
        const sw = grid.swatches[key];
        if (!sw) continue;
        const r = (cell / 2) * Math.min(1.08, sw.size * levelScale(lvl));
        const cx = ox + (x + 0.5) * cell;
        const cy = oy + (y + 0.5) * cell;
        if (cx < -cell || cy < -cell || cx > W + cell || cy > H + cell) continue;
        const p = (paths[key] ??= new Path2D());
        p.moveTo(cx + r, cy);
        p.arc(cx, cy, r, 0, TWO_PI);
        // bright sea cells (lower half, level >= 6) get an animated glint
        if (grid.glints && lvl >= 6 && y > rows * 0.42) glints.push({ cx, cy, r, phase: Math.random() * TWO_PI, speed: 1.5 + Math.random() * 2.5 });
      }
    }
    for (const [key, path] of Object.entries(paths)) {
      s.fillStyle = grid.swatches[key].fill;
      s.fill(path);
    }
  }

  function placeExtras() {
    palms = options.palms
      ? [
          { x: W * 0.035, h: H * 0.62, lean: 0.16, size: 1.0, phase: 0 },
          { x: W * 0.115, h: H * 0.44, lean: 0.07, size: 0.78, phase: 1.7 },
          { x: W * 0.965, h: H * 0.56, lean: -0.15, size: 0.92, phase: 3.1 },
        ]
      : [];
    const n = options.birds || 0;
    birds = Array.from({ length: n }, (_, i) => ({
      x: Math.random() * W,
      y: H * (0.2 + Math.random() * 0.24),
      speed: 12 + Math.random() * 16,
      size: 7 + Math.random() * 6,
      phase: Math.random() * TWO_PI,
      flap: 5 + Math.random() * 3,
      drift: (i % 2 ? 1 : -1) * (2 + Math.random() * 3),
    }));
  }

  /* ── overlays ── */
  function drawGlints(t) {
    for (const g of glints) {
      const a = Math.sin(t * g.speed + g.phase);
      if (a < 0.55) continue;
      ctx.globalAlpha = ((a - 0.55) / 0.45) * 0.9;
      ctx.fillStyle = "#fff4b8";
      ctx.beginPath();
      ctx.arc(g.cx, g.cy, g.r * 0.75, 0, TWO_PI);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPalm(p, t) {
    const sway = Math.sin(t * 0.9 + p.phase) * 0.035;
    const baseY = H + 8;
    const topX = p.x + p.h * (p.lean + sway * 0.4);
    const topY = baseY - p.h;
    const midX = p.x + p.h * p.lean * 0.25;
    const midY = baseY - p.h * 0.55;
    const w = 13 * p.size;

    ctx.fillStyle = SILHOUETTE;
    // trunk: a tapered curve
    ctx.beginPath();
    ctx.moveTo(p.x - w, baseY);
    ctx.quadraticCurveTo(midX - w * 0.7, midY, topX - w * 0.35, topY);
    ctx.lineTo(topX + w * 0.35, topY);
    ctx.quadraticCurveTo(midX + w * 0.7, midY, p.x + w, baseY);
    ctx.closePath();
    ctx.fill();
    // trunk rings
    ctx.strokeStyle = "rgba(255,120,40,0.08)";
    ctx.lineWidth = 1;
    for (let k = 0.12; k < 0.95; k += 0.07) {
      const yy = baseY - p.h * k;
      const xx = p.x + (topX - p.x) * k * k;
      ctx.beginPath();
      ctx.moveTo(xx - w * (1 - k * 0.6), yy);
      ctx.lineTo(xx + w * (1 - k * 0.6), yy + 2);
      ctx.stroke();
    }
    // fronds
    const fronds = [-2.75, -2.35, -1.95, -1.25, -0.85, -0.45, -0.1, -3.05];
    for (let i = 0; i < fronds.length; i++) {
      const ang = fronds[i] + sway * (1 + (i % 3) * 0.4) + Math.sin(t * 1.3 + i + p.phase) * 0.025;
      const len = p.h * (0.38 + (i % 3) * 0.06) * p.size;
      const tipX = topX + Math.cos(ang) * len;
      const tipY = topY + Math.sin(ang) * len * 0.55 + len * 0.42; // droop
      const ctlX = topX + Math.cos(ang) * len * 0.55;
      const ctlY = topY + Math.sin(ang) * len * 0.75 - len * 0.05;
      const thick = 9 * p.size;
      ctx.beginPath();
      ctx.moveTo(topX, topY);
      ctx.quadraticCurveTo(ctlX, ctlY - thick, tipX, tipY);
      ctx.quadraticCurveTo(ctlX, ctlY + thick * 0.6, topX, topY + 3);
      ctx.fill();
      // leaflets along the frond
      ctx.strokeStyle = SILHOUETTE;
      ctx.lineWidth = 1.6 * p.size;
      for (let s = 0.2; s < 0.95; s += 0.09) {
        const qx = (1 - s) * (1 - s) * topX + 2 * (1 - s) * s * ctlX + s * s * tipX;
        const qy = (1 - s) * (1 - s) * topY + 2 * (1 - s) * s * ctlY + s * s * tipY;
        const l = thick * 1.9 * (1 - s * 0.6);
        ctx.beginPath();
        ctx.moveTo(qx, qy);
        ctx.lineTo(qx + Math.cos(ang + 1.9) * l * 0.4, qy + l);
        ctx.moveTo(qx, qy);
        ctx.lineTo(qx + Math.cos(ang - 1.9) * l * 0.4, qy + l * 0.8);
        ctx.stroke();
      }
    }
    // coconuts
    ctx.beginPath();
    ctx.arc(topX - 4 * p.size, topY + 6 * p.size, 4.5 * p.size, 0, TWO_PI);
    ctx.arc(topX + 5 * p.size, topY + 7 * p.size, 4.5 * p.size, 0, TWO_PI);
    ctx.fill();
  }

  function drawBirds(t, dt) {
    ctx.strokeStyle = SILHOUETTE;
    ctx.lineCap = "round";
    for (const b of birds) {
      b.x -= b.speed * dt;
      b.y += Math.sin(t * 0.6 + b.phase) * b.drift * dt;
      if (b.x < -20) { b.x = W + 20 + Math.random() * 120; b.y = H * (0.2 + Math.random() * 0.24); }
      const f = Math.sin(t * b.flap + b.phase); // -1..1
      const s = b.size;
      ctx.lineWidth = Math.max(1.2, s * 0.32);
      ctx.beginPath();
      ctx.moveTo(b.x - s, b.y - f * s * 0.6);
      ctx.quadraticCurveTo(b.x - s * 0.45, b.y - s * 0.55 * (0.4 + f * 0.6), b.x, b.y);
      ctx.quadraticCurveTo(b.x + s * 0.45, b.y - s * 0.55 * (0.4 + f * 0.6), b.x + s, b.y - f * s * 0.6);
      ctx.stroke();
    }
  }

  /* ── loop ── */
  let last = 0;
  let prev = performance.now();
  function frame(now) {
    const t = now / 1000;
    const dt = Math.min(0.2, (now - prev) / 1000);
    prev = now;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(still, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawGlints(t);
    for (const p of palms) drawPalm(p, t);
    drawBirds(t, dt);
  }

  function loop(now) {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    if (now - last < 1000 / fps) return;
    last = now;
    frame(now);
  }

  let resizeTimer;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (alive && layout()) frame(performance.now()); }, 120);
  };
  window.addEventListener("resize", onResize);

  if (layout()) frame(performance.now());
  if (!reduce && (grid.glints || options.palms || options.birds)) raf = requestAnimationFrame(loop);

  return {
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}
