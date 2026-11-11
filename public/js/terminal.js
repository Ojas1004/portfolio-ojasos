// Terminal app: talks to /api/command and /api/ask.
import { api } from "./api.js";
import { identity } from "./identity.js";
import { emit, escapeHtml } from "./wm.js";

const promptHtml = () => `<span class="term-prompt">${escapeHtml(identity.login)}@ojasos:<b>~</b>$</span>`;
const HISTORY_KEY = "ojasos:history";
const HISTORY_MAX = 50;

const loadHistory = () => {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
};
const saveHistory = (h) => {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-HISTORY_MAX))); } catch { /* storage blocked */ }
};

/** Escape text, then turn URLs and e-mail addresses into links. */
function linkify(text) {
  return escapeHtml(text)
    .replace(/https?:\/\/[^\s<]+[^\s<.,;:)'"]/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`)
    .replace(/(^|[\s(])([\w.+-]+@[\w-]+\.[\w.-]+\w)/g, (_, pre, m) => `${pre}<a href="mailto:${m}">${m}</a>`);
}

const commonPrefix = (words) =>
  words.reduce((pre, w) => { while (!w.startsWith(pre)) pre = pre.slice(0, -1); return pre; });

export function createTerminal(config) {
  const shell = config.shell || { commands: [], args: {} };
  const names = shell.commands.map((c) => c.name);

  return {
    title: "Terminal - ojsh",
    icon: null, // filled in by apps.js
    width: 700,
    height: 440,
    bodyClass: "term-wrap",
    mount(body, { wm, win }) {
      body.innerHTML = `
        <div class="term" role="log" aria-live="polite">
          <div class="term-scroll"></div>
          <label class="term-line">
            ${promptHtml()}
            <input class="term-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Terminal input">
          </label>
        </div>`;
      const term = body.querySelector(".term");
      const scroll = body.querySelector(".term-scroll");
      const line = body.querySelector(".term-line");
      const input = body.querySelector(".term-input");

      const history = loadHistory();
      let histIdx = history.length;
      let draft = "";
      let busy = false;
      let skipTyping = null; // set while an animation runs; calling it finishes instantly

      const toBottom = () => { term.scrollTop = term.scrollHeight; };
      const focusInput = () => { if (!busy) input.focus({ preventScroll: true }); };

      const echo = (cmd) => {
        const div = document.createElement("div");
        div.className = "term-line";
        div.innerHTML = `${promptHtml()}<span class="cmd-echo">${escapeHtml(cmd)}</span>`;
        scroll.append(div);
      };

      /** Type text out character by character (max ~0.7 s total). */
      const typeOut = (text, cls = "") =>
        new Promise((resolve) => {
          const pre = document.createElement("pre");
          pre.className = `term-out ${cls}`;
          scroll.append(pre);
          if (!text) { pre.remove(); resolve(); return; }
          const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          const perFrame = reduce ? text.length : Math.max(2, Math.ceil(text.length / 42));
          let i = 0;
          const finish = () => {
            pre.innerHTML = linkify(text);
            skipTyping = null;
            toBottom();
            resolve();
          };
          skipTyping = () => { i = text.length; };
          const frame = () => {
            i = Math.min(text.length, i + perFrame);
            pre.textContent = text.slice(0, i);
            toBottom();
            if (i < text.length) requestAnimationFrame(frame);
            else finish();
          };
          frame();
        });

      const setBusy = (b) => {
        busy = b;
        line.hidden = b;
        if (!b) { toBottom(); focusInput(); }
      };

      async function execute(raw) {
        const cmd = raw.trim();
        echo(raw);
        if (!cmd) return;
        if (history[history.length - 1] !== cmd) history.push(cmd);
        saveHistory(history);
        histIdx = history.length;

        setBusy(true);
        const [head, ...rest] = cmd.split(/\s+/);
        let output = "";
        let cls = "";
        let action = null;

        if (head.toLowerCase() === "ask") {
          const question = rest.join(" ");
          if (!question) {
            output = "usage: ask <question>   e.g. ask what are your skills?";
            cls = "err";
          } else {
            const { ok, data } = await api("/api/ask", { question, source: "terminal" });
            if (ok) output = data.answer + (data.source ? `\n\n(source: ${data.source})` : "");
            else { output = data?.error || "ask: request failed"; cls = "err"; }
          }
        } else {
          // the visitor's name and wallpaper only feed neofetch's output; the server doesn't store them
          const { ok, data } = await api("/api/command", {
            command: cmd,
            user: identity.name || "",
            wallpaper: window.ojasos?.backgrounds?.label || "",
          });
          if (ok && data) {
            output = data.output;
            action = data.action;
            if (!data.ok) cls = "err";
          } else {
            output = data?.error || "ojsh: request failed";
            cls = "err";
          }
        }

        if (action?.type === "cat") output = window.ojasos?.cat?.command(action.op) ?? "Snowy is not around right now.";
        if (action?.type === "clear") scroll.replaceChildren();
        await typeOut(output, cls);
        if (action?.type === "open") wm.open(action.app);
        emit(`cmd:${head.toLowerCase()}`);
        if (action?.type === "close") { setTimeout(() => wm.close(win.id), 250); return; }
        setBusy(false);
      }

      function complete() {
        const value = input.value;
        const parts = value.replace(/^\s+/, "").split(/\s+/);
        let candidates;
        let prefix;
        if (parts.length <= 1) {
          prefix = parts[0] || "";
          candidates = names.filter((n) => n.startsWith(prefix.toLowerCase()));
        } else if (parts.length === 2 && shell.args[parts[0].toLowerCase()]) {
          prefix = parts[1];
          candidates = shell.args[parts[0].toLowerCase()].filter((a) => a.startsWith(prefix.toLowerCase()));
        } else {
          return;
        }
        if (!candidates.length) return;
        const head = parts.length > 1 ? `${parts[0]} ` : "";
        if (candidates.length === 1) {
          input.value = `${head}${candidates[0]} `;
          return;
        }
        const shared = commonPrefix(candidates);
        if (shared.length > prefix.length) {
          input.value = head + shared;
        } else {
          echo(value);
          const pre = document.createElement("pre");
          pre.className = "term-out";
          pre.textContent = candidates.join("    ");
          scroll.append(pre);
          toBottom();
        }
      }

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const value = input.value;
          input.value = "";
          execute(value);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          if (histIdx === history.length) draft = input.value;
          if (histIdx > 0) input.value = history[--histIdx];
          requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          if (histIdx < history.length) {
            histIdx++;
            input.value = histIdx === history.length ? draft : history[histIdx];
          }
        } else if (e.key === "Tab") {
          e.preventDefault();
          complete();
        } else if (e.key === "l" && e.ctrlKey) {
          e.preventDefault();
          scroll.replaceChildren();
        } else if (e.key === "c" && e.ctrlKey && input.selectionStart === input.selectionEnd) {
          // Ctrl+C with no selection cancels the line (with a selection it copies)
          e.preventDefault();
          echo(`${input.value}^C`);
          input.value = "";
          histIdx = history.length;
        }
      });

      // any key while output is typing skips the animation
      term.addEventListener("keydown", () => skipTyping?.());
      term.tabIndex = -1;
      term.addEventListener("click", () => {
        skipTyping?.();
        if (!window.getSelection()?.toString()) focusInput();
      });
      win.el.addEventListener("wm:focus", () => setTimeout(focusInput, 0));

      // welcome banner
      setBusy(true);
      typeOut(
        `OjasOS 1.0 (ojsh)\n` +
        `Welcome, ${identity.name || "guest"}. I'm ${config.profile.name}'s portfolio.\n` +
        `Type 'help' to list commands, or try: whoami · projects · ask what do you work on?`,
      ).then(() => setBusy(false));

      win.runCommand = (cmd) => { if (!busy) execute(cmd); };
    },
  };
}
