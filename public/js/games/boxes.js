// Box Tower: a stacking game. A cardboard box slides back and forth; drop it
// on the tower. Whatever hangs over the edge falls off, so the boxes get
// narrower. Drop it dead on for a "perfect" and the box keeps its size.
// Snowy sits on top of the finished tower (every cat loves a box).
import { SPRITES, drawSprite, observeSize, sizeCanvas, windowActive } from "./kit.js";
import { isMobile } from "../wm.js";

const W = 300;        // world width in logical units
const BOX_H = 26;
const BASE_W = 170;
const PERFECT = 4;    // within this many units counts as a perfect drop
const GRAVITY = 1400;
const COLORS = ["#d9b27c", "#cfa36b", "#e0bd8a"];

export function createBoxes({ scores, reward, pad }) {
  return {
    title: "Box Tower",
    width: 440,
    height: 600,
    unmount: (win) => win.cleanup?.(),
    mount(body, { win }) {
      body.innerHTML = `
        <div class="game boxes">
          <div class="game-head"><h3>Box Tower</h3><small>stack it · Snowy sits on top</small></div>
          <div class="game-panel">
            <div class="lcd-box"><small>boxes</small><output class="lcd" data-score>000</output></div>
            <output class="game-callout" aria-live="polite"></output>
            <div class="lcd-box"><small>best</small><output class="lcd" data-best>000</output></div>
          </div>
          <div class="game-stage" tabindex="0" aria-label="Box Tower. Press Space or tap to drop a box.">
            <canvas aria-hidden="true"></canvas>
            <div class="game-overlay">
              <div class="game-card"><h4></h4><p></p><button type="button" class="btn primary" data-start>Start</button></div>
            </div>
          </div>
          <p class="game-hint"></p>
        </div>`;

      const $ = (s) => body.querySelector(s);
      const stage = $(".game-stage");
      const canvas = $("canvas");
      const overlay = $(".game-overlay");
      const scoreOut = $("[data-score]");
      const bestOut = $("[data-best]");
      const callout = $(".game-callout");
      $(".game-hint").textContent = isMobile() ? "Tap the tower to drop a box." : "Click, Space or ↓ to drop a box.";

      let ctx = null, cw = 300, ch = 400, scale = 1;
      let stack, mover, debris, camY, streak, status, last, raf, calloutTimer;

      const best = () => scores.get("boxes") ?? 0;
      bestOut.textContent = pad(best());

      function reset() {
        stack = [{ x: (W - BASE_W) / 2, w: BASE_W, color: COLORS[0] }];
        debris = [];
        camY = 0;
        streak = 0;
        spawn();
        scoreOut.textContent = pad(0);
      }

      function spawn() {
        const top = stack.at(-1);
        const level = stack.length;
        const fromLeft = level % 2 === 1;
        mover = {
          x: fromLeft ? -top.w * 0.2 : W - top.w * 0.8,
          w: top.w,
          dir: fromLeft ? 1 : -1,
          speed: Math.min(330, 125 + level * 9),
          color: COLORS[level % COLORS.length],
        };
      }

      function say(text) {
        callout.textContent = text;
        clearTimeout(calloutTimer);
        calloutTimer = setTimeout(() => { callout.textContent = ""; }, 1100);
      }

      function show(title, text, button) {
        overlay.hidden = false;
        overlay.querySelector("h4").textContent = title;
        overlay.querySelector("p").textContent = text;
        overlay.querySelector("button").textContent = button;
      }

      function setStatus(next) {
        status = next;
        if (status === "play") { overlay.hidden = true; stage.focus({ preventScroll: true }); }
        kick();
      }

      const start = () => { reset(); setStatus("play"); };
      const pause = () => { if (status !== "play") return; setStatus("paused"); show("Paused", `${stack.length - 1} boxes so far.`, "Resume"); };

      function drop() {
        if (status !== "play") return;
        const top = stack.at(-1);
        const m = mover;
        let x = m.x, w = m.w;
        if (Math.abs(m.x - top.x) <= PERFECT) {
          x = top.x;
          streak++;
          // a run of perfect drops wins back a little width
          if (streak >= 3) w = Math.min(BASE_W, w + 6);
          say(streak > 1 ? `Perfect ×${streak}` : "Perfect!");
        } else {
          streak = 0;
          const left = Math.max(m.x, top.x);
          const right = Math.min(m.x + m.w, top.x + top.w);
          const overlap = right - left;
          const yBottom = stack.length * BOX_H;
          if (overlap <= 0) {
            debris.push({ x: m.x, w: m.w, y: yBottom, vy: 0, vr: m.x < top.x ? -2 : 2, r: 0, color: m.color });
            return gameOver();
          }
          // the overhang falls off the side it was hanging over
          const cutX = m.x < top.x ? m.x : right;
          debris.push({ x: cutX, w: m.w - overlap, y: yBottom, vy: 0, vr: m.x < top.x ? -2.5 : 2.5, r: 0, color: m.color });
          x = left;
          w = overlap;
        }
        stack.push({ x, w, color: m.color });
        scoreOut.textContent = pad(stack.length - 1);
        spawn();
        kick();
      }

      function gameOver() {
        setStatus("over");
        const n = stack.length - 1;
        const record = n > 0 && scores.submit("boxes", n);
        bestOut.textContent = pad(best());
        show(n ? `${n} box${n === 1 ? "" : "es"} high` : "Missed!", record ? "New best tower! Snowy climbed right to the top." : "Snowy hopped on top anyway.", "Play again");
        if (n >= 10) reward(`You stacked ${n} boxes. Snowy claimed the top one.`, "my box!");
      }

      /* ── loop: runs while something moves, then sleeps ── */
      function kick() {
        cancelAnimationFrame(raf);
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }

      function loop(now) {
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        if (status === "play" && !windowActive(win)) pause();
        if (status === "play") {
          mover.x += mover.dir * mover.speed * dt;
          const lo = -mover.w * 0.35, hi = W - mover.w * 0.65;
          if (mover.x < lo) { mover.x = lo; mover.dir = 1; }
          if (mover.x > hi) { mover.x = hi; mover.dir = -1; }
        }
        for (const d of debris) { d.vy -= GRAVITY * dt; d.y += d.vy * dt; d.r += d.vr * dt; }
        debris = debris.filter((d) => d.y > camY - 300);
        const viewH = ch / scale;
        const target = Math.max(0, (stack.length + 1) * BOX_H - viewH * 0.55);
        camY += (target - camY) * Math.min(1, dt * 6);
        draw();
        const settling = debris.length || Math.abs(target - camY) > 0.5;
        if (status === "play" || settling) raf = requestAnimationFrame(loop);
      }

      /* ── drawing (world y grows upward; screen y grows down) ── */
      const sy = (worldY) => ch / scale - 18 - (worldY - camY);

      function drawBox(x, yBottom, w, color, r = 0) {
        const top = sy(yBottom + BOX_H);
        ctx.save();
        if (r) { ctx.translate(x + w / 2, top + BOX_H / 2); ctx.rotate(r); ctx.translate(-(x + w / 2), -(top + BOX_H / 2)); }
        ctx.fillStyle = color;
        ctx.fillRect(x, top, w, BOX_H);
        ctx.fillStyle = "rgba(255,255,255,0.28)";
        ctx.fillRect(x, top, w, 4);                      // lit top edge
        ctx.fillStyle = "rgba(90,55,20,0.22)";
        ctx.fillRect(x, top + BOX_H - 4, w, 4);          // shaded bottom
        if (w > 18) {                                    // packing tape
          const tw = Math.min(14, w * 0.18);
          ctx.fillStyle = "#ead7ad";
          ctx.fillRect(x + w / 2 - tw / 2, top, tw, BOX_H * 0.55);
        }
        ctx.strokeStyle = "#5b3d1c";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 0.75, top + 0.75, w - 1.5, BOX_H - 1.5);
        ctx.restore();
      }

      function draw() {
        if (!ctx) return;
        ctx.save();
        ctx.clearRect(0, 0, cw, ch);
        ctx.scale(scale, scale);
        const viewH = ch / scale;
        const g = ctx.createLinearGradient(0, 0, 0, viewH);
        g.addColorStop(0, "#f6f1e2");
        g.addColorStop(1, "#e7dfc8");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, viewH);

        // height marks every 5 boxes
        ctx.font = "16px VT323, monospace";
        ctx.textBaseline = "middle";
        for (let n = 5; n * BOX_H < camY + viewH; n += 5) {
          const y = sy(n * BOX_H);
          if (y < -10) continue;
          ctx.fillStyle = "#c9bf9f";
          ctx.fillRect(4, y, 10, 1);
          ctx.fillStyle = "#9c9278";
          ctx.fillText(String(n), 18, y);
        }

        // floor
        const floor = sy(0);
        ctx.fillStyle = "#b9a983";
        ctx.fillRect(0, floor, W, viewH - floor + 2);
        ctx.fillStyle = "#8f7f5b";
        ctx.fillRect(0, floor, W, 2);

        stack.forEach((b, i) => drawBox(b.x, i * BOX_H, b.w, b.color));
        for (const d of debris) drawBox(d.x, d.y, d.w, d.color, d.r);
        if (status === "play") drawBox(mover.x, stack.length * BOX_H, mover.w, mover.color);
        else {
          // Snowy sits on the top box when the game isn't running
          const top = stack.at(-1);
          const px = 2.2;
          const catW = SPRITES.sit[0].length * px;
          drawSprite(ctx, SPRITES.sit, top.x + top.w / 2 - catW / 2 + 2, sy(stack.length * BOX_H) - SPRITES.sit.length * px, px);
        }
        ctx.restore();
      }

      const fit = (w, h) => {
        cw = Math.max(160, Math.floor(w - 4));
        ch = Math.max(200, Math.floor(h - 4));
        scale = cw / W;
        ctx = sizeCanvas(canvas, cw, ch);
        draw();
      };
      const unobserve = observeSize(stage, fit);

      /* ── input ── */
      canvas.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        if (status === "play") drop();
      });
      win.el.addEventListener("keydown", (e) => {
        if (e.target.closest("select, input, textarea")) return;
        if (e.key === " " || e.key === "ArrowDown") {
          e.preventDefault();
          if (status === "play") drop();
          else if (!e.target.closest("button")) status === "paused" ? setStatus("play") : start();
        } else if ((e.key === "p" || e.key === "P") && status === "play") pause();
        else if (e.key === "Enter" && status !== "play" && !e.target.closest("button")) { e.preventDefault(); status === "paused" ? setStatus("play") : start(); }
      });
      overlay.querySelector("button").addEventListener("click", () => (status === "paused" ? setStatus("play") : start()));
      win.el.addEventListener("wm:focus", () => {
        if (!stage.contains(document.activeElement)) setTimeout(() => stage.focus({ preventScroll: true }), 0);
      });

      win.cleanup = () => { cancelAnimationFrame(raf); clearTimeout(calloutTimer); status = "over"; unobserve(); };
      reset();
      status = "ready";
      show("Box Tower", "Drop each sliding box onto the tower. Overhangs fall off, so aim well. Three perfect drops in a row win back some width.", "Start");
    },
  };
}
