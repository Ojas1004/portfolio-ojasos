// Notes: "New note" opens an editable Notepad window, "My Notes" is a folder of
// them. Notes belong to the visitor, so they're kept in this browser
// (localStorage) and autosave as you type. Also: the read-only Welcome.txt.
import { icons } from "./icons.js";
import { escapeHtml } from "./wm.js";

const KEY = "ojasos:notes";
const MAX_NOTES = 50;
const MAX_CHARS = 20000;

/* ── storage ── */
const load = () => { try { const n = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(n) ? n : []; } catch { return []; } };
let notes = load();
let storageOk = true;

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(notes)); storageOk = true; } catch { storageOk = false; }
  document.dispatchEvent(new CustomEvent("ojasos:notes"));
}

export const noteTitle = (n) => (n.body.split("\n").map((l) => l.trim()).find(Boolean) || "Untitled").slice(0, 32);
const words = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);
const when = (ts) => new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/* ── apps ── */
export function createNotes(bindActivate) {
  let wmRef = null;

  function newNote(wm) {
    wmRef = wm;
    if (notes.length >= MAX_NOTES) {
      openNotesFolder(wm, `You have ${MAX_NOTES} notes, which is the limit. Delete one to make room.`);
      return;
    }
    const note = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), body: "", updated: Date.now() };
    notes.unshift(note);
    persist();
    openNote(wm, note.id);
  }

  function openNote(wm, id) {
    wmRef = wm;
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    wm.openWindow({
      id: `note:${id}`,
      title: `${noteTitle(note)}.txt - Notepad`,
      icon: icons.note,
      width: 500,
      height: 400,
      bodyClass: "inset",
      mount(body, { win }) {
        body.innerHTML = `
          <div class="fill note-editor">
            <div class="resume-toolbar">
              <button type="button" class="btn" data-act="new">New</button>
              <button type="button" class="btn" data-act="folder">My Notes</button>
              <button type="button" class="btn" data-act="delete">Delete</button>
            </div>
            <textarea class="note-area" maxlength="${MAX_CHARS}" spellcheck="true" aria-label="Note text"
              placeholder="Start typing... Notes save automatically in this browser."></textarea>
            <div class="statusbar"><span class="note-status">Saved</span><span class="note-count"></span></div>
          </div>`;
        const area = body.querySelector(".note-area");
        const status = body.querySelector(".note-status");
        const count = body.querySelector(".note-count");
        area.value = note.body;
        let timer;

        const setTitle = () => {
          const t = `${noteTitle(note)}.txt - Notepad`;
          win.el.querySelector(".titlebar h2").textContent = t;
          win.btn.querySelector("span").textContent = t;
          win.el.setAttribute("aria-label", t);
        };
        const save = () => {
          note.body = area.value;
          note.updated = Date.now();
          notes = [note, ...notes.filter((n) => n.id !== note.id)]; // most recent first
          persist();
          status.textContent = storageOk ? `Saved ${when(note.updated)}` : "Could not save (browser storage is full or blocked)";
          setTitle();
        };
        const updateCount = () => { count.textContent = `${words(area.value)} words · ${area.value.length} chars`; };

        area.addEventListener("input", () => {
          status.textContent = "Editing...";
          updateCount();
          clearTimeout(timer);
          timer = setTimeout(save, 400);
        });
        body.querySelector(".resume-toolbar").addEventListener("click", (e) => {
          const act = e.target.closest("[data-act]")?.dataset.act;
          if (act === "new") newNote(wmRef);
          else if (act === "folder") openNotesFolder(wmRef);
          else if (act === "delete" && (!area.value.trim() || confirm(`Delete "${noteTitle(note)}"?`))) {
            clearTimeout(timer);
            notes = notes.filter((n) => n.id !== note.id);
            persist();
            win.deleted = true;
            wmRef.close(win.id);
          }
        });
        win.el.addEventListener("wm:focus", () => setTimeout(() => area.focus({ preventScroll: true }), 0));
        win.cleanup = () => {
          clearTimeout(timer);
          if (win.deleted) return;
          note.body = area.value;
          if (!note.body.trim()) notes = notes.filter((n) => n.id !== note.id); // don't keep empty notes
          persist();
        };
        updateCount();
        if (note.body) status.textContent = `Saved ${when(note.updated)}`;
      },
      unmount(win) { win.cleanup?.(); },
    });
  }

  const notesFolder = {
    title: "My Notes",
    folder: true, // Snowy visits this folder too
    icon: icons.projects,
    width: 520,
    height: 340,
    mount(body, { wm, win, opts }) {
      body.innerHTML = `
        <div class="fill">
          <div class="mail-toolbar"><button type="button" class="btn" data-act="new" style="height:28px;flex-direction:row">${icons.note}<span>New note</span></button><span class="mail-status notes-msg"></span></div>
          <div class="grow" style="background:var(--paper);box-shadow:var(--sunken)"><ul class="files" aria-label="Your notes"></ul></div>
          <div class="statusbar"><span class="count"></span><span>saved in this browser</span></div>
        </div>`;
      const list = body.querySelector(".files");
      const render = () => {
        body.querySelector(".count").textContent = `${notes.length} object(s)`;
        if (!notes.length) {
          list.innerHTML = `<li class="muted" style="grid-column:1/-1;padding:8px">No notes yet. Click <b>New note</b>, or right-click the desktop and choose <b>New note</b>.</li>`;
          return;
        }
        list.replaceChildren();
        for (const n of notes) {
          const li = document.createElement("li");
          li.innerHTML = `<button type="button" class="icon" title="${escapeHtml(noteTitle(n))}">${icons.note}<span>${escapeHtml(noteTitle(n))}.txt<small>${escapeHtml(when(n.updated))}</small></span></button>`;
          bindActivate(li.firstElementChild, () => openNote(wm, n.id), list);
          list.append(li);
        }
      };
      body.querySelector('[data-act="new"]').addEventListener("click", () => newNote(wm));
      const showMsg = (m) => { body.querySelector(".notes-msg").textContent = m || ""; };
      win.onReopen = (o) => showMsg(o?.message);
      document.addEventListener("ojasos:notes", render);
      win.cleanup = () => document.removeEventListener("ojasos:notes", render);
      render();
      showMsg(opts?.message);
    },
    unmount(win) { win.cleanup?.(); },
  };

  function openNotesFolder(wm, message) {
    wm.open("notes", { message });
  }

  return {
    apps: { notes: notesFolder, welcome: welcomeApp },
    newNote,
    openNotesFolder,
  };
}

