// 16x16 pixel-style icons drawn as crisp SVG rectangles/paths.
const svg = (body) =>
  `<svg viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">${body}</svg>`;

const K = "#1c2626"; // outline
const CREAM = "#fffdf6";
const TEAL = "#2f6f73";
const TEAL_L = "#5fa8a0";
const AMBER = "#e2a13d";
const AMBER_D = "#a8691a";
const GREY = "#b9bcb2";

export const icons = {
  terminal: svg(`
    <rect x="1" y="2" width="14" height="11" fill="${K}"/>
    <rect x="2" y="3" width="12" height="9" fill="#08110d"/>
    <rect x="1" y="2" width="14" height="2" fill="${TEAL}"/>
    <path d="M3 6h1v1h1v1H4v1H3z" fill="#8ff2aa"/>
    <rect x="6" y="9" width="4" height="1" fill="#ffc25a"/>
    <rect x="4" y="13" width="8" height="1" fill="${K}"/>
    <rect x="3" y="14" width="10" height="1" fill="${GREY}"/>`),

  about: svg(`
    <path d="M3 1h7l3 3v11H3z" fill="${K}"/>
    <path d="M4 2h5v3h3v9H4z" fill="${CREAM}"/>
    <rect x="10" y="2" width="1" height="2" fill="${GREY}"/>
    <rect x="5" y="6" width="6" height="1" fill="${TEAL}"/>
    <rect x="5" y="8" width="6" height="1" fill="${GREY}"/>
    <rect x="5" y="10" width="5" height="1" fill="${GREY}"/>
    <rect x="5" y="12" width="6" height="1" fill="${GREY}"/>`),

  projects: svg(`
    <path d="M1 3h5l1 1h8v10H1z" fill="${K}"/>
    <path d="M2 4h3.5l1 1H14v8H2z" fill="${AMBER}"/>
    <rect x="2" y="6" width="12" height="7" fill="#f2c26a"/>
    <rect x="2" y="6" width="12" height="1" fill="#fbe1a6"/>
    <rect x="2" y="12" width="12" height="1" fill="${AMBER_D}"/>`),

  file: svg(`
    <path d="M3 1h7l3 3v11H3z" fill="${K}"/>
    <path d="M4 2h5v3h3v9H4z" fill="${CREAM}"/>
    <rect x="10" y="2" width="1" height="2" fill="${GREY}"/>
    <rect x="5" y="7" width="6" height="4" fill="${TEAL_L}"/>
    <rect x="6" y="8" width="2" height="2" fill="${CREAM}"/>
    <rect x="5" y="12" width="4" height="1" fill="${GREY}"/>`),

  ask: svg(`
    <rect x="1" y="2" width="10" height="7" fill="${K}"/>
    <rect x="2" y="3" width="8" height="5" fill="${TEAL_L}"/>
    <path d="M3 9h2v1H4v1H3z" fill="${K}"/>
    <rect x="6" y="6" width="9" height="7" fill="${K}"/>
    <rect x="7" y="7" width="7" height="5" fill="${CREAM}"/>
    <path d="M12 13h2v2h-1v-1h-1z" fill="${K}"/>
    <rect x="8" y="9" width="1" height="1" fill="${K}"/>
    <rect x="10" y="9" width="1" height="1" fill="${K}"/>
    <rect x="12" y="9" width="1" height="1" fill="${K}"/>
    <rect x="3" y="5" width="1" height="1" fill="${CREAM}"/>`),

  contact: svg(`
    <rect x="1" y="3" width="14" height="10" fill="${K}"/>
    <rect x="2" y="4" width="12" height="8" fill="${CREAM}"/>
    <path d="M2 4h1v1h1v1h1v1h1v1h4V7h1V6h1V5h1V4h1v1h-1v1h-1v1h-1v1h-1v1H6V8H5V7H4V6H3V5H2z" fill="${TEAL}"/>
    <rect x="11" y="9" width="2" height="2" fill="${AMBER}"/>`),

  resume: svg(`
    <path d="M3 1h7l3 3v11H3z" fill="${K}"/>
    <path d="M4 2h5v3h3v9H4z" fill="${CREAM}"/>
    <rect x="10" y="2" width="1" height="2" fill="${GREY}"/>
    <rect x="5" y="5" width="3" height="3" fill="${TEAL_L}"/>
    <rect x="5" y="9" width="6" height="1" fill="${GREY}"/>
    <rect x="5" y="11" width="6" height="1" fill="${GREY}"/>
    <rect x="2" y="11" width="7" height="3" fill="#b4443a"/>
    <rect x="3" y="12" width="5" height="1" fill="${CREAM}"/>`),

  shutdown: svg(`
    <rect x="2" y="2" width="12" height="12" fill="${K}"/>
    <rect x="3" y="3" width="10" height="10" fill="#b4443a"/>
    <rect x="7" y="4" width="2" height="5" fill="${CREAM}"/>
    <path d="M5 6h1v4h1v1h2v-1h1V6h1v5h-1v1H6v-1H5z" fill="${CREAM}"/>`),

  reboot: svg(`
    <rect x="2" y="2" width="12" height="12" fill="${K}"/>
    <rect x="3" y="3" width="10" height="10" fill="${TEAL}"/>
    <path d="M6 5h4v1h1v1h-1v1H9V7H6v1H5v3h1v1h3v-1h1v1H9v1H6v-1H5v-1H4V6h1V5z" fill="${CREAM}"/>
    <rect x="9" y="5" width="3" height="1" fill="${CREAM}"/>
    <rect x="11" y="4" width="1" height="3" fill="${CREAM}"/>`),

  cat: svg(`
    <path d="M2 1h2v1h1v1h1v1h4V3h1V2h1V1h2v12h-1v1H3v-1H2z" fill="${K}"/>
    <path d="M3 3h1v1h1v1h6V4h1V3h1v9H3z" fill="#ffffff"/>
    <rect x="3" y="3" width="1" height="2" fill="#f06a2c"/>
    <rect x="12" y="3" width="1" height="2" fill="#f06a2c"/>
    <rect x="7" y="5" width="2" height="1" fill="#f06a2c"/>
    <rect x="5" y="7" width="2" height="2" fill="${K}"/>
    <rect x="9" y="7" width="2" height="2" fill="${K}"/>
    <rect x="6" y="7" width="1" height="1" fill="#ffffff"/>
    <rect x="10" y="7" width="1" height="1" fill="#ffffff"/>
    <rect x="7" y="9" width="2" height="1" fill="#f27b93"/>
    <rect x="3" y="11" width="10" height="1" fill="#e2372d"/>
    <rect x="7" y="12" width="2" height="1" fill="#f8c630"/>`),

  photoFolder: svg(`
    <path d="M1 3h5l1 1h8v10H1z" fill="${K}"/>
    <path d="M2 4h3.5l1 1H14v8H2z" fill="${AMBER}"/>
    <rect x="2" y="6" width="12" height="7" fill="#f2c26a"/>
    <rect x="2" y="6" width="12" height="1" fill="#fbe1a6"/>
    <path d="M6 7h1v1h2V7h1v4H6z" fill="${K}"/>
    <path d="M7 8h2v1h-2z M6.5 9h3v1.5h-3z" fill="#ffffff"/>
    <rect x="7" y="9" width="1" height="1" fill="${K}"/>
    <rect x="8.5" y="9" width="1" height="1" fill="${K}"/>
    <rect x="2" y="12" width="12" height="1" fill="${AMBER_D}"/>`),

  photo: svg(`
    <rect x="1" y="2" width="14" height="12" fill="${K}"/>
    <rect x="2" y="3" width="12" height="10" fill="#cfe7f2"/>
    <circle cx="11" cy="6" r="1.5" fill="#ffffff"/>
    <path d="M2 13v-3l3-3 3 3 2-2 4 4v1z" fill="${TEAL_L}"/>
    <path d="M2 13v-1l3-3 3 3 2-1 4 2v0z" fill="${TEAL}"/>`),

  note: svg(`
    <path d="M2 2h12v9l-3 3H2z" fill="${K}"/>
    <path d="M3 3h10v7.5L10.5 13H3z" fill="#fbe7a1"/>
    <path d="M10.5 13v-2.5H13z" fill="${AMBER_D}"/>
    <rect x="4" y="5" width="7" height="1" fill="${AMBER_D}"/>
    <rect x="4" y="7" width="7" height="1" fill="${AMBER_D}"/>
    <rect x="4" y="9" width="5" height="1" fill="${AMBER_D}"/>`),

  display: svg(`
    <rect x="1" y="2" width="14" height="10" fill="${K}"/>
    <rect x="2" y="3" width="12" height="8" fill="#ff8a14"/>
    <rect x="2" y="3" width="12" height="3" fill="#7a2e0e"/>
    <circle cx="8" cy="8" r="2" fill="#fffd1b"/>
    <rect x="2" y="8" width="12" height="3" fill="#2a0705"/>
    <rect x="6" y="12" width="4" height="1" fill="${K}"/>
    <rect x="4" y="13" width="8" height="2" fill="${GREY}"/>`),

  help: svg(`
    <rect x="2" y="2" width="12" height="12" fill="${K}"/>
    <rect x="3" y="3" width="10" height="10" fill="${TEAL_L}"/>
    <path d="M6 5h4v1h1v2h-1v1H9v1H7V8h1V7h1V6H7v1H6z" fill="${CREAM}"/>
    <rect x="7" y="11" width="2" height="1" fill="${CREAM}"/>`),

  games: svg(`
    <path d="M1 3h5l1 1h8v10H1z" fill="${K}"/>
    <path d="M2 4h3.5l1 1H14v8H2z" fill="${AMBER}"/>
    <rect x="2" y="6" width="12" height="7" fill="#f2c26a"/>
    <rect x="2" y="6" width="12" height="1" fill="#fbe1a6"/>
    <rect x="3" y="7" width="10" height="5" fill="${K}"/>
    <rect x="4" y="8" width="8" height="3" fill="${GREY}"/>
    <rect x="4" y="9" width="3" height="1" fill="${K}"/>
    <rect x="5" y="8" width="1" height="3" fill="${K}"/>
    <rect x="9" y="9" width="1" height="1" fill="#b4443a"/>
    <rect x="10" y="8" width="1" height="1" fill="${TEAL}"/>
    <rect x="2" y="12" width="12" height="1" fill="${AMBER_D}"/>`),

  sweep: svg(`
    <rect x="1" y="1" width="14" height="14" fill="${K}"/>
    <rect x="2" y="2" width="12" height="12" fill="#c5d6b0"/>
    <rect x="2" y="2" width="8" height="4" fill="${CREAM}"/>
    <rect x="2" y="6" width="4" height="4" fill="${CREAM}"/>
    <rect x="6" y="6" width="8" height="1" fill="#9fb488"/>
    <rect x="2" y="10" width="12" height="1" fill="#9fb488"/>
    <rect x="10" y="2" width="1" height="12" fill="#9fb488"/>
    <rect x="6" y="7" width="1" height="7" fill="#9fb488"/>
    <rect x="8" y="3" width="1" height="3" fill="${TEAL}"/>
    <rect x="7" y="3" width="1" height="1" fill="${TEAL}"/>
    <rect x="4" y="7" width="1" height="3" fill="#b4443a"/>
    <rect x="3" y="7" width="1" height="1" fill="#b4443a"/>
    <path d="M11 13h1v-1h1v-1h1v2h-1v1h-2z" fill="#3f7a2f"/>
    <rect x="12" y="12" width="1" height="1" fill="#a9d58a"/>`),

  yarn: svg(`
    <path d="M1 14h3v-1h2v-1h1v1H6v1H4v1H1z" fill="#d9534f"/>
    <rect x="6" y="2" width="8" height="10" fill="${K}"/>
    <rect x="5" y="3" width="10" height="8" fill="${K}"/>
    <rect x="7" y="3" width="6" height="8" fill="#d9534f"/>
    <rect x="6" y="4" width="8" height="6" fill="#d9534f"/>
    <path d="M7 5h1v1h1v1h1v1h1v1h1v1h-1V9h-1V8H9V7H8V6H7z" fill="#f29a8f"/>
    <path d="M10 4h2v1h1v1h-1V5h-2z" fill="#f29a8f"/>
    <path d="M7 8h1v1h1v1H8V9H7z" fill="#f29a8f"/>
    <rect x="6" y="10" width="2" height="1" fill="#6e2220"/>`),

  boxes: svg(`
    <rect x="1" y="10" width="14" height="5" fill="${K}"/>
    <rect x="2" y="11" width="12" height="3" fill="#d9b27c"/>
    <rect x="7" y="11" width="2" height="2" fill="#ead7ad"/>
    <rect x="3" y="6" width="10" height="5" fill="${K}"/>
    <rect x="4" y="7" width="8" height="3" fill="#cfa36b"/>
    <rect x="7" y="7" width="2" height="2" fill="#ead7ad"/>
    <rect x="5" y="3" width="7" height="4" fill="${K}"/>
    <rect x="6" y="4" width="5" height="2" fill="#e0bd8a"/>
    <rect x="6" y="1" width="1" height="1" fill="${K}"/>
    <rect x="10" y="1" width="1" height="1" fill="${K}"/>
    <rect x="6" y="2" width="1" height="1" fill="#ffffff"/>
    <rect x="10" y="2" width="1" height="1" fill="#ffffff"/>`),

  network: svg(`
    <rect x="1" y="2" width="14" height="11" fill="${K}"/>
    <rect x="2" y="3" width="12" height="9" fill="#0d1117"/>
    <rect x="1" y="2" width="14" height="2" fill="${TEAL}"/>
    <rect x="3" y="5" width="2" height="1" fill="#79c0ff"/>
    <rect x="6" y="5" width="5" height="1" fill="#7ee787"/>
    <rect x="3" y="7" width="2" height="1" fill="#7ee787"/>
    <rect x="8" y="7" width="3" height="1" fill="#7ee787"/>
    <rect x="3" y="9" width="2" height="1" fill="#ffa657"/>
    <rect x="9" y="9" width="4" height="1" fill="#ff7b72"/>
    <rect x="4" y="13" width="8" height="1" fill="${K}"/>
    <rect x="3" y="14" width="10" height="1" fill="${GREY}"/>`),

  // window control glyphs (9x9)
  min: `<svg viewBox="0 0 9 9" shape-rendering="crispEdges" aria-hidden="true"><rect x="1" y="7" width="6" height="2" fill="currentColor"/></svg>`,
  max: `<svg viewBox="0 0 9 9" shape-rendering="crispEdges" aria-hidden="true"><path d="M0 0h9v9H0zM1 2v6h7V2z" fill="currentColor" fill-rule="evenodd"/></svg>`,
  close: `<svg viewBox="0 0 9 9" aria-hidden="true"><path d="M1 1l7 7M8 1L1 8" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>`,
};
