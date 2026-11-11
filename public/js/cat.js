// Snowy Singh: a little white cat who wanders along the taskbar.
//   CatState     - needs (fullness / happiness / energy), actions, hidden fish
//   catSVG       - draws Snowy in each pose (vector art, animated with CSS)
//   Walker       - Snowy walking on top of the taskbar
//   createCatApp - Snowy's window with meters and buttons
// State is a per-visitor convenience, so it lives in localStorage.
import { icons } from "./icons.js";
import { isMobile } from "./wm.js";

export const CAT_NAME = "Snowy Singh";
const SHORT = "Snowy";
const KEY = "ojasos:cat";
const TICK_MS = 4000;

// per-minute rates while the page is open
const RATES = {
  awake: { fullness: -1.6, happiness: -1.1, energy: -0.9 },
  asleep: { fullness: -0.5, happiness: 0, energy: 6 },
};

// Hidden fish: found by exploring OjasOS. `match` gets an "ojasos:event" name.
const FISH = [
  { id: "project", hint: "open one of the project files", match: (e) => e.startsWith("open:project:") },
  { id: "ask", hint: "ask Ojas a question", match: (e) => e === "ask" },
  { id: "resume", hint: "take a look at the resume", match: (e) => e === "open:resume" },
  { id: "sudo", hint: "try to become root in the terminal", match: (e) => e === "cmd:sudo" },
  { id: "snowy", hint: `say hi to ${SHORT} from the terminal (type: snowy)`, match: (e) => e === "cmd:snowy" },
  { id: "games", hint: "win a game in the Games folder", match: (e) => e === "game:win" },
];

/* ───────── artwork ───────── */
// Flat cartoon style: thick ink outlines, white fur, cream belly, orange
// ear insides + forehead stripes, pink nose, red collar with a gold bell.
const INK = "#1d1d1f";
const FUR = "#ffffff";
const CREAM = "#f4eee2";
const SHADE = "#ebe5d8";
const ORANGE = "#f06a2c";
const PINK = "#f27b93";
const COLLAR = "#e2372d";
const BELL = "#f8c630";
const LW = 3; // outline width (viewBox units)
const S = `stroke="${INK}" stroke-width="${LW}" stroke-linejoin="round" stroke-linecap="round"`;
const S2 = `stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"`;

/** A thick outlined stroke (tail, raised arm): ink underneath, fur on top. */
const limb = (d, w = 6) =>
  `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w + LW * 2}" stroke-linecap="round"/>` +
  `<path d="${d}" fill="none" stroke="${FUR}" stroke-width="${w}" stroke-linecap="round"/>`;