/* ── Welcome.txt ── */
const WELCOME = `Welcome to OjasOS!
==================

OjasOS is Ojas Chaudhary's portfolio, built as a small retro operating
system. Everything here works: the terminal, the Q&A, the contact form and
the visitor counter all run on a real Python (Flask) backend.

GETTING AROUND
  - Double-click a desktop icon to open it (one tap in Touch edition).
  - Drag a window by its title bar. Use _ [] x to minimize, maximize, close.
  - The taskbar shows your open windows. Start lists every app.
  - Right-click the desktop (or long-press on a touch screen) for notes,
    backgrounds, Show desktop, this help file and Touch edition.

THINGS TO TRY
  - Terminal: help, whoami, projects, skills, ask <question>, neofetch
  - Ask Ojas: ask about my projects, skills or background.
  - Projects and Snowy: folders. Open a file to read it or view a photo.
  - Contact: send me a message. It lands straight in my inbox.
  - Resume: view or download my CV.

MEET SNOWY SINGH
  Snowy is the white cat walking on the taskbar. Click him to feed him,
  play, or let him nap. Open a folder and wait a few seconds: he likes to
  jump in. Five hidden fish are tucked around OjasOS for him to find.
  The terminal works too: snowy feed, snowy play, snowy pet.

YOUR STUFF
  Notes, your background, Snowy's mood and Touch edition are saved in this
  browser only. Nothing you write in a note is sent anywhere.

Have fun poking around!
`;

const welcomeApp = {
  title: "Welcome.txt - Notepad",
  icon: icons.help,
  width: 560,
  height: 480,
  bodyClass: "inset",
  mount(body) {
    body.classList.add("notepad");
    body.innerHTML = `<pre class="page welcome-text"></pre>`;
    body.querySelector("pre").textContent = WELCOME;
  },
};

