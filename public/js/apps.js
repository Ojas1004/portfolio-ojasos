// App registry: each app knows how to render itself into a window body.
import { api } from "./api.js";
import { icons } from "./icons.js";
import { createChat } from "./chat.js";
import { createContact } from "./contact.js";
import { createTerminal } from "./terminal.js";
import { escapeHtml, isMobile } from "./wm.js";

/**
 * Make an icon-like element open on double-click (desktop) or tap (mobile),
 * select on single click, and open on Enter for keyboard users.
 */
export function bindActivate(el, onOpen, group) {
  el.addEventListener("click", () => {
    group?.querySelectorAll(".is-selected").forEach((n) => n.classList.remove("is-selected"));
    el.classList.add("is-selected");
    if (isMobile()) onOpen();
  });
  el.addEventListener("dblclick", () => { if (!isMobile()) onOpen(); });
  el.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); onOpen(); } });
}

const paragraphs = (list) => list.map((p) => `<p>${escapeHtml(p)}</p>`).join("");

export function createApps(config, extra = {}) {
  const { profile } = config;

  const about = {
    title: "about_me.txt - Notepad",
    icon: icons.about,
    width: 560,
    height: 470,
    bodyClass: "inset",
    mount(body) {
      body.classList.add("notepad");
      body.innerHTML = `
        <div class="fill">
          <div class="grow"><div class="page">
            <h3>${escapeHtml(profile.name)}</h3>
            <p class="meta">${escapeHtml(profile.role)} · ${escapeHtml(profile.location)}</p>
            ${paragraphs(profile.about)}
            <p class="muted">-- open Terminal and type <b>help</b> for more</p>
          </div></div>
        </div>`;
    },
  };

  const openProject = (wm, p) =>
    wm.openWindow({
      id: `project:${p.id}`,
      title: `${p.id}.txt - Notepad`,
      icon: icons.file,
      width: 540,
      height: 420,
      bodyClass: "inset",
      mount(body) {
        body.classList.add("notepad");
        const link = p.link ? `<a href="${escapeHtml(p.link)}" target="_blank" rel="noopener">${escapeHtml(p.link)}</a>` : "-";
        body.innerHTML = `
          <div class="page">
            <h3>${escapeHtml(p.name)}</h3>
            <p class="meta">${escapeHtml(p.tagline)}</p>
            <p>${escapeHtml(p.description)}</p>
            ${p.highlights?.length ? `<ul class="highlights">${p.highlights.map((h) => `<li>${escapeHtml(h)}</li>`).join("")}</ul>` : ""}
            <dl>
              ${p.org ? `<dt>built at</dt><dd>${escapeHtml(p.org)}</dd>` : ""}
              <dt>stack</dt><dd><ul class="tag-list">${p.stack.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul></dd>
              <dt>year</dt><dd>${escapeHtml(p.year)}</dd>
              <dt>status</dt><dd>${escapeHtml(p.status)}</dd>
              <dt>link</dt><dd>${link}</dd>
            </dl>
          </div>`;
      },
    });

  const projects = {
    title: "Projects",
    folder: true, // Snowy likes to jump into folders
    icon: icons.projects,
    width: 520,
    height: 340,
    mount(body, { wm }) {
      body.innerHTML = `
        <div class="fill">
          <div class="folder-path"><span>Address</span><code>C:\\OJAS\\PROJECTS</code></div>
          <div class="grow" style="background:var(--paper);box-shadow:var(--sunken)">
            <ul class="files" aria-label="Project files"></ul>
          </div>
          <div class="statusbar"><span>${profile.projects.length} object(s)</span><span>${isMobile() ? "tap" : "double-click"} a file to open it</span></div>
        </div>`;
      const list = body.querySelector(".files");
      for (const p of profile.projects) {
        const li = document.createElement("li");
        li.innerHTML = `<button type="button" class="icon">${icons.file}<span>${escapeHtml(p.id)}.txt<small>${escapeHtml(p.stack.slice(0, 2).join(", "))}</small></span></button>`;
        bindActivate(li.firstElementChild, () => openProject(wm, p), list);
        list.append(li);
      }
    },
  };

  /* ── Snowy photo folder + viewer ── */
  let photosPromise = null;
  const loadPhotos = () =>
    (photosPromise ??= api("/img/snowy/photos.json").then(({ ok, data }) => (ok && Array.isArray(data) ? data : [])));

  const openPhoto = (wm, photos, index) => {
    const win = wm.openWindow({
      id: "photo-viewer",
      title: "Photo Viewer",
      icon: icons.photo,
      width: 720,
      height: 560,
      opts: { index },
      mount(body, { win, opts }) {
        body.innerHTML = `
          <div class="fill">
            <div class="resume-toolbar">
              <button type="button" class="btn" data-go="-1" aria-label="Previous photo">&#9664; Prev</button>
              <button type="button" class="btn" data-go="1" aria-label="Next photo">Next &#9654;</button>
              <span class="viewer-count"></span>
              <a class="btn viewer-open" target="_blank" rel="noopener">Open original</a>
            </div>
            <div class="viewer-stage"><img alt=""></div>
            <div class="statusbar"><span class="viewer-caption"></span><span class="viewer-dims"></span></div>
          </div>`;
        const img = body.querySelector(".viewer-stage img");
        let current = 0;
        const show = (i) => {
          current = (i + photos.length) % photos.length;
          const p = photos[current];
          img.src = p.src;
          img.alt = p.caption || p.name;
          body.querySelector(".viewer-count").textContent = `${current + 1} / ${photos.length}`;
          body.querySelector(".viewer-open").href = p.src;
          body.querySelector(".viewer-caption").textContent = p.caption || p.name;
          body.querySelector(".viewer-dims").textContent = `${p.width} × ${p.height}`;
          const title = `${p.name} - Photo Viewer`;
          win.el.querySelector(".titlebar h2").textContent = title;
          win.btn.querySelector("span").textContent = title;
          win.el.setAttribute("aria-label", title);
        };
        body.querySelector(".resume-toolbar").addEventListener("click", (e) => {
          const go = e.target.closest("[data-go]")?.dataset.go;
          if (go) show(current + Number(go));
        });
        win.el.addEventListener("keydown", (e) => {
          if (e.key === "ArrowLeft") show(current - 1);
          else if (e.key === "ArrowRight") show(current + 1);
        });
        win.onReopen = (o) => show(o.index ?? current);
        show(opts.index ?? 0);
      },
    });
    return win;
  };

  const snowy = {
    title: "Snowy",
    folder: true, // yes, Snowy jumps into his own photo folder
    icon: icons.photoFolder,
    width: 520,
    height: 340,
    mount(body, { wm }) {
      body.innerHTML = `
        <div class="fill">
          <div class="folder-path"><span>Address</span><code>C:\\OJAS\\SNOWY</code></div>
          <div class="grow" style="background:var(--paper);box-shadow:var(--sunken)">
            <ul class="files" aria-label="Photos of Snowy"><li class="muted" style="padding:8px">Loading...</li></ul>
          </div>
          <div class="statusbar"><span class="count">…</span><span>${isMobile() ? "tap" : "double-click"} a photo to open it</span></div>
        </div>`;
      const list = body.querySelector(".files");
      loadPhotos().then((photos) => {
        list.replaceChildren();
        body.querySelector(".count").textContent = `${photos.length} object(s)`;
        if (!photos.length) list.innerHTML = `<li class="muted" style="padding:8px">This folder is empty.</li>`;
        photos.forEach((p, i) => {
          const li = document.createElement("li");
          li.innerHTML = `<button type="button" class="icon photo-file" title="${escapeHtml(p.caption || p.name)}">
            <img src="${escapeHtml(p.thumb)}" alt="" width="96" height="64" loading="lazy">
            <span>${escapeHtml(p.name)}<small>${p.width} × ${p.height}</small></span></button>`;
          bindActivate(li.firstElementChild, () => openPhoto(wm, photos, i), list);
          list.append(li);
        });
      });
    },
  };

  const resume = {
    title: "resume.pdf - Viewer",
    icon: icons.resume,
    width: 680,
    height: 560,
    mount(body) {
      body.innerHTML = `
        <div class="fill">
          <div class="resume-toolbar">
            <a class="btn" href="/resume.pdf" target="_blank" rel="noopener">Open in new tab</a>
            <a class="btn" href="/resume.pdf" download>Download</a>
            ${profile.experience?.certificate ? `<a class="btn" href="${escapeHtml(profile.experience.certificate)}" target="_blank" rel="noopener" title="Labsity internship certificate (PDF)">Certificate</a>` : ""}
            ${profile.experience?.verify ? `<a class="btn" href="${escapeHtml(profile.experience.verify)}" target="_blank" rel="noopener" title="Check the certificate on Labsity's verification page">Verify ✓</a>` : ""}
          </div>
          <iframe class="resume-frame" src="/resume.pdf#view=FitH" title="Resume PDF"></iframe>
        </div>`;
    },
  };

  return {
    terminal: { ...createTerminal(config), icon: icons.terminal },
    about,
    projects,
    snowy,
    ask: { ...createChat(config), icon: icons.ask },
    contact: { ...createContact(config), icon: icons.contact },
    resume,
    ...extra,
  };
}

// Desktop / start-menu entries, in display order.
export const launchers = [
  { id: "terminal", label: "Terminal", icon: icons.terminal },
  { id: "about", label: "About Me", icon: icons.about },
  { id: "projects", label: "Projects", icon: icons.projects },
  { id: "snowy", label: "Snowy", icon: icons.photoFolder },
  { id: "ask", label: "Ask Ojas", icon: icons.ask },
  { id: "contact", label: "Contact", icon: icons.contact },
  { id: "resume", label: "Resume", icon: icons.resume },
  { id: "games", label: "Games", icon: icons.games },
  { id: "network", label: "Network", icon: icons.network },
  { id: "cat", label: "Snowy Singh", icon: icons.cat },
];
