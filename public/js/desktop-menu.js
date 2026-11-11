// Right-click (or long-press) context menu for the desktop.
//
// items: [{ label, action, checked?: () => bool, disabled?: () => bool, title?: () => string }]

const LONG_PRESS_MS = 550;

export function initDesktopMenu(desktop, items) {
  const menu = document.createElement("div");
  menu.className = "ctx-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Desktop");
  menu.hidden = true;
  document.body.append(menu);
  let returnFocus = null;

  function render() {
    menu.innerHTML = items.map((it, i) => {
      const checkable = typeof it.checked === "function";
      const on = checkable && it.checked();
      const off = it.disabled?.() ?? false;
      return `<button type="button" role="${checkable ? "menuitemcheckbox" : "menuitem"}" data-i="${i}"
        ${checkable ? `aria-checked="${on}"` : ""} ${off ? "disabled" : ""} title="${it.title?.() || ""}">
        <span class="ctx-check" aria-hidden="true">${on ? "&#10003;" : ""}</span>${it.label}</button>`;
    }).join("");
  }

  function open(x, y) {
    returnFocus = document.activeElement;
    render();
    menu.hidden = false;
    const r = menu.getBoundingClientRect();
    const px = Math.min(x, window.innerWidth - r.width - 4);
    const py = Math.min(y, window.innerHeight - r.height - 4);
    menu.style.left = `${Math.max(4, px)}px`;
    menu.style.top = `${Math.max(4, py)}px`;
    menu.querySelector("button:not([disabled])")?.focus();
  }

  function close({ restore = true } = {}) {
    if (menu.hidden) return;
    menu.hidden = true;
    if (restore) returnFocus?.focus?.({ preventScroll: true });
  }

  const onDesktop = (target) => desktop.contains(target) && !target.closest(".window, .cat-walker");

  desktop.addEventListener("contextmenu", (e) => {
    if (!onDesktop(e.target)) return;
    e.preventDefault();
    if (e.clientX === 0 && e.clientY === 0) {
      // opened from the keyboard (ContextMenu key / Shift+F10): place it by the focused element
      const r = (document.activeElement && desktop.contains(document.activeElement) ? document.activeElement : desktop).getBoundingClientRect();
      open(r.left + 20, r.top + 20);
    } else {
      open(e.clientX, e.clientY);
    }
  });

  // long-press for touch screens (iOS doesn't fire contextmenu)
  let pressTimer = 0;
  let start = null;
  let suppressClick = false;
  desktop.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch" || !onDesktop(e.target)) return;
    start = { x: e.clientX, y: e.clientY };
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => { suppressClick = true; open(start.x, start.y); }, LONG_PRESS_MS);
  });
  const cancelPress = () => clearTimeout(pressTimer);
  desktop.addEventListener("pointerup", cancelPress);
  desktop.addEventListener("pointercancel", cancelPress);
  desktop.addEventListener("pointermove", (e) => {
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancelPress();
  });
  desktop.addEventListener("click", (e) => {
    if (suppressClick) { suppressClick = false; e.stopPropagation(); e.preventDefault(); }
  }, true);

  menu.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-i]");
    if (!btn || btn.disabled) return;
    close({ restore: false });
    items[Number(btn.dataset.i)].action();
  });
  menu.addEventListener("contextmenu", (e) => e.preventDefault());
  menu.addEventListener("keydown", (e) => {
    const buttons = [...menu.querySelectorAll("button:not([disabled])")];
    const i = buttons.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); buttons[(i + 1) % buttons.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); buttons[(i - 1 + buttons.length) % buttons.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); buttons[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); buttons.at(-1)?.focus(); }
    else if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); close(); }
  });
  document.addEventListener("pointerdown", (e) => { if (!menu.contains(e.target)) close({ restore: false }); }, true);
  window.addEventListener("blur", () => close({ restore: false }));
  window.addEventListener("resize", () => close({ restore: false }));

  return { open, close };
}
