// Yarn Trail: a snake-style game. Snowy runs around the rug unrolling a ball
// of yarn behind him. Every fish makes the trail longer (and Snowy faster).
// Bump into the wall or your own yarn and you're tangled.
import { SPRITES, drawSprite, observeSize, sizeCanvas, windowActive } from "./kit.js";
import { isMobile } from "../wm.js";

const COLS = 20;
const ROWS = 15;
const START_MS = 140; // time per step
const MIN_MS = 72;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const KEYS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right" };

export function createYarn({ scores, reward, pad }) {
  return {
    title: "Yarn Trail",
    width: 520,
    height: 560,
    unmount: (win) => win.cleanup?.(),
    mount(body, { win }) {
      body.innerHTML = `
        <div class="game yarn">
          <div class="game-head"><h3>Yarn Trail</h3><small>eat fish · don't get tangled</small></div>
          <div class="game-panel">
            <div class="lcd-box"><small>fish</small><output class="lcd" data-score>000</output></div>
            <button type="button" class="btn" data-pause>Pause</button>
            <div class="lcd-box"><small>best</small><output class="lcd" data-best>000</output></div>
          </div>
          <div class="game-stage" tabindex="0" aria-label="Yarn Trail board. Use the arrow keys to steer.">
            <canvas aria-hidden="true"></canvas>
            <div class="game-overlay">
              <div class="game-card"><h4></h4><p></p><button type="button" class="btn primary" data-start>Start</button></div>
            </div>
          </div>
          <div class="dpad" aria-label="Steering">
            <button type="button" class="btn" data-dir="up" aria-label="Up">▲</button>
            <button type="button" class="btn" data-dir="left" aria-label="Left">◀</button>
            <button type="button" class="btn" data-dir="down" aria-label="Down">▼</button>
            <button type="button" class="btn" data-dir="right" aria-label="Right">▶</button>
          </div>
          <p class="game-hint"></p>
        </div>`;

      const $ = (s) => body.querySelector(s);
      const stage = $(".game-stage");
      const canvas = $("canvas");
      const overlay = $(".game-overlay");
      const scoreOut = $("[data-score]");
      const bestOut = $("[data-best]");
      const pauseBtn = $("[data-pause]");
      $(".game-hint").textContent = isMobile()
        ? "Swipe on the board or use the arrows to steer."
        : "Arrow keys or WASD to steer · Space to pause · Enter to restart";

      let ctx = null;
      let cell = 20;
      let snake, dir, queue, fish, score, stepMs, status, acc, last, raf;

      const best = () => scores.get("yarn") ?? 0;
      bestOut.textContent = pad(best());

      function reset() {
        const y = Math.floor(ROWS / 2);
        snake = [{ x: 6, y }, { x: 5, y }, { x: 4, y }];
        dir = DIRS.right;
        queue = [];
        score = 0;
        stepMs = START_MS;
        acc = 0;
        placeFish();
        scoreOut.textContent = pad(0);
      }

      function placeFish() {
        const free = [];
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (!snake.some((s) => s.x === x && s.y === y)) free.push({ x, y });
        fish = free.length ? free[Math.floor(Math.random() * free.length)] : null;
      }

      function show(title, text, button) {
        overlay.hidden = false;
        overlay.querySelector("h4").textContent = title;
        overlay.querySelector("p").textContent = text;
        overlay.querySelector("button").textContent = button;
      }

      function setStatus(next) {
        status = next;
        pauseBtn.textContent = status === "paused" ? "Resume" : "Pause";
        pauseBtn.disabled = status !== "play" && status !== "paused";
        if (status === "play") {
          overlay.hidden = true;
          last = performance.now();
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(loop);
          stage.focus({ preventScroll: true });
        } else cancelAnimationFrame(raf);
        draw();
      }

      const start = () => { reset(); setStatus("play"); };
      const pause = (why = "Paused") => {
        if (status !== "play") return;
        setStatus("paused");
        show(why, `${score} fish so far. Snowy is waiting.`, "Resume");
      };
      const resume = () => { if (status === "paused") setStatus("play"); };

      function turn(name) {
        if (status === "ready" || status === "over") { start(); }
        if (status === "paused") resume();
        if (status !== "play") return;
        const d = DIRS[name];
        const prev = queue.at(-1) ?? dir;
        if ((d[0] === -prev[0] && d[1] === -prev[1]) || (d[0] === prev[0] && d[1] === prev[1])) return;
        if (queue.length < 3) queue.push(d);
      }

      function step() {
        if (queue.length) dir = queue.shift();
        const head = { x: snake[0].x + dir[0], y: snake[0].y + dir[1] };
        const eating = fish && head.x === fish.x && head.y === fish.y;
        // the tail moves out of the way this step unless we're growing
        const body = eating ? snake : snake.slice(0, -1);
        const wall = head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS;
        if (wall || body.some((s) => s.x === head.x && s.y === head.y)) return gameOver(wall ? "Bonk! Snowy ran into the wall." : "Tangled in his own yarn!");
        snake.unshift(head);
        if (eating) {
          score++;
          scoreOut.textContent = pad(score);
          stepMs = Math.max(MIN_MS, stepMs - 3);
          placeFish();
          if (!fish) return gameOver("The whole rug is yarn. You win!");
        } else snake.pop();
      }

      function gameOver(why) {
        setStatus("over");
        const record = score > 0 && scores.submit("yarn", score);
        bestOut.textContent = pad(best());
        show(why, `${score} fish${record ? " · new best!" : ""}`, "Play again");
        if (score >= 10) reward(`Snowy caught ${score} fish in Yarn Trail. He's very proud.`, "fish!");
      }

      function loop(now) {
        if (status !== "play") return;
        if (!windowActive(win)) return pause();
        acc += Math.min(now - last, 250);
        last = now;
        while (acc >= stepMs && status === "play") { step(); acc -= stepMs; }
        draw();
        if (status === "play") raf = requestAnimationFrame(loop);
      }

      /* ── drawing ── */
      function draw() {
        if (!ctx) return;
        const W = cell * COLS, H = cell * ROWS;
        // rug: soft checks
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
          ctx.fillStyle = (x + y) % 2 ? "#ebe4cf" : "#f3eedd";
          ctx.fillRect(x * cell, y * cell, cell, cell);
        }
        ctx.strokeStyle = "#cfc6ac";
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, W - 2, H - 2);

        if (fish) drawFish(fish.x * cell + cell / 2, fish.y * cell + cell / 2);

        // yarn trail through the segment centres, tail to head
        const pts = snake.map((s) => [s.x * cell + cell / 2, s.y * cell + cell / 2]);
        const path = () => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        path(); ctx.strokeStyle = "#6e2220"; ctx.lineWidth = cell * 0.5; ctx.stroke();
        path(); ctx.strokeStyle = "#d9534f"; ctx.lineWidth = cell * 0.34; ctx.stroke();
        path(); ctx.strokeStyle = "#f29a8f"; ctx.lineWidth = Math.max(1, cell * 0.08);
        ctx.setLineDash([cell * 0.28, cell * 0.22]); ctx.stroke(); ctx.setLineDash([]);

        // Snowy's head leads the way
        const px = (cell * 1.25) / 10;
        const [hx, hy] = pts[0];
        drawSprite(ctx, SPRITES.face, hx - 5 * px, hy - 4.6 * px, px);
      }

      function drawFish(cx, cy) {
        const r = cell * 0.36;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.lineWidth = Math.max(1, cell * 0.07);
        ctx.strokeStyle = "#1c2626";
        ctx.fillStyle = "#5aa9d6";
        ctx.beginPath(); // tail
        ctx.moveTo(r * 0.55, 0); ctx.lineTo(r * 1.25, -r * 0.6); ctx.lineTo(r * 1.25, r * 0.6); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.beginPath(); // body
        ctx.ellipse(-r * 0.15, 0, r * 0.85, r * 0.55, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#1c2626";
        ctx.beginPath(); ctx.arc(-r * 0.55, -r * 0.12, Math.max(1, cell * 0.06), 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      const fit = (w, h) => {
        cell = Math.max(10, Math.floor(Math.min((w - 8) / COLS, (h - 8) / ROWS)));
        ctx = sizeCanvas(canvas, cell * COLS, cell * ROWS);
        draw();
      };
      const unobserve = observeSize(stage, fit);

      /* ── input ── */
      const onKey = (e) => {
        if (e.target.closest("select, input, textarea")) return;
        if (KEYS[e.key]) { e.preventDefault(); turn(KEYS[e.key]); }
        else if (e.key === " " || e.key === "p" || e.key === "P") {
          e.preventDefault();
          if (status === "play") pause(); else if (status === "paused") resume(); else start();
        } else if (e.key === "Enter" && !e.target.closest("button")) { e.preventDefault(); if (status !== "play") status === "paused" ? resume() : start(); }
      };
      win.el.addEventListener("keydown", onKey);
      pauseBtn.addEventListener("click", () => (status === "play" ? pause() : resume()));
      overlay.querySelector("button").addEventListener("click", () => (status === "paused" ? resume() : start()));
      $(".dpad").addEventListener("click", (e) => { const b = e.target.closest("[data-dir]"); if (b) turn(b.dataset.dir); });

      let swipe = null;
      canvas.addEventListener("pointerdown", (e) => { swipe = { x: e.clientX, y: e.clientY }; });
      canvas.addEventListener("pointerup", (e) => {
        if (!swipe) return;
        const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
        swipe = null;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
        turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
      });
      win.el.addEventListener("wm:focus", () => {
        if (!stage.contains(document.activeElement)) setTimeout(() => stage.focus({ preventScroll: true }), 0);
      });

      win.cleanup = () => { cancelAnimationFrame(raf); status = "over"; unobserve(); };
      reset();
      setStatus("ready");
      show("Yarn Trail", "Snowy unrolls the yarn as he runs. Eat fish to grow the trail. Don't hit the walls or the yarn.", "Start");
    },
  };
}
