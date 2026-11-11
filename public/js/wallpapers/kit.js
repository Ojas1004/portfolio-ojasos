// Shared helpers for the live (procedural) halftone wallpapers.
// A scene paints RGB values into a 192×108 grid of cells; halftone.js turns
// each cell into one dot, using the scene's palette.

export const W = 192;
export const H = 108;

export const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Seeded random numbers in [0, 1) (mulberry32). */
export function rng(seed = 1) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── value noise ── */
const lattice = (ix, iy, seed) => {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const fade = (t) => t * t * (3 - 2 * t);

/** Smooth 2D noise in [0, 1]. */
export function noise2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = fade(x - ix), fy = fade(y - iy);
  const a = lattice(ix, iy, seed), b = lattice(ix + 1, iy, seed);
  const c = lattice(ix, iy + 1, seed), d = lattice(ix + 1, iy + 1, seed);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
}

/** Fractal noise: `octaves` layers of noise2, normalised back to [0, 1]. */
export function fbm(x, y, octaves = 4, seed = 0) {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(x * freq, y * freq, seed + i * 17) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/* ── colour ── */
export const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgbOf = (c) => (typeof c === "string" ? hex(c) : c);
export const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

/** Colour stops [[t, "#hex"], ...] sampled at t. */
export function ramp(stops, t) {
  t = clamp(t);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) return mix(hex(stops[i - 1][1]), hex(stops[i][1]), (t - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0] || 1));
  }
  return hex(stops[stops.length - 1][1]);
}

/** Palette from anchor runs: [["#a", "#b", ..., count], ...] -> [[r,g,b], ...]. */
export function buildPal(anchors) {
  const P = [];
  for (const a of anchors) {
    const n = a[a.length - 1], cs = a.slice(0, -1).map(hex);
    for (let i = 0; i < n; i++) {
      const t = (i / Math.max(1, n - 1)) * (cs.length - 1), k = Math.min(cs.length - 2, Math.floor(t));
      P.push(cs.length === 1 ? cs[0] : mix(cs[k], cs[k + 1], t - k));
    }
  }
  return P;
}

/* ── the cell canvas ── */
export class Canvas {
  constructor() {
    this.rgb = new Float32Array(W * H * 3);
    this.mask = new Uint8Array(W * H);
  }
  put(x, y, c, m) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x, k = i * 3, v = rgbOf(c);
    this.rgb[k] = v[0]; this.rgb[k + 1] = v[1]; this.rgb[k + 2] = v[2];
    if (m !== undefined) this.mask[i] = m;
  }
  /** Blend colour c over the cell with opacity a. */
  add(x, y, c, a) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= W || y >= H || !(a > 0)) return;
    const k = (y * W + x) * 3, v = rgbOf(c);
    a = Math.min(1, a);
    this.rgb[k] += (v[0] - this.rgb[k]) * a;
    this.rgb[k + 1] += (v[1] - this.rgb[k + 1]) * a;
    this.rgb[k + 2] += (v[2] - this.rgb[k + 2]) * a;
  }
  get(x, y) {
    const k = (clamp(Math.floor(y), 0, H - 1) * W + clamp(Math.floor(x), 0, W - 1)) * 3;
    return [this.rgb[k], this.rgb[k + 1], this.rgb[k + 2]];
  }
  maskAt(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    return x < 0 || y < 0 || x >= W || y >= H ? 0 : this.mask[y * W + x];
  }
  /** Fill cells x0 <= x < x1, y0 <= y < y1. */
  rect(x0, y0, x1, y1, c, m) {
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) this.put(x, y, c, m);
  }
  /** Vertical gradient across rows y0..y1. */
  sky(stops, m, y0 = 0, y1 = H) {
    for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
      const c = ramp(stops, (y - y0) / Math.max(1, y1 - y0 - 1));
      for (let x = 0; x < W; x++) this.put(x, y, c, m);
    }
  }
  copy(other) { this.rgb.set(other.rgb); this.mask.set(other.mask); }
}

/** Drifting mist in a horizontal band, thickest in the middle of the band. */
export function mist(f, t, { y0, y1, c = "#ffffff", a = 0.4, speed = 0.05, scale = 20, cut = 0.45 }) {
  const col = rgbOf(c);
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
    const edge = Math.sin(((y - y0) / Math.max(1, y1 - y0)) * Math.PI);
    for (let x = 0; x < W; x++) {
      const n = fbm(x / scale - t * speed, y / (scale * 0.45), 3, 91);
      const v = clamp((n - cut) * 3.2) * edge * a;
      if (v > 0.01) f.add(x, y, col, v);
    }
  }
}

/** A tiny walking figure standing at (x, y): head, body and striding legs. */
export function person(f, x, y, { body = "#e86a4a", head = "#e8c8a0", legs = "#2a2420", step = 0 } = {}) {
  x = Math.round(x); y = Math.round(y);
  if (step % 2) { f.put(x - 1, y, legs); f.put(x + 1, y, legs); } else f.put(x, y, legs);
  f.put(x, y - 1, legs);
  f.put(x, y - 2, body);
  f.put(x, y - 3, body);
  f.put(x, y - 4, head);
}

/** Even out a scene's brightness so halftone dots keep their texture. */
export function balance(f, target = 0.45) {
  let total = 0;
  const n = W * H;
  for (let i = 0; i < n; i++) total += lum([f.rgb[i * 3], f.rgb[i * 3 + 1], f.rgb[i * 3 + 2]]);
  const mean = total / n;
  if (mean <= 0.01 || mean >= 0.99) return;
  const g = clamp(Math.log(target) / Math.log(mean), 0.75, 1.35);
  for (let k = 0; k < f.rgb.length; k++) f.rgb[k] = 255 * Math.pow(clamp(f.rgb[k] / 255), g);
}

/** A palette of n colours that fits the scene (k-means), plus fixed extras. */
export function fitPalette(f, { n = 48, extras = [], iterations = 8 } = {}) {
  const px = [];
  for (let i = 0; i < W * H; i++) px.push([f.rgb[i * 3], f.rgb[i * 3 + 1], f.rgb[i * 3 + 2]]);
  const R = rng(5);
  let centres = Array.from({ length: n }, () => px[Math.floor(R() * px.length)].slice());
  const assign = new Int32Array(px.length);
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < px.length; i++) {
      let best = 0, bd = Infinity;
      for (let j = 0; j < n; j++) {
        const c = centres[j], d = (c[0] - px[i][0]) ** 2 + (c[1] - px[i][1]) ** 2 + (c[2] - px[i][2]) ** 2;
        if (d < bd) { bd = d; best = j; }
      }
      assign[i] = best;
    }
    const sums = centres.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < px.length; i++) { const s = sums[assign[i]]; s[0] += px[i][0]; s[1] += px[i][1]; s[2] += px[i][2]; s[3]++; }
    centres = sums.map((s, j) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : centres[j]));
  }
  return [...centres, ...extras.map(hex)];
}

/** Halftone settings shared by the scenes. */
export const DOTS = { tone: { gamma: 0.62, floor: 0.03, sat: 0.82 } };