const tail = (d, origin, cls = "") => `<g class="tail ${cls}" style="transform-origin:${origin}">${limb(d)}</g>`;
const dotEye = (cx, cy) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="2.7" ry="3.3" fill="${INK}"/><circle cx="${cx + 0.9}" cy="${cy - 1.2}" r="1" fill="#fff"/>`;
const arcEye = (cx, cy, up) =>
  `<path d="M${cx - 2.8} ${cy} q2.8 ${up ? -3.2 : 2.6} 5.6 0" fill="none" stroke="${INK}" stroke-width="1.9" stroke-linecap="round"/>`;
const nose = (x, y) => `<path d="M${x - 2.3} ${y} h4.6 l-2.3 2.5 z" fill="${PINK}" stroke="${PINK}" stroke-width="1.2" stroke-linejoin="round"/>`;
const smile = (x, y) =>
  `<path d="M${x} ${y} q-1.4 2.2 -3.3 1 M${x} ${y} q1.4 2.2 3.3 1" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/>`;
const openMouth = (x, y) => `<path d="M${x - 3} ${y} q3 4.6 6 0 z" fill="${PINK}" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>`;
const stripes = (x, y) =>
  `<path d="M${x} ${y} v5.5 M${x - 6} ${y + 1.6} l1.1 4.6 M${x + 6} ${y + 1.6} l-1.1 4.6" stroke="${ORANGE}" stroke-width="2.6" stroke-linecap="round"/>`;
const collar = (d) =>
  `<path d="${d}" fill="none" stroke="${INK}" stroke-width="7.5" stroke-linecap="round"/>` +
  `<path d="${d}" fill="none" stroke="${COLLAR}" stroke-width="4.2" stroke-linecap="round"/>`;
const bell = (x, y) =>
  `<circle cx="${x}" cy="${y}" r="3.6" fill="${BELL}" stroke="${INK}" stroke-width="1.6"/>` +
  `<path d="M${x} ${y + 0.6} v2.4" stroke="${INK}" stroke-width="1.2" stroke-linecap="round"/>`;
const ear = (outer, inner) => `<path d="${outer}" fill="${FUR}" ${S}/><path d="${inner}" fill="${ORANGE}"/>`;
const whiskers = (d) => `<path d="${d}" stroke="${INK}" stroke-width="1.2" stroke-linecap="round"/>`;

const svg = (vb, body, scale, cls = "") => {
  const [, , w, h] = vb.split(" ").map(Number);
  return `<svg class="cat-svg ${cls}" viewBox="${vb}" width="${Math.round(w * scale)}" height="${Math.round(h * scale)}" aria-hidden="true">${body}</svg>`;
};

/** Sitting, facing the viewer. eyes: open | happy | closed, mouth: smile | open, prop: fish | yarn, wave: raised paw */
function front({ eyes = "open", mouth = "smile", prop = "", wave = false }, scale) {
  const eyesSvg = eyes === "open"
    ? `<g class="eyes-open">${dotEye(37, 35)}${dotEye(53, 35)}</g>`
    : arcEye(37, 35.5, eyes === "happy") + arcEye(53, 35.5, eyes === "happy");
  const props = {
    fish: `<g class="prop-fish"><path d="M88 82 q9 -8 18 0 q-9 8 -18 0 z" fill="#7fc0ea" ${S2}/>` +
      `<path d="M105 82 l7 -5 v10 z" fill="#7fc0ea" ${S2}/><circle cx="92.5" cy="81" r="1.3" fill="${INK}"/></g>`,
    yarn: `<path d="M58 84 q18 6 36 -2" fill="none" stroke="#d8668f" stroke-width="1.6"/>` +
      `<g class="prop-yarn"><circle cx="100" cy="78" r="9.5" fill="#f491b5" ${S2}/>` +
      `<path d="M92.5 74 q7.5 4.5 15 0 M91.5 79.5 q8.5 4.5 17 0 M95 85.5 q4.5 -9 10.5 -15" fill="none" stroke="${INK}" stroke-width="1.3" opacity=".55"/></g>`,
  };
  const arm = wave
    ? `<g class="wave" style="transform-origin:31px 63px">${limb("M31 63 C 23 61, 19 54, 19.5 47", 6.5)}<circle cx="19.5" cy="45.5" r="4.8" fill="${FUR}" ${S}/></g>`
    : "";
  const body = `
    ${tail("M29 82 C 12 84, 7 68, 15 61", "29px 82px")}
    <ellipse cx="45" cy="67" rx="20" ry="19" fill="${FUR}" ${S}/>
    <ellipse cx="45" cy="71" rx="11.5" ry="12.5" fill="${CREAM}"/>
    <ellipse cx="36.5" cy="86" rx="7.5" ry="4.6" fill="${FUR}" ${S}/>
    <ellipse cx="53.5" cy="86" rx="7.5" ry="4.6" fill="${FUR}" ${S}/>
    ${ear("M24 26 L26.5 3 L41 16 Z", "M28 20.5 L29.3 9.5 L36.5 16 Z")}
    ${ear("M66 26 L63.5 3 L49 16 Z", "M62 20.5 L60.7 9.5 L53.5 16 Z")}
    <ellipse cx="45" cy="34" rx="24" ry="20" fill="${FUR}" ${S}/>
    ${stripes(45, 15.5)}
    ${eyesSvg}
    ${nose(45, 40.2)}
    ${mouth === "open" ? openMouth(45, 43) : smile(45, 42.7)}
    ${whiskers("M29 39.5 L16.5 38 M29 42.5 L16.5 44 M61 39.5 L73.5 38 M61 42.5 L73.5 44")}
    ${collar("M29 50 Q45 59 61 50")}
    ${bell(45, 57.5)}
    ${arm}
    ${props[prop] || ""}`;
  const cls = prop === "yarn" ? "playing" : prop === "fish" ? "eating" : "";
  return svg(prop ? "0 0 116 93" : "0 0 90 93", body, scale, cls);
}

/** Walking, side view facing right (flipped with CSS for left). */
function side(scale) {
  const leg = (cls, x, w, fill) =>
    `<rect class="leg ${cls}" x="${x}" y="44" width="${w}" height="19" rx="${w / 2}" fill="${fill}" ${S} style="transform-origin:${x + w / 2}px 46px"/>`;
  const body = `
    ${tail("M25 38 C 12 34, 8 20, 16 9", "25px 38px")}
    <g class="bob">
      ${leg("leg-a", 33, 8.5, SHADE)}${leg("leg-b", 63, 8.5, SHADE)}
      ${leg("leg-b", 25, 9.5, FUR)}${leg("leg-a", 70, 9.5, FUR)}
      <ellipse cx="50" cy="42" rx="28.5" ry="15.5" fill="${FUR}" ${S}/>
      <ellipse cx="52" cy="48.5" rx="15" ry="5.5" fill="${CREAM}"/>
      ${ear("M67.5 23 L67 2.5 L80 13.5 Z", "M70 18.5 L69.8 8.5 L76.5 14 Z")}
      ${ear("M85 12.5 L96.5 2 L98.5 21 Z", "M87.8 12.6 L94.6 6.8 L95.8 16.8 Z")}
      <ellipse cx="82" cy="28" rx="18" ry="16" fill="${FUR}" ${S}/>
      ${stripes(83, 13.5)}
      <g class="eyes-open">${dotEye(78.5, 27.5)}${dotEye(90, 27.5)}</g>
      ${nose(96.5, 32)}
      ${smile(96.5, 34.5)}
      ${whiskers("M99 32 L108.5 30 M99 35 L108.5 36.5")}
      ${collar("M67 35 Q71 45 81 44")}
      ${bell(76, 46.5)}
    </g>`;
  return svg("0 0 110 66", body, scale, "walking");
}

/** Curled up asleep. */
function loaf(scale) {
  const body = `
    <g class="breathe">
      <ellipse cx="46" cy="44" rx="33" ry="17" fill="${FUR}" ${S}/>
      ${tail("M14 48 C 20 62, 54 64, 64 56", "14px 48px", "slow")}
      ${ear("M61 34 L60 13 L73 24 Z", "M63.5 29 L63 18 L69.5 24 Z")}
      ${ear("M91 34 L93 13 L79 24 Z", "M88.6 29 L89.4 18 L82.6 24 Z")}
      <ellipse cx="76" cy="40" rx="19" ry="15.5" fill="${FUR}" ${S}/>
      ${stripes(76, 26)}
      ${arcEye(69.5, 41, false)}${arcEye(82.5, 41, false)}
      ${nose(76, 45.5)}
      ${smile(76, 48)}
      ${whiskers("M58.5 45 L48 44 M93.5 45 L104 44")}
      ${collar("M62 51 Q76 60 90 51")}
      ${bell(76, 57.5)}
    </g>`;
  return svg("0 0 110 64", body, scale, "sleeping");
}

/** SVG markup for a pose at a given scale. */
export function catSVG(pose, scale = 1) {
  switch (pose) {
    case "walk": return side(scale);
    case "sleep": return loaf(scale);
    case "happy": return front({ eyes: "happy", wave: true }, scale);
    case "eat": return front({ eyes: "happy", mouth: "open", prop: "fish" }, scale);
    case "play": return front({ eyes: "open", mouth: "open", prop: "yarn", wave: true }, scale);
    default: return front({}, scale);
  }
}

const clamp = (v) => Math.max(0, Math.min(100, v));
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ───────── state ───────── */
export class CatState {
  constructor() {
    const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } })();
    this.s = {
      fullness: 80, happiness: 75, energy: 70, asleep: false, wander: true, found: [],
      ...(saved && typeof saved === "object" ? saved : {}),
    };
    this.s.found = (Array.isArray(this.s.found) ? this.s.found : []).filter((id) => FISH.some((f) => f.id === id));
    this.message = "";
    this.anim = null; // { type: "eat" | "play", until: ms }
    this.bubble = null; // { text } shown above the walking cat
    this.listeners = new Set();
    setInterval(() => this.#tick(), TICK_MS);
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  #changed() {
    try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch { /* storage blocked */ }
    for (const fn of this.listeners) fn(this);
  }

  #say(msg, bubble) {
    this.message = msg;
    if (bubble) this.bubble = { text: bubble };
  }

  #tick() {
    const rates = this.s.asleep ? RATES.asleep : RATES.awake;
    const minutes = TICK_MS / 60000;
    for (const k of ["fullness", "happiness", "energy"]) this.s[k] = clamp(this.s[k] + rates[k] * minutes);
    if (!this.s.asleep && this.s.energy <= 8) {
      this.s.asleep = true;
      this.#say(`${SHORT} got sleepy and curled up for a nap.`, "zzz...");
    } else if (this.s.asleep && this.s.energy >= 100) {
      this.s.asleep = false;
      this.#say(`${SHORT} woke up fully rested.`, "*stretch*");
    }
    this.#changed();
  }

  get asleep() { return this.s.asleep; }
  get busy() { return this.anim && performance.now() < this.anim.until ? this.anim.type : null; }

  get mood() {
    const { fullness, happiness, energy, asleep } = this.s;
    if (asleep) return { label: "Napping", lines: ["Dreaming of tuna.", "Chasing butterflies in a dream.", "Purring softly in his sleep."] };
    if (fullness < 25) return { label: "Hungry", lines: ["Staring at the food bowl.", "Meowing at the fridge."] };
    if (energy < 25) return { label: "Sleepy", lines: ["Yawning a lot.", "Eyes getting heavy."] };
    if (happiness < 25) return { label: "Bored", lines: ["Batting at your cursor.", "Knocking icons off the desk."] };
    if (fullness > 70 && happiness > 70 && energy > 50) return { label: "Happy", lines: ["Purring loudly.", "Guarding the taskbar.", "Feeling very fluffy today."] };
    return { label: "Content", lines: ["Watching the windows move.", "Thinking about keyboards.", "Sitting on the warm taskbar."] };
  }

  /** What Snowy is doing right now, for the views. */
  get pose() {
    if (this.s.asleep) return "sleep";
    return this.busy || (this.s.happiness > 80 ? "happy" : "sit");
  }

  feed() {
    if (this.s.asleep) this.#say(`${SHORT} is asleep. Wake him up first.`);
    else if (this.s.fullness >= 95) this.#say(`${SHORT} sniffs the fish and walks away. Not hungry.`, "...");
    else {
      this.s.fullness = clamp(this.s.fullness + 30);
      this.s.happiness = clamp(this.s.happiness + 5);
      this.anim = { type: "eat", until: performance.now() + 2600 };
      this.#say(`You give ${SHORT} a fish. Nom nom.`, "nom nom");
    }
    this.#changed();
    return this.message;
  }

  play() {
    if (this.s.asleep) this.#say(`${SHORT} is asleep. Wake him up first.`);
    else if (this.s.energy < 15) this.#say(`${SHORT} is too tired to play. Maybe a nap?`, "*yawn*");
    else {
      this.s.happiness = clamp(this.s.happiness + 22);
      this.s.energy = clamp(this.s.energy - 12);
      this.s.fullness = clamp(this.s.fullness - 6);
      this.anim = { type: "play", until: performance.now() + 2600 };
      this.#say(`${SHORT} pounces on the yarn ball!`, "!!");
    }
    this.#changed();
    return this.message;
  }

  pet() {
    if (this.s.asleep) this.#say(`${SHORT} purrs without waking up.`, "prrr...");
    else {
      this.s.happiness = clamp(this.s.happiness + 4);
      this.#say(`${SHORT} leans into your hand. Prrrrr.`, "prrrr");
    }
    this.#changed();
    return this.message;
  }

  toggleSleep(force) {
    const sleep = force ?? !this.s.asleep;
    if (sleep === this.s.asleep) this.#say(sleep ? `${SHORT} is already asleep.` : `${SHORT} is already awake.`);
    else if (sleep) { this.s.asleep = true; this.#say(`${SHORT} curls up for a catnap.`, "zzz..."); }
    else { this.s.asleep = false; this.#say(`${SHORT} wakes up and stretches.`, "*stretch*"); }
    this.#changed();
    return this.message;
  }

  setWander(on) { this.s.wander = !!on; this.#changed(); }

  /** A game went well: Snowy cheers from the taskbar. */
  cheer(msg, bubble = "!!") {
    this.s.happiness = clamp(this.s.happiness + 8);
    this.#say(msg, this.s.asleep ? null : bubble);
    this.#changed();
  }

  /** React to an "ojasos:event": finding a fish for the first time. */
  discover(eventName) {
    const fish = FISH.find((f) => f.match(eventName) && !this.s.found.includes(f.id));
    if (!fish) return;
    this.s.found = [...this.s.found, fish.id];
    this.s.happiness = clamp(this.s.happiness + 10);
    const n = this.s.found.length;
    this.#say(n === FISH.length ? `${SHORT} found every hidden fish! You know OjasOS inside out.` : `${SHORT} found a hidden fish! (${n}/${FISH.length})`, "a fish!");
    this.#changed();
  }

  /** Handler for the terminal `snowy <op>` command. Returns text to print. */
  command(op) {
    if (op === "feed") return this.feed();
    if (op === "play") return this.play();
    if (op === "pet") return this.pet();
    if (op === "sleep") return this.toggleSleep(true);
    if (op === "wake") return this.toggleSleep(false);
    const { fullness, happiness, energy } = this.s;
    return `${CAT_NAME}  =^.^=\n` +
      `mood       ${this.mood.label.toLowerCase()}\n` +
      `fullness   ${Math.round(fullness)}%\nhappiness  ${Math.round(happiness)}%\nenergy     ${Math.round(energy)}%\n` +
      `fish found ${this.s.found.length}/${FISH.length}\n\n` +
      `Try: snowy feed · snowy play · snowy pet · snowy sleep · snowy wake`;
  }
}

/* ───────── Snowy walking on the taskbar ───────── */
const VISIT_DELAY = 3000; // ms after a folder opens before Snowy heads over
const WALK_SPEED = 36; // px/s while wandering
const TROT_SPEED = 170; // px/s on the way to a folder
const JUMP_MS = 700;
const FALL_MS = 420;
const easeIn = (p) => p * p;

/**
 * Modes:
 *   idle / walk  - wandering along the taskbar
 *   trot         - heading to a folder window that was just opened
 *   jump         - leaping in an arc from the taskbar into that window
 *   inside       - sitting on the folder's status bar (moves with the window)
 *   fall         - dropping back down when the folder closes or minimizes
 */
export class Walker {
  constructor(cat, { wm, onOpen }) {
    this.cat = cat;
    this.wm = wm;
    this.el = document.createElement("div");
    this.el.className = "cat-walker";
    this.el.tabIndex = 0;
    this.el.setAttribute("role", "button");
    this.el.setAttribute("aria-label", `${CAT_NAME} the cat. Open ${SHORT}'s window`);
    this.el.title = `${CAT_NAME} (click me)`;
    this.el.innerHTML = `<div class="cat-bubble" hidden></div><div class="cat-sprite"></div>`;
    this.sprite = this.el.querySelector(".cat-sprite");
    this.bubbleEl = this.el.querySelector(".cat-bubble");
    document.body.append(this.el);

    this.x = 160 + Math.random() * Math.max(0, window.innerWidth - 420); // centre x on the taskbar
    this.y = 0; // vertical offset above the taskbar (negative = higher)
    this.dir = 1;
    this.mode = "idle";
    this.until = performance.now() + 2000;
    this.target = this.x;
    this.visit = null; // { id } of the folder being visited
    this.forced = null; // { pose, until } e.g. a wave on landing
    this.lastBubble = null;
    this.last = performance.now();
    this.shown = "";

    const open = (e) => {
      e?.stopPropagation();
      this.say(cat.asleep ? "zzz..." : pick(["mrrp?", "meow!", "prrr...", "hi!"]));
      onOpen();
    };
    this.el.addEventListener("click", open);
    this.el.addEventListener("pointerdown", (e) => e.stopPropagation()); // don't start a window drag
    this.el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    document.addEventListener("ojasos:event", (e) => this.#onEvent(e.detail));

    cat.on(() => this.#sync());
    this.#sync();
    requestAnimationFrame((t) => this.#loop(t));
  }

  say(text) {
    this.bubbleEl.textContent = text;
    this.bubbleEl.hidden = false;
    clearTimeout(this.bubbleTimer);
    this.bubbleTimer = setTimeout(() => { this.bubbleEl.hidden = true; }, 2200);
  }

  #sync() {
    this.el.hidden = !this.cat.s.wander;
    const b = this.cat.bubble;
    if (b && b !== this.lastBubble) { this.lastBubble = b; this.say(b.text); }
  }

  /* ── folder visits ── */
  #onEvent(name) {
    const i = name.indexOf(":");
    const kind = name.slice(0, i);
    const id = name.slice(i + 1);
    if (kind === "open" && this.wm?.windows.get(id)?.folder) {
      clearTimeout(this.visitTimer);
      this.pendingVisit = id;
      this.visitTimer = setTimeout(() => { this.pendingVisit = null; this.#startVisit(id); }, VISIT_DELAY);
    } else if (kind === "close" || kind === "minimize") {
      if (this.pendingVisit === id) { clearTimeout(this.visitTimer); this.pendingVisit = null; }
      if (this.visit?.id !== id) return;
      if (this.mode === "inside") this.#leaveWindow();
      else if (this.mode === "jump") this.#fallFrom(this.y);
      else { this.visit = null; this.mode = "idle"; }
    }
  }

  #canVisit() {
    return this.cat.s.wander && !this.cat.asleep && !isMobile() && !reducedMotion() && this.mode !== "inside";
  }

  #startVisit(id) {
    const win = this.wm.windows.get(id);
    if (!win || win.minimized || !this.#canVisit() || !this.#landing(win)) return;
    this.visit = { id };
    this.mode = "trot";
  }

  /** Where Snowy lands in a window: centre-x and the status bar's top (viewport px). */
  #landing(win) {
    const r = win.el.getBoundingClientRect();
    const bar = win.el.querySelector(".statusbar")?.getBoundingClientRect();
    const floor = bar ? bar.top : r.bottom - 6;
    const taskbarTop = window.innerHeight - this.#taskbarH();
    const x = Math.max(r.left + 50, Math.min(r.left + r.width / 2, r.right - 50));
    const visible = floor > r.top + 80 && floor < taskbarTop - 20 && x > 30 && x < window.innerWidth - 30;
    return visible ? { x, floor } : null;
  }

  #taskbarH() {
    return document.getElementById("taskbar")?.offsetHeight || 38;
  }

  #enterWindow() {
    const win = this.visit && this.wm.windows.get(this.visit.id);
    if (!win) { this.#fallFrom(this.y); return; }
    const rect = this.el.getBoundingClientRect();
    const body = win.body.getBoundingClientRect();
    const bar = win.el.querySelector(".statusbar")?.getBoundingClientRect();
    this.el.classList.add("in-window");
    this.el.style.transform = "";
    this.el.style.left = `${Math.round(rect.left - body.left)}px`;
    this.el.style.bottom = `${Math.round(body.bottom - (bar ? bar.top : body.bottom))}px`;
    win.body.append(this.el);
    this.mode = "inside";
    this.forced = { pose: "happy", until: performance.now() + 2400 };
    this.say(pick(["hi!", "found you!", "*hop*", "mrrp!"]));
  }

  #leaveWindow() {
    const rect = this.el.getBoundingClientRect();
    this.el.classList.remove("in-window");
    this.el.style.left = "";
    this.el.style.bottom = "";
    document.body.append(this.el);
    this.x = rect.left + rect.width / 2;
    this.#fallFrom(Math.min(0, rect.bottom - (window.innerHeight - this.#taskbarH())));
  }

  #fallFrom(y) {
    this.visit = null;
    this.y = y;
    this.mode = "fall";
    this.anim = { t0: performance.now(), from: y };
  }

  /* ── animation loop ── */
  #loop(t) {
    requestAnimationFrame((n) => this.#loop(n));
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    if (this.el.hidden) return;

    const half = this.el.offsetWidth / 2;
    const minX = 6 + half;
    const maxX = Math.max(minX, window.innerWidth - 6 - half);
    // destinations are clamped too: if the browser shrinks mid-walk, Snowy stops at the
    // new edge instead of treading on the spot against it forever
    const clampX = (x) => Math.max(minX, Math.min(x, maxX));
    let pose = this.cat.pose;
    let tilt = 0;
    const lively = pose === "sit" || pose === "happy"; // not asleep / eating / playing

    if (this.mode === "inside") {
      // sitting in the folder; the window carries us around
      if (this.forced && t < this.forced.until && lively) pose = this.forced.pose;
    } else if (this.mode === "trot") {
      const win = this.wm.windows.get(this.visit.id);
      const land = win && !win.minimized && lively && this.#landing(win);
      if (!land) { this.visit = null; this.mode = "idle"; }
      else {
        const dx = clampX(land.x) - this.x;
        this.dir = dx >= 0 ? 1 : -1;
        this.x += Math.sign(dx) * Math.min(Math.abs(dx), TROT_SPEED * dt);
        pose = "walk";
        if (Math.abs(dx) < 1) {
          const top = window.innerHeight - this.#taskbarH();
          this.anim = { t0: t, fromX: this.x, h: 70 };
          this.mode = "jump";
        }
      }
    } else if (this.mode === "jump") {
      // re-aim every frame, so dragging the window mid-jump still lands inside it
      const win = this.visit && this.wm.windows.get(this.visit.id);
      const land = win && !win.minimized && this.#landing(win);
      if (!land) this.#fallFrom(this.y);
      else {
        const p = Math.min(1, (t - this.anim.t0) / JUMP_MS);
        const to = land.floor - (window.innerHeight - this.#taskbarH());
        this.x = this.anim.fromX + (land.x - this.anim.fromX) * p;
        this.y = to * p - this.anim.h * 4 * p * (1 - p);
        tilt = p < 0.5 ? -18 : 10;
        if (p >= 1) this.#enterWindow();
      }
      pose = "walk";
    } else if (this.mode === "fall") {
      const p = Math.min(1, (t - this.anim.t0) / FALL_MS);
      this.y = this.anim.from * (1 - easeIn(p));
      tilt = 8;
      pose = "walk";
      if (p >= 1) { this.y = 0; this.mode = "idle"; this.until = t + 2000; }
    } else if (!lively) {
      this.mode = "idle";
      this.until = t + 1500;
    } else if (this.mode === "walk") {
      pose = "walk";
      this.target = clampX(this.target);
      this.x += WALK_SPEED * dt * this.dir;
      if ((this.dir > 0 && this.x >= this.target) || (this.dir < 0 && this.x <= this.target)) {
        this.x = this.target;
        this.mode = "idle";
        this.until = t + 3000 + Math.random() * 6000;
      }
    } else if (t > this.until) {
      if (Math.random() < 0.65 && !reducedMotion()) {
        this.target = minX + Math.random() * Math.max(0, maxX - minX);
        this.dir = this.target >= this.x ? 1 : -1;
        this.mode = "walk";
      } else {
        this.until = t + 2500 + Math.random() * 4000;
      }
    }

    const airborne = this.mode === "jump" || this.mode === "fall";
    const key = `${pose}:${this.dir}:${airborne}`;
    if (key !== this.shown) {
      this.shown = key;
      this.sprite.innerHTML = catSVG(pose, 0.66);
      this.sprite.classList.toggle("flip", this.dir < 0);
      this.sprite.classList.toggle("airborne", airborne);
    }
    this.sprite.style.transform = tilt ? `rotate(${tilt * this.dir}deg)` : "";
    if (this.mode !== "inside") {
      this.x = clampX(this.x);
      this.el.style.transform = `translate(${Math.round(this.x - half)}px, ${Math.round(this.y)}px)`;
    }
  }
}

