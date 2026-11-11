// Contact: mail-style form. All validation is authoritative on the server;
// field errors returned by /api/contact are shown next to each field.
import { api } from "./api.js";
import { identity } from "./identity.js";
import { escapeHtml } from "./wm.js";

export function createContact(config) {
  return {
    title: "New Message",
    icon: null, // filled in by apps.js
    width: 540,
    height: 470,
    mount(body, { wm, win }) {
      body.innerHTML = `
        <form class="fill" novalidate>
          <div class="mail-toolbar">
            <button class="btn" type="submit" title="Send">${SEND_ICON}<span>Send</span></button>
            <button class="btn" type="reset" title="Discard">${TRASH_ICON}<span>Discard</span></button>
            <output class="mail-status" role="status"></output>
          </div>
          <div class="mail-head">
            <label>To:</label><div class="to">${escapeHtml(config.profile.name)} &lt;inbox&gt;</div>
            <label for="mail-name">From:</label><input class="field" id="mail-name" name="name" maxlength="80" placeholder="Your name" autocomplete="name">
            <div class="field-error" data-for="name" hidden></div>
            <label for="mail-email">Reply-To:</label><input class="field" id="mail-email" name="email" type="email" maxlength="254" placeholder="you@example.com" autocomplete="email">
            <div class="field-error" data-for="email" hidden></div>
          </div>
          <div class="hp" aria-hidden="true"><label>Website <input name="website" tabindex="-1" autocomplete="off"></label></div>
          <div class="mail-body">
            <textarea class="field" name="message" maxlength="2000" placeholder="Write your message..." aria-label="Message"></textarea>
            <div class="field-error" data-for="message" hidden></div>
          </div>
          <div class="statusbar"><span class="counter">0 / 2000</span><span>messages are stored in MongoDB</span></div>
        </form>`;

      const form = body.querySelector("form");
      if (identity.name) form.elements.name.value = identity.name; // from the log-on screen
      const status = form.querySelector(".mail-status");
      const sendBtn = form.querySelector('button[type="submit"]');
      const counter = form.querySelector(".counter");

      const setStatus = (text, cls = "") => { status.textContent = text; status.className = `mail-status ${cls}`; };
      const clearErrors = () => {
        form.querySelectorAll(".field-error").forEach((e) => { e.hidden = true; e.textContent = ""; });
        form.querySelectorAll("[aria-invalid]").forEach((e) => e.removeAttribute("aria-invalid"));
      };
      const showErrors = (errors) => {
        let first = null;
        for (const [field, msg] of Object.entries(errors || {})) {
          const input = form.elements[field];
          const slot = form.querySelector(`.field-error[data-for="${field}"]`);
          if (input) { input.setAttribute("aria-invalid", "true"); first ??= input; }
          if (slot) { slot.textContent = msg; slot.hidden = false; }
        }
        first?.focus();
      };

      form.elements.message.addEventListener("input", (e) => { counter.textContent = `${e.target.value.length} / 2000`; });

      form.addEventListener("reset", () => {
        // keep the log-on name after Send / Discard clear the form
        setTimeout(() => { if (identity.name && !form.elements.name.value) form.elements.name.value = identity.name; }, 0);
        clearErrors();
        setStatus("");
        counter.textContent = "0 / 2000";
      });

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        clearErrors();
        sendBtn.disabled = true;
        setStatus("Sending...");
        const payload = Object.fromEntries(["name", "email", "message", "website"].map((k) => [k, form.elements[k].value]));
        const { ok, data } = await api("/api/contact", payload);
        sendBtn.disabled = false;
        if (ok) {
          form.reset();
          setStatus(data.message || "Message sent!", "ok");
        } else {
          setStatus(data?.error || "Could not send the message.", "err");
          showErrors(data?.errors);
        }
      });

      win.el.addEventListener("wm:focus", () => {
        if (!form.contains(document.activeElement)) setTimeout(() => form.elements.name.focus({ preventScroll: true }), 0);
      });
    },
  };
}

const SEND_ICON = `<svg viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><path d="M1 7l14-6-4 14-3-5z" fill="#2f6f73"/><path d="M8 10l7-9-9 7z" fill="#5fa8a0"/><path d="M8 10v4l2-2z" fill="#1c2626"/></svg>`;
const TRASH_ICON = `<svg viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><rect x="3" y="3" width="10" height="2" fill="#1c2626"/><rect x="6" y="1" width="4" height="2" fill="#1c2626"/><rect x="4" y="5" width="8" height="10" fill="#8d9088"/><rect x="6" y="7" width="1" height="6" fill="#1c2626"/><rect x="9" y="7" width="1" height="6" fill="#1c2626"/></svg>`;
