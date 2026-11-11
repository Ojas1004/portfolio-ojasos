// Cucumber Sweep: a minesweeper-style game. Snowy's kitchen floor hides
// cucumbers (every cat's nemesis). Numbers count the cucumbers next to a tile;
// paw markers flag the ones you've found. The first tile is always safe.
import { SPRITES, observeSize, spriteSVG } from "./kit.js";
import { isMobile } from "../wm.js";

const LEVELS = {
  easy: { cols: 9, rows: 9, mines: 10, label: "Easy · 9×9", size: [400, 580] },
  medium: { cols: 16, rows: 16, mines: 40, label: "Medium · 16×16", size: [560, 720] },
};

const PAW = `<svg viewBox="0 0 10 10" aria-hidden="true"><ellipse cx="5" cy="6.6" rx="2.6" ry="2.1" fill="currentColor"/><circle cx="2" cy="4.1" r="1.1" fill="currentColor"/><circle cx="4" cy="2.4" r="1.1" fill="currentColor"/><circle cx="6" cy="2.4" r="1.1" fill="currentColor"/><circle cx="8" cy="4.1" r="1.1" fill="currentColor"/></svg>`;
const CUCUMBER = `<svg viewBox="0 0 12 12" aria-hidden="true"><g transform="rotate(-38 6 6)"><rect x="0.8" y="3.7" width="10.4" height="4.6" rx="2.3" fill="#3f7a2f" stroke="#1c2626" stroke-width="0.8"/><circle cx="3.4" cy="5.4" r="0.45" fill="#a9d58a"/><circle cx="5.6" cy="6.6" r="0.45" fill="#a9d58a"/><circle cx="7.8" cy="5.3" r="0.45" fill="#a9d58a"/><circle cx="9.4" cy="6.5" r="0.4" fill="#a9d58a"/></g></svg>`;

// Snowy's face on the "new game" button changes with the game.
const face = (eyes, mouth) => {
  const rows = [...SPRITES.face];
  if (eyes) rows[4] = eyes;
  if (mouth) rows[6] = mouth;
  return spriteSVG(rows);
};
const FACES = {
  idle: face(),
  press: face(null, "kwwwwkwwwk"),
  lost: face("kkwkwwkwkk", "kwwwkkwwwk"),
  won: face("kkkkwwkkkk", "kwwkwwkwwk"),
};