/* ───────── the window ───────── */
export function createCatApp(cat) {
  return {
    title: CAT_NAME,
    icon: icons.cat,
    width: 450,
    height: 640,
    mount(body, { win }) {
      body.innerHTML = `
        <div class="fill">
          <div class="grow">
            <div class="cat-app">
              <header class="cat-head">
                <div><small>desktop companion</small><h3>${CAT_NAME}</h3></div>
                <span class="cat-mood"></span>
              </header>
              <div class="cat-scene" title="Click to pet ${SHORT}">
                <div class="cat-window-pane" aria-hidden="true"></div>
                <span class="cat-z" aria-hidden="true" hidden>z z Z</span>
                <div class="cat-stage"></div>
                <p class="cat-caption"></p>
              </div>
              <div class="cat-stats">
                ${["fullness", "happiness", "energy"].map((k) => `
                  <div class="meter" data-k="${k}">
                    <label><span>${k[0].toUpperCase() + k.slice(1)}</span><b></b></label>
                    <div class="bar" role="progressbar" aria-label="${k}" aria-valuemin="0" aria-valuemax="100"><i></i></div>
                  </div>`).join("")}
              </div>
              <div class="cat-actions">
                <button type="button" class="btn" data-act="feed">Feed</button>
                <button type="button" class="btn" data-act="play">Play</button>
                <button type="button" class="btn" data-act="sleep">Sleep</button>
              </div>
              <p class="cat-hint" role="status"></p>
              <fieldset class="groupbox cat-fish">
                <legend>Hidden fish</legend>
                <ul class="fish-list">${FISH.map((f) => `<li data-id="${f.id}">?</li>`).join("")}</ul>
                <p class="fish-note"></p>
              </fieldset>
              <label class="cat-wander"><input type="checkbox"> Let ${SHORT} wander along the taskbar</label>
            </div>
          </div>
          <div class="statusbar"><span>Needs only change while OjasOS is open</span><span>saved in this browser</span></div>
        </div>`;

      const $ = (s) => body.querySelector(s);
      const stage = $(".cat-stage");
      const zz = $(".cat-z");
      const caption = $(".cat-caption");
      const wander = $(".cat-wander input");
      const btn = (a) => body.querySelector(`[data-act="${a}"]`);
      let captionLine = "";
      let captionMood = "";
      let shownPose = "";

      const update = () => {
        const s = cat.s;
        const mood = cat.mood;
        $(".cat-mood").textContent = mood.label;
        if (mood.label !== captionMood) { captionMood = mood.label; captionLine = pick(mood.lines); }
        caption.textContent = cat.busy === "eat" ? "Munching a fish." : cat.busy === "play" ? "Chasing the yarn!" : captionLine;
        for (const m of body.querySelectorAll(".meter")) {
          const v = Math.round(s[m.dataset.k]);
          m.querySelector("b").textContent = `${v}%`;
          m.querySelector("i").style.width = `${v}%`;
          m.querySelector(".bar").setAttribute("aria-valuenow", v);
          m.classList.toggle("low", v < 25);
        }
        btn("feed").disabled = s.asleep;
        btn("play").disabled = s.asleep;
        btn("sleep").textContent = s.asleep ? "Wake up" : "Sleep";
        $(".cat-hint").textContent = cat.message || (s.asleep ? `Wake ${SHORT} to feed or play.` : `Feed, play, or let ${SHORT} nap.`);
        wander.checked = s.wander;
        for (const li of body.querySelectorAll(".fish-list li")) {
          const found = s.found.includes(li.dataset.id);
          li.classList.toggle("found", found);
          li.textContent = found ? "><>" : "?";
          li.title = found ? "Found!" : "Not found yet";
        }
        const next = FISH.find((f) => !s.found.includes(f.id));
        $(".fish-note").textContent = next
          ? `${s.found.length} of ${FISH.length} found. Fish are hidden around OjasOS. Hint: ${next.hint}.`
          : `All ${FISH.length} found. ${SHORT} is very impressed.`;
      };

      // re-draw when the pose changes (eat/play end on a timer, so poll lightly)
      const syncPose = () => {
        const pose = cat.pose;
        zz.hidden = pose !== "sleep";
        if (pose !== shownPose) {
          shownPose = pose;
          stage.innerHTML = catSVG(pose, 1.55);
          update();
        }
      };

      body.querySelector(".cat-actions").addEventListener("click", (e) => {
        const act = e.target.closest("button")?.dataset.act;
        if (act === "feed") cat.feed();
        else if (act === "play") cat.play();
        else if (act === "sleep") cat.toggleSleep();
      });
      $(".cat-scene").addEventListener("click", () => cat.pet());
      wander.addEventListener("change", () => cat.setWander(wander.checked));

      const off = cat.on(() => { update(); syncPose(); });
      const timer = setInterval(syncPose, 250);
      const captionTimer = setInterval(() => { captionLine = pick(cat.mood.lines); update(); }, 7000);
      update();
      syncPose();
      win.cleanup = () => { off(); clearInterval(timer); clearInterval(captionTimer); };
    },
    unmount(win) { win.cleanup?.(); },
  };
}
