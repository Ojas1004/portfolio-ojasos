// OjasOS entry point: boot sequence, desktop, start menu, tray.
import { api } from "./api.js";
import { createApps, launchers, bindActivate } from "./apps.js";
import { CatState, Walker, createCatApp } from "./cat.js";
import { Backgrounds, createDisplayApp } from "./background.js";
import { initDesktopMenu } from "./desktop-menu.js";
import { icons } from "./icons.js";
import { createGames } from "./games.js";
import { askForName, identity } from "./identity.js";
import { createNetwork } from "./network.js";
import { createNotes } from "./notes.js";
import { WindowManager, escapeHtml, isMobile, narrowScreen, setTouchEdition, touchEditionChosen } from "./wm.js";

const config = window.OJASOS || { profile: { name: "Ojas", projects: [], about: [] } };
const $ = (sel) => document.querySelector(sel);

const storage = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* storage blocked */ } },
};

/* ───────── boot ───────── */
const LOGO = String.raw`
  ___  _              ___  ____
 / _ \(_) __ _ ___   / _ \/ ___|
| | | | |/ _' / __| | | | \___ \
| |_| | | (_| \__ \ | |_| |___) |
 \___// |\__,_|___/  \___/|____/
    |__/`;

function bootLines() {
  return [
    ["OJAS BIOS v1.0  (c) 2026 Ojas Chaudhary", "tag"],
    ["CPU: Python 3 Interpreter @ 1 instruction at a time", ""],
    ["Memory test: 524288K OK", "ok"],
    ["", ""],
    ["Detecting drives...  C:\\OJAS  [flask]  D:\\DATA  [mongodb]", ""],
    ["[ OK ] Mounted /data/knowledge.json", "ok"],
    ["[ OK ] Loaded TF-IDF index", "ok"],
    ["[ OK ] Started window manager", "ok"],
    ["[ OK ] Reached target Desktop", "ok"],
    ["", ""],
    [LOGO, "logo"],
  ];
}

function runBoot() {
  return new Promise((resolve) => {
    const boot = $("#boot");
    const log = $("#boot-log");
    const fast = storage.get("ojasos:booted") || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lines = bootLines();
    const delay = fast ? 40 : 170;
    let i = 0;
    let timer;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      storage.set("ojasos:booted", "1");
      window.removeEventListener("keydown", finish);
      boot.removeEventListener("pointerdown", finish);
      boot.classList.add("is-done");
      setTimeout(() => boot.remove(), 400);
      resolve();
    };

    const step = () => {
      if (i >= lines.length) { timer = setTimeout(finish, fast ? 150 : 650); return; }
      const [text, cls] = lines[i++];
      const span = document.createElement("span");
      if (cls) span.className = cls;
      span.textContent = text + "\n";
      log.append(span);
      timer = setTimeout(step, delay + (cls === "ok" ? Math.random() * 120 : 0));
    };

    window.addEventListener("keydown", finish);
    boot.addEventListener("pointerdown", finish);
    step();
  });
}

/* ───────── desktop ───────── */
function buildDesktop(wm) {
  const iconList = $("#icons");
  for (const l of launchers) {
    const li = document.createElement("li");
    li.innerHTML = `<button type="button" class="icon" data-app="${l.id}">${l.icon}<span>${l.label}</span></button>`;
    bindActivate(li.firstElementChild, () => wm.open(l.id), iconList);
    iconList.append(li);
  }
  // clicking empty desktop clears icon selection
  $("#desktop").addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".icon")) iconList.querySelectorAll(".is-selected").forEach((n) => n.classList.remove("is-selected"));
  });
}

