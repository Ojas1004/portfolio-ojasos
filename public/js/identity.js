// The visitor's name: asked once on the first visit (or "guest"), then used by
// the terminal prompt, neofetch and the contact form. It is a per-visitor
// convenience, so it lives in this browser's localStorage. It is sent to the
// server only alongside terminal commands (to render neofetch) and never stored.
import { escapeHtml } from "./wm.js";

const KEY = "ojasos:user";
export const MAX_NAME = 24;

/** Keep letters and their marks (any script), digits, spaces and . _ - ; collapse spaces. */
export function cleanName(raw) {
  return String(raw ?? "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\p{N} ._-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME)
    .trim();
}

/** Terminal-style login for a name: "Priya Sharma" -> "priya-sharma". */
export function loginFor(name) {
  const login = cleanName(name).toLowerCase().replace(/ /g, "-").replace(/[^\p{L}\p{M}\p{N}._-]/gu, "").slice(0, 16);
  return login || "guest";
}

const read = () => {
  try { const v = JSON.parse(localStorage.getItem(KEY)); return v && typeof v === "object" ? v : null; } catch { return null; }
};

export const identity = {
  /** true once the visitor has either entered a name or chosen guest */
  get decided() { return !!read(); },
  get name() { return cleanName(read()?.name) || null; },
  get login() { return this.name ? loginFor(this.name) : "guest"; },
  set(name) {
    const clean = cleanName(name);
    try { localStorage.setItem(KEY, JSON.stringify(clean ? { name: clean } : { guest: true })); } catch { /* storage blocked */ }
    document.dispatchEvent(new CustomEvent("ojasos:user"));
  },
  /** Log off: forget the name so the next start asks again. */
  clear() { try { localStorage.removeItem(KEY); } catch { /* storage blocked */ } },
};

/**
 * The log-on screen shown after the boot sequence on a first visit.
 * Resolves when the visitor enters a name or continues as a guest.
 */
export function askForName(icon) {
  return new Promise((resolve) => {
    const screen = document.createElement("div");
    screen.className = "logon";
    screen.innerHTML = `
      <form class="logon-box window is-focused" role="dialog" aria-modal="true" aria-labelledby="logon-title" novalidate>
        <header class="titlebar">${icon || ""}<h2 id="logon-title">Welcome to OjasOS</h2></header>
        <div class="logon-body">
          <div class="logon-banner"><b>Ojas</b>OS <span>1.0</span></div>
          <p>Type a name to log on to OjasOS. It stays in this browser, and you'll see it in the Terminal.</p>
          <label class="logon-field"><span>User name:</span>
            <input class="field" name="name" maxlength="${MAX_NAME}" autocomplete="given-name" spellcheck="false" placeholder="Your name">
          </label>
          <p class="logon-preview" aria-live="polite"></p>
          <div class="dialog-buttons">
            <button type="button" class="btn" data-guest>Continue as guest</button>
            <button type="submit" class="btn primary">OK</button>
          </div>
        </div>
      </form>`;
    document.body.append(screen);
    const form = screen.querySelector("form");
    const input = form.elements.name;
    const preview = screen.querySelector(".logon-preview");

    const update = () => {
      const name = cleanName(input.value);
      preview.innerHTML = name ? `You'll be <code>${escapeHtml(loginFor(name))}@ojasos</code>` : "Leave it empty to continue as <code>guest@ojasos</code>";
    };
    const done = (name) => {
      identity.set(name);
      screen.classList.add("is-done");
      setTimeout(() => screen.remove(), 220);
      resolve(identity.name);
    };

    input.addEventListener("input", update);
    form.addEventListener("submit", (e) => { e.preventDefault(); done(input.value); });
    form.querySelector("[data-guest]").addEventListener("click", () => done(""));
    form.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); done(""); } });
    update();
    setTimeout(() => input.focus(), 50);
  });
}
