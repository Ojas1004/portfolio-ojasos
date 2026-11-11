// Ask Ojas: chat window backed by the same /api/ask endpoint as the terminal.
import { api } from "./api.js";
import { emit, escapeHtml } from "./wm.js";

const STARTERS = ["What are your skills?", "Tell me about Velinto", "How does this site work?", "How can I contact you?"];

export function createChat(config) {
  return {
    title: "Ask Ojas",
    icon: null, // filled in by apps.js
    width: 460,
    height: 520,
    mount(body, { win }) {
      body.innerHTML = `
        <div class="fill">
          <div class="grow" style="box-shadow:var(--sunken)"><div class="chat-log" aria-live="polite"></div></div>
          <form class="chat-form" autocomplete="off">
            <input class="field" name="q" maxlength="300" placeholder="Ask me something..." aria-label="Your question">
            <button class="btn primary" type="submit">Send</button>
          </form>
          <div class="statusbar"><span>TF-IDF retrieval · scikit-learn · no LLM</span><span>${config.kb?.entries ?? "?"} entries</span></div>
        </div>`;
      const log = body.querySelector(".chat-log");
      const scroller = log.parentElement;
      const form = body.querySelector("form");
      const input = form.elements.q;
      const sendBtn = form.querySelector("button");
      let pending = false;

      const scroll = () => { scroller.scrollTop = scroller.scrollHeight; };

      function addMessage(who, text, { source, score, chips } = {}) {
        const div = document.createElement("div");
        div.className = `msg ${who}`;
        const meta = source ? `<span class="src">source: ${escapeHtml(source)} · match ${Number(score).toFixed(2)}</span>` : "";
        div.innerHTML = `<span class="who">${who === "me" ? "You" : "Ojas"}</span><span class="bubble">${escapeHtml(text)}${meta}</span>`;
        if (chips?.length) {
          const row = document.createElement("div");
          row.className = "chips";
          for (const c of chips) {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "chip";
            b.textContent = c.replace(/^Project: /, "");
            b.addEventListener("click", () => ask(c));
            row.append(b);
          }
          div.append(row);
        }
        log.append(div);
        scroll();
        return div;
      }

      async function ask(question) {
        const q = question.trim();
        if (!q || pending) return;
        pending = true;
        sendBtn.disabled = true;
        addMessage("me", q);
        const typing = addMessage("bot", "");
        typing.classList.add("typing");
        typing.querySelector(".bubble").innerHTML = `<span class="dots">thinking</span>`;

        const started = performance.now();
        const { ok, data } = await api("/api/ask", { question: q, source: "chat" });
        // brief minimum delay so the reply doesn't feel instantaneous/robotic
        await new Promise((r) => setTimeout(r, Math.max(0, 350 - (performance.now() - started))));
        typing.remove();

        if (ok) emit("ask");
        if (ok) addMessage("bot", data.answer, { source: data.source, score: data.score, chips: data.related });
        else addMessage("bot", data?.error || "Something went wrong. Please try again.");
        pending = false;
        sendBtn.disabled = false;
        input.focus();
      }

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const q = input.value;
        input.value = "";
        ask(q);
      });

      addMessage("bot", `Hi! I'm ${config.profile.name.split(" ")[0]}. Ask me about my projects, skills or background. Answers come from a small knowledge base, searched with TF-IDF.`, { chips: STARTERS });
      win.el.addEventListener("wm:focus", () => setTimeout(() => input.focus({ preventScroll: true }), 0));
    },
  };
}