function buildStartMenu(wm) {
  const btn = $("#start-btn");
  const menu = $("#start-menu");
  menu.innerHTML = `
    <div class="start-side"><span>Ojas<b>OS</b> 1.0</span></div>
    <div class="start-items">
      ${launchers.map((l) => `<button type="button" role="menuitem" data-app="${l.id}">${l.icon}<span>${l.label}</span></button>`).join("")}
      <hr>
      <button type="button" role="menuitem" data-act="logoff">${icons.about}<span>Log Off ${escapeHtml(identity.login)}...</span></button>
      <button type="button" role="menuitem" data-act="reboot">${icons.reboot}<span>Restart...</span></button>
      <button type="button" role="menuitem" data-act="shutdown">${icons.shutdown}<span>Shut Down...</span></button>
    </div>`;

  const setOpen = (open) => {
    menu.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    if (open) menu.querySelector("button")?.focus();
  };

  btn.addEventListener("click", () => setOpen(menu.hidden));
  menu.addEventListener("click", (e) => {
    const item = e.target.closest("button");
    if (!item) return;
    setOpen(false);
    if (item.dataset.app) wm.open(item.dataset.app);
    else if (item.dataset.act === "logoff") { identity.clear(); location.reload(); }
    else if (item.dataset.act === "reboot") { try { sessionStorage.removeItem("ojasos:booted"); } catch {} location.reload(); }
    else if (item.dataset.act === "shutdown") shutdown();
  });
  document.addEventListener("pointerdown", (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) { setOpen(false); btn.focus(); }
  });
}

function shutdown() {
  const screen = document.createElement("div");
  screen.className = "shutdown";
  screen.innerHTML = `<div><p>It is now safe to close this tab.</p><button type="button" class="btn">Turn back on</button></div>`;
  screen.querySelector("button").addEventListener("click", () => location.reload());
  document.body.append(screen);
}

function startClock() {
  const el = $("#tray-clock");
  const tick = () => {
    const now = new Date();
    el.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    el.dateTime = now.toISOString();
    el.title = now.toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  };
  tick();
  setInterval(tick, 10_000);
}

export async function loadVisitors() {
  // Count each browser session once; later page loads only read the counter.
  const counted = storage.get("ojasos:counted");
  const { ok, data } = await api(counted ? "/api/visit?peek=1" : "/api/visit");
  const out = $("#tray-visitors");
  if (ok && data && typeof data.count === "number") {
    out.textContent = String(data.count).padStart(4, "0");
    storage.set("ojasos:counted", "1");
  } else {
    out.textContent = "----";
    out.parentElement.title = "Visitor counter offline";
  }
}

/* ───────── start ───────── */
async function main() {
  const cat = new CatState();
  document.addEventListener("ojasos:event", (e) => cat.discover(e.detail));
  const backgrounds = new Backgrounds($("#desktop"), $("#wallpaper"));
  const notes = createNotes(bindActivate);
  const apps = createApps(config, { cat: createCatApp(cat), display: createDisplayApp(backgrounds), ...notes.apps, ...createGames(cat), network: { ...createNetwork(), icon: icons.network } });
  const wm = new WindowManager({ container: $("#windows"), taskbar: $("#task-buttons"), apps });
  window.ojasos = { wm, cat, backgrounds }; // the terminal's `snowy` command talks to the cat through this

  await runBoot();
  if (!identity.decided) await askForName(icons.about); // first visit: who's logging on?
  $("#desktop").hidden = false;
  $("#taskbar").hidden = false;
  backgrounds.apply(backgrounds.current, { save: false });
  initDesktopMenu($("#desktop"), [
    { label: "New note", action: () => notes.newNote(wm) },
    { label: "My Notes", action: () => notes.openNotesFolder(wm) },
    { label: "Change background...", action: () => wm.open("display") },
    { label: "Restore default background", action: () => backgrounds.restoreDefault() },
    { label: "Show desktop", action: () => wm.showDesktop() },
    { label: "Help / Welcome.txt", action: () => wm.open("welcome") },
    {
      label: "Touch edition",
      checked: () => touchEditionChosen() || narrowScreen(),
      disabled: () => narrowScreen(),
      title: () => (narrowScreen() ? "Always on for small screens" : "Big icons, one tap to open, full-screen windows"),
      action: () => setTouchEdition(!touchEditionChosen()),
    },
  ]);
  buildDesktop(wm);
  buildStartMenu(wm);
  startClock();
  loadVisitors();
  window.ojasos.walker = new Walker(cat, { wm, onOpen: () => wm.open("cat") });
  if (!isMobile()) wm.open("terminal");
}

main();