export function createSweep({ scores, reward, pad, clock }) {
  return {
    title: "Cucumber Sweep",
    width: LEVELS.easy.size[0],
    height: LEVELS.easy.size[1],
    unmount: (win) => win.cleanup?.(),
    mount(body, { win }) {
      body.innerHTML = `
        <div class="game sweep">
          <div class="game-head"><h3>Cucumber Sweep</h3><small>Snowy's kitchen floor</small></div>
          <div class="game-panel">
            <div class="lcd-box"><small>cucumbers</small><output class="lcd" data-left>000</output></div>
            <button type="button" class="btn game-face" data-new aria-label="New game">${FACES.idle}</button>
            <div class="lcd-box"><small>seconds</small><output class="lcd" data-time>000</output></div>
          </div>
          <div class="game-tools">
            <div class="seg" role="group" aria-label="What a tap does">
              <button type="button" class="btn" data-mode="reveal" aria-pressed="true">Step</button>
              <button type="button" class="btn" data-mode="flag" aria-pressed="false">${PAW}<span>Paw</span></button>
            </div>
            <select class="field game-select" data-level aria-label="Difficulty">
              ${Object.entries(LEVELS).map(([k, l]) => `<option value="${k}">${l.label}</option>`).join("")}
            </select>
          </div>
          <div class="game-stage"><div class="sweep-board" role="grid" aria-label="Kitchen floor"></div></div>
          <p class="game-msg" aria-live="polite"></p>
          <p class="game-hint"></p>
        </div>`;

      const $ = (s) => body.querySelector(s);
      const board = $(".sweep-board");
      const stage = $(".game-stage");
      const faceBtn = $("[data-new]");
      const leftOut = $("[data-left]");
      const timeOut = $("[data-time]");
      const msg = $(".game-msg");
      const levelSel = $("[data-level]");
      $(".game-hint").textContent = isMobile()
        ? "Numbers count nearby cucumbers. Long-press a tile, or switch to Paw, to mark one."
        : "Numbers count nearby cucumbers. Right-click a tile to mark it with a paw.";

      let level = "easy";
      let L = LEVELS[level];
      let cells = [];   // { mine, n, open, flag, boom }
      let status = "ready"; // ready | play | won | lost
      let mode = "reveal";
      let seconds = 0;
      let timer = null;
      let focusIdx = 0;
      let buttons = [];

      const nbrs = (i) => {
        const x = i % L.cols, y = Math.floor(i / L.cols), out = [];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < L.cols && ny < L.rows) out.push(ny * L.cols + nx);
        }
        return out;
      };

      const stopTimer = () => { clearInterval(timer); timer = null; };
      const startTimer = () => {
        stopTimer();
        timer = setInterval(() => {
          // the clock only runs while you can see the game
          if (win.el.classList.contains("is-minimized") || document.hidden) return;
          seconds = Math.min(999, seconds + 1);
          timeOut.textContent = pad(seconds);
        }, 1000);
      };

      function newGame(nextLevel = level) {
        stopTimer();
        level = nextLevel;
        L = LEVELS[level];
        cells = Array.from({ length: L.cols * L.rows }, () => ({ mine: false, n: 0, open: false, flag: false, boom: false }));
        status = "ready";
        seconds = 0;
        focusIdx = Math.min(focusIdx, cells.length - 1);
        timeOut.textContent = pad(0);
        const best = scores.get(`sweep:${level}`);
        msg.textContent = best == null ? "A quiet floor. Pick your first tile." : `A quiet floor. Your best here is ${clock(best)}.`;
        build();
        render();
      }

      function plant(safe) {
        const banned = new Set([safe, ...nbrs(safe)]);
        const pool = cells.map((_, i) => i).filter((i) => !banned.has(i));
        for (let k = 0; k < L.mines; k++) {
          const j = k + Math.floor(Math.random() * (pool.length - k));
          [pool[k], pool[j]] = [pool[j], pool[k]];
          cells[pool[k]].mine = true;
        }
        cells.forEach((c, i) => { c.n = nbrs(i).filter((j) => cells[j].mine).length; });
      }

      function open(i) {
        const stack = [i];
        while (stack.length) {
          const j = stack.pop();
          const c = cells[j];
          if (c.open || c.flag) continue;
          c.open = true;
          if (c.mine) { c.boom = true; return false; }
          if (c.n === 0) for (const k of nbrs(j)) if (!cells[k].open && !cells[k].flag) stack.push(k);
        }
        return true;
      }

      function reveal(i) {
        if (status === "won" || status === "lost") return;
        const c = cells[i];
        if (c.flag) return;
        if (status === "ready") { plant(i); status = "play"; startTimer(); msg.textContent = "Watch your step..."; }
        let safe = true;
        if (c.open) {
          // "chord": a number with all its cucumbers marked opens the rest around it
          const around = nbrs(i);
          if (c.n && around.filter((j) => cells[j].flag).length === c.n) {
            for (const j of around) if (!cells[j].flag && !cells[j].open) safe = open(j) && safe;
          }
        } else safe = open(i);
        if (!safe) lose();
        else checkWin();
        render();
      }

      function flag(i) {
        if (status === "won" || status === "lost" || cells[i].open) return;
        cells[i].flag = !cells[i].flag;
        render();
      }

      function lose() {
        status = "lost";
        stopTimer();
        cells.forEach((c) => { if (c.mine && !c.flag) c.open = true; });
        msg.textContent = "A cucumber! Snowy leapt three feet in the air. Click his face to try again.";
      }

      function checkWin() {
        const closed = cells.filter((c) => !c.open).length;
        if (closed !== L.mines) return;
        status = "won";
        stopTimer();
        cells.forEach((c) => { if (c.mine) c.flag = true; });
        const record = scores.submit(`sweep:${level}`, seconds, true);
        msg.textContent = `Floor cleared in ${clock(seconds)}${record ? ". New best time!" : "."} Snowy approves.`;
        reward(`You cleared the kitchen floor in ${clock(seconds)}. Snowy is very impressed.`, "purr!");
      }

      /* ── view ── */
      function build() {
        board.style.setProperty("--cols", L.cols);
        board.replaceChildren();
        buttons = cells.map((_, i) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "sw-cell";
          b.dataset.i = i;
          b.tabIndex = i === focusIdx ? 0 : -1;
          board.append(b);
          return b;
        });
        fit();
      }

      function render() {
        const flags = cells.filter((c) => c.flag).length;
        leftOut.textContent = pad(L.mines - flags);
        faceBtn.innerHTML = status === "lost" ? FACES.lost : status === "won" ? FACES.won : FACES.idle;
        cells.forEach((c, i) => {
          const b = buttons[i];
          const x = (i % L.cols) + 1, y = Math.floor(i / L.cols) + 1;
          let cls = "sw-cell", html = "", label;
          if (c.open && c.mine) { cls += " open mine" + (c.boom ? " boom" : ""); html = CUCUMBER; label = "cucumber"; }
          else if (c.open) { cls += ` open n${c.n}`; html = c.n || ""; label = c.n ? `${c.n} nearby` : "empty"; }
          else if (c.flag) {
            const wrong = status === "lost" && !c.mine;
            cls += " flag" + (wrong ? " wrong" : ""); html = PAW; label = wrong ? "paw marker, no cucumber here" : "paw marker";
          } else label = "hidden";
          if (b.className !== cls) b.className = cls;
          if (b.innerHTML !== String(html)) b.innerHTML = html;
          b.setAttribute("aria-label", `row ${y}, column ${x}: ${label}`);
        });
      }

      const fit = () => {
        const r = stage.getBoundingClientRect();
        const cell = Math.max(18, Math.min(36, Math.floor(Math.min((r.width - 8) / L.cols, (r.height - 8) / L.rows))));
        board.style.setProperty("--cell", `${cell}px`);
      };
      const unobserve = observeSize(stage, fit);

      const setFocus = (i) => {
        buttons[focusIdx]?.setAttribute("tabindex", "-1");
        focusIdx = i;
        buttons[i].tabIndex = 0;
        buttons[i].focus();
      };

      /* ── input ── */
      const cellOf = (e) => e.target.closest(".sw-cell");
      let longPress = null;
      let suppressClick = false;

      board.addEventListener("click", (e) => {
        const b = cellOf(e);
        if (!b) return;
        if (suppressClick) { suppressClick = false; return; }
        const i = +b.dataset.i;
        focusIdx = i;
        if (mode === "flag" && !cells[i].open) flag(i);
        else reveal(i);
      });
      board.addEventListener("contextmenu", (e) => {
        const b = cellOf(e);
        if (!b) return;
        e.preventDefault();
        const i = +b.dataset.i;
        if (cells[i].open) reveal(i); else flag(i);
      });
      board.addEventListener("pointerdown", (e) => {
        if (status === "ready" || status === "play") faceBtn.innerHTML = FACES.press;
        if (e.pointerType !== "touch" || !cellOf(e)) return;
        const i = +cellOf(e).dataset.i;
        const sx = e.clientX, sy = e.clientY;
        longPress = { timer: setTimeout(() => { suppressClick = true; flag(i); navigator.vibrate?.(15); }, 420), sx, sy };
      });
      const endPress = () => {
        clearTimeout(longPress?.timer);
        longPress = null;
        if (status === "ready" || status === "play") faceBtn.innerHTML = FACES.idle;
      };
      board.addEventListener("pointerup", endPress);
      board.addEventListener("pointercancel", endPress);
      board.addEventListener("pointerleave", endPress);
      board.addEventListener("pointermove", (e) => {
        if (longPress && Math.hypot(e.clientX - longPress.sx, e.clientY - longPress.sy) > 10) endPress();
      });
      board.addEventListener("keydown", (e) => {
        const x = focusIdx % L.cols, y = Math.floor(focusIdx / L.cols);
        const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (moves[e.key]) {
          e.preventDefault();
          const nx = Math.min(L.cols - 1, Math.max(0, x + moves[e.key][0]));
          const ny = Math.min(L.rows - 1, Math.max(0, y + moves[e.key][1]));
          setFocus(ny * L.cols + nx);
        } else if (e.key === "f" || e.key === "F") { e.preventDefault(); flag(focusIdx); buttons[focusIdx].focus(); }
        else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); reveal(focusIdx); buttons[focusIdx].focus(); }
      });

      faceBtn.addEventListener("click", () => newGame());
      $(".seg").addEventListener("click", (e) => {
        const b = e.target.closest("[data-mode]");
        if (!b) return;
        mode = b.dataset.mode;
        body.querySelectorAll("[data-mode]").forEach((m) => m.setAttribute("aria-pressed", String(m === b)));
      });
      levelSel.addEventListener("change", () => {
        const next = LEVELS[levelSel.value];
        // give the bigger board room to breathe if the window is small
        if (!isMobile() && !win.el.classList.contains("is-maximized")) {
          const box = win.el.parentElement.getBoundingClientRect();
          win.el.style.width = `${Math.min(box.width - 16, Math.max(win.el.offsetWidth, next.size[0]))}px`;
          win.el.style.height = `${Math.min(box.height - 16, Math.max(win.el.offsetHeight, next.size[1]))}px`;
          win.el.style.left = `${Math.max(8, Math.min(win.el.offsetLeft, box.width - win.el.offsetWidth - 8))}px`;
          win.el.style.top = `${Math.max(8, Math.min(win.el.offsetTop, box.height - win.el.offsetHeight - 8))}px`;
        }
        newGame(levelSel.value);
      });

      win.cleanup = () => { stopTimer(); unobserve(); };
      newGame();
    },
  };
}
