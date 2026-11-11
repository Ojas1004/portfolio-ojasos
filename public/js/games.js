// Games: a folder of three small games, plus a shortcut to Snowy Singh.
//   Cucumber Sweep - clear the kitchen floor without stepping on a cucumber
//   Yarn Trail     - Snowy unrolls a ball of yarn; eat fish, don't get tangled
//   Box Tower      - stack cardboard boxes as high as you can
// Best scores are a per-visitor convenience, so they live in localStorage.
import { bindActivate } from "./apps.js";
import { icons } from "./icons.js";
import { emit, escapeHtml, isMobile } from "./wm.js";
import { createSweep } from "./games/sweep.js";
import { createYarn } from "./games/yarn.js";
import { createBoxes } from "./games/boxes.js";
import { clock, pad, scores } from "./games/kit.js";

/* ───────── apps ───────── */
export function createGames(cat) {
  /** A game was won or a good score was set: Snowy cheers, and it counts as a hidden fish. */
  const reward = (msg, bubble = "!!") => {
    cat?.cheer?.(msg, bubble);
    emit("game:win");
  };
  const kit = { scores, reward, pad, clock };

  const entries = [
    { id: "sweep", label: "Cucumber Sweep", icon: icons.sweep, note: () => { const b = scores.get("sweep:easy"); return b == null ? "not played yet" : `best ${clock(b)}`; } },
    { id: "yarn", label: "Yarn Trail", icon: icons.yarn, note: () => { const b = scores.get("yarn"); return b == null ? "not played yet" : `best ${b} fish`; } },
    { id: "boxes", label: "Box Tower", icon: icons.boxes, note: () => { const b = scores.get("boxes"); return b == null ? "not played yet" : `best ${b} boxes`; } },
    { id: "cat", label: "Snowy Singh", icon: icons.cat, note: () => "virtual pet" },
  ];

  const folder = {
    title: "Games",
    folder: true, // Snowy hops into this one too
    icon: icons.games,
    width: 520,
    height: 320,
    mount(body, { wm, win }) {
      body.innerHTML = `
        <div class="fill">
          <div class="folder-path"><span>Address</span><code>C:\\OJAS\\GAMES</code></div>
          <div class="grow" style="background:var(--paper);box-shadow:var(--sunken)">
            <ul class="files" aria-label="Games"></ul>
          </div>
          <div class="statusbar"><span>${entries.length} object(s)</span><span></span></div>
        </div>`;
      const list = body.querySelector(".files");
      const notes = entries.map((g) => {
        const li = document.createElement("li");
        li.innerHTML = `<button type="button" class="icon">${g.icon}<span>${escapeHtml(g.label)}<small></small></span></button>`;
        bindActivate(li.firstElementChild, () => wm.open(g.id), list);
        list.append(li);
        return [g, li.querySelector("small")];
      });
      const refresh = () => notes.forEach(([g, small]) => { small.textContent = g.note(); });
      refresh();
      // keep the "best ..." lines current while the folder is open
      document.addEventListener("ojasos:scores", refresh);
      win.cleanup = () => document.removeEventListener("ojasos:scores", refresh);
      body.querySelector(".statusbar span:last-child").textContent = `${isMobile() ? "tap" : "double-click"} a game to play`;
    },
    unmount: (win) => win.cleanup?.(),
  };

  return {
    games: folder,
    sweep: { ...createSweep(kit), icon: icons.sweep },
    yarn: { ...createYarn(kit), icon: icons.yarn },
    boxes: { ...createBoxes(kit), icon: icons.boxes },
  };
}
