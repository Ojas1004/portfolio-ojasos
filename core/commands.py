"""The OjasOS terminal ("ojsh") command interpreter.

``run(line)`` parses one command line and returns a JSON-serialisable dict:
    {"ok": bool, "output": str, "action": dict | None}
``action`` tells the frontend to do something visual, e.g.
    {"type": "open", "app": "projects"}, {"type": "clear"}, {"type": "close"}.
"""

import difflib
import platform
import re
import shlex
import time
import unicodedata
from contextvars import ContextVar
from datetime import datetime, timezone
from importlib.metadata import version

MAX_LINE = 200
MAX_NAME = 24

# Who is typing, for this request only (the Shell object is shared between requests).
# Set by run(); read by neofetch and sudo. Nothing here is stored anywhere.
_session = ContextVar("ojsh_session", default={})


def _wordy(ch):
    """Letter, combining mark (e.g. Devanagari vowel signs) or number."""
    return unicodedata.category(ch)[0] in "LMN"


def clean_name(raw):
    """Same rules as identity.js: letters and marks (any script), digits, spaces and . _ - ; max 24 chars."""
    text = unicodedata.normalize("NFC", str(raw or ""))
    text = "".join(ch for ch in text if _wordy(ch) or ch in " ._-")
    return " ".join(text.split())[:MAX_NAME].strip()


def login_for(name):
    """'Priya Sharma' -> 'priya-sharma'; empty -> 'guest'."""
    login = clean_name(name).lower().replace(" ", "-")
    login = "".join(ch for ch in login if _wordy(ch) or ch in "._-")[:16]
    return login or "guest"


WALLPAPER_CREDITS = {"Ocean Sunset": "Ocean Sunset (photo: César Couto, Unsplash)"}
APPS = {
    "terminal": "Terminal",
    "about": "About Me",
    "projects": "Projects",
    "ask": "Ask Ojas",
    "contact": "Contact",
    "resume": "Resume",
    "snowy": "Snowy (photo folder)",
    "cat": "Snowy Singh",
    "notes": "My Notes",
    "welcome": "Welcome.txt",
    "display": "Display Properties",
    "games": "Games",
    "sweep": "Cucumber Sweep",
    "yarn": "Yarn Trail",
    "boxes": "Box Tower",
    "network": "Network Monitor",
}
CAT_OPS = ["status", "feed", "play", "pet", "sleep", "wake"]
_STARTED = time.time()  # module import time = serverless cold start


def _pad(rows, gap=2):
    """Left-align the first column of (key, value) rows."""
    width = max((len(k) for k, _ in rows), default=0) + gap
    return "\n".join(f"  {k.ljust(width)}{v}" for k, v in rows)


def _result(output="", action=None, ok=True):
    return {"ok": ok, "output": output, "action": action}


class Shell:
    def __init__(self, profile, ask=None):
        """
        profile: dict loaded from data/profile.json
        ask:     optional callable(question) -> dict with "answer" and "source",
                 used when `ask` is sent to /api/command instead of /api/ask.
        """
        self.profile = profile
        self.ask_fn = ask
        self.projects = {p["id"]: p for p in profile["projects"]}
        # name -> (usage, description, handler)
        self.commands = {
            "help": ("help", "list available commands", self.cmd_help),
            "whoami": ("whoami", "who is Ojas?", self.cmd_whoami),
            "projects": ("projects [name]", "list projects, or show one", self.cmd_projects),
            "skills": ("skills", "languages, frameworks and tools", self.cmd_skills),
            "contact": ("contact", "how to reach me", self.cmd_contact),
            "ask": ("ask <question>", "ask me anything (TF-IDF search)", self.cmd_ask),
            "open": ("open <app>", "launch a desktop app", self.cmd_open),
            "resume": ("resume", "open my resume", lambda a: self.cmd_open(["resume"])),
            "snowy": ("snowy [feed|play|pet|sleep|wake]", "check on Snowy Singh, the desktop cat", self.cmd_snowy),
            "neofetch": ("neofetch", "system information", self.cmd_neofetch),
            "date": ("date", "print server date and time (UTC)", self.cmd_date),
            "echo": ("echo <text>", "print text", lambda a: _result(" ".join(a))),
            "clear": ("clear", "clear the screen", lambda a: _result(action={"type": "clear"})),
            "exit": ("exit", "close the terminal", lambda a: _result("logout", action={"type": "close"})),
        }
        self.hidden = {"sudo": self.cmd_sudo, "ls": self.cmd_ls, "cat": self.cmd_cat, "rm": self.cmd_rm}

    # ── public API ──────────────────────────────────────────────
    def completions(self):
        """Command names and argument candidates for frontend tab completion."""
        return {
            "commands": [{"name": n, "usage": u, "desc": d} for n, (u, d, _) in self.commands.items()],
            "args": {"open": list(APPS), "projects": list(self.projects), "cat": [f"{p}.txt" for p in self.projects], "snowy": CAT_OPS},
        }

    def run(self, line, user=None, wallpaper=None):
        """Run one command line. ``user`` / ``wallpaper`` come from the visitor's browser (for neofetch)."""
        wall = "".join(ch for ch in str(wallpaper or "") if ch.isprintable()).strip()[:40]
        token = _session.set({"name": clean_name(user), "wallpaper": wall})
        try:
            return self._run(line)
        finally:
            _session.reset(token)

    def _run(self, line):
        line = "".join(ch for ch in str(line) if ch.isprintable()).strip()
        if not line:
            return _result()
        if len(line) > MAX_LINE:
            return _result(f"ojsh: input too long (max {MAX_LINE} characters)", ok=False)
        try:
            parts = shlex.split(line)
        except ValueError:  # unbalanced quotes
            parts = line.split()
        name, args = parts[0].lower(), parts[1:]

        if name in self.commands:
            return self.commands[name][2](args)
        if name in self.hidden:
            return self.hidden[name](args)

        guess = difflib.get_close_matches(name, self.commands, n=1, cutoff=0.6)
        hint = f" Did you mean '{guess[0]}'?" if guess else " Type 'help' to see what I understand."
        return _result(f"ojsh: command not found: {name}.{hint}", ok=False)

    # ── commands ────────────────────────────────────────────────
    def cmd_help(self, args):
        rows = [(u, d) for u, d, _ in self.commands.values()]
        return _result("Available commands:\n" + _pad(rows) + "\n\nTip: use Tab to complete and the up arrow for history.")

    def cmd_whoami(self, args):
        p = self.profile
        about = "\n\n".join(p["about"][:3])
        return _result(f"{p['name']}\n{p['role']}\n{p['location']}\n\n{about}\n\nTry 'projects', 'skills' or 'ask <question>'.")

    def cmd_projects(self, args):
        if not args:
            rows = [(p["id"], p["tagline"]) for p in self.projects.values()]
            return _result("~/projects\n" + _pad(rows) + "\n\nType 'projects <name>' for details, or 'open projects'.")
        key = args[0].lower().removesuffix(".txt")
        project = self.projects.get(key)
        if not project:
            guess = difflib.get_close_matches(key, self.projects, n=1, cutoff=0.5)
            hint = f" Did you mean '{guess[0]}'?" if guess else ""
            return _result(f"projects: no such project: {key}.{hint}", ok=False)
        highlights = "".join(f"  - {h}\n" for h in project.get("highlights", []))
        built_at = f"\nbuilt at: {project['org']}" if project.get("org") else ""
        return _result(
            f"{project['name']} ({project['year']}, {project['status']})\n"
            f"{project['tagline']}\n\n{project['description']}\n\n"
            + (f"highlights:\n{highlights}\n" if highlights else "")
            + f"stack: {', '.join(project['stack'])}\nlink:  {project.get('link') or '-'}{built_at}"
        )

    def cmd_skills(self, args):
        rows = [(group, ", ".join(items)) for group, items in self.profile["skills"].items()]
        return _result("Skills\n" + _pad(rows, gap=3))

    def cmd_contact(self, args):
        p = self.profile
        rows = [("email", p["email"])] + [(k, v) for k, v in p["links"].items()]
        return _result(_pad(rows) + "\n\nOr type 'open contact' to send me a message from here.")

    def cmd_ask(self, args):
        question = " ".join(args).strip()
        if not question:
            return _result("usage: ask <question>   e.g. ask what are your skills?", ok=False)
        if self.ask_fn is None:
            return _result("ask: the Q&A engine is offline.", ok=False)
        res = self.ask_fn(question)
        source = f"\n\n(source: {res['source']})" if res.get("source") else ""
        return _result(res["answer"] + source)

    def cmd_open(self, args):
        if not args:
            return _result("usage: open <app>\napps: " + ", ".join(APPS), ok=False)
        app = args[0].lower()
        if app not in APPS:
            return _result(f"open: unknown app '{app}'. Apps: {', '.join(APPS)}", ok=False)
        return _result(f"launching {APPS[app]}...", action={"type": "open", "app": app})

    def cmd_snowy(self, args):
        """The cat lives in the visitor's browser, so the frontend performs the action."""
        op = args[0].lower() if args else "status"
        if op not in CAT_OPS:
            return _result(f"usage: snowy [{'|'.join(CAT_OPS)}]", ok=False)
        return _result(action={"type": "cat", "op": op})

    def cmd_neofetch(self, args):
        uptime = int(time.time() - _STARTED)
        session = _session.get()
        name = session.get("name", "")
        wallpaper = session.get("wallpaper") or "Ocean Sunset"
        info = [("user", f"{login_for(name)}@ojasos")]
        if name:
            info.append(("name", name))
        info += [
            ("os", "OjasOS 1.0 (retro edition)"),
            ("kernel", f"Flask {version('flask')} / Python {platform.python_version()}"),
            ("search", f"scikit-learn {version('scikit-learn')} TF-IDF"),
            ("storage", "MongoDB Atlas"),
            ("uptime", f"{uptime // 60}m {uptime % 60}s since cold start"),
            ("shell", "ojsh"),
            ("wallpaper", WALLPAPER_CREDITS.get(wallpaper, wallpaper)),
            ("projects", str(len(self.projects))),
        ]
        logo = ["  .----.  ", " / .--. \\ ", "| |    | |", "| |    | |", " \\ '--' / ", "  '----'  ", "", ""]
        width = max(len(k) for k, _ in info)
        logo_w = max(map(len, logo))
        lines = [
            f"{(logo[i] if i < len(logo) else '').ljust(logo_w)}   {k.ljust(width)}  {v}" for i, (k, v) in enumerate(info)
        ]
        return _result("\n".join(lines))

    def cmd_date(self, args):
        return _result(datetime.now(timezone.utc).strftime("%a %d %b %Y %H:%M:%S UTC"))

    # ── easter eggs (not listed in help) ────────────────────────
    def cmd_sudo(self, args):
        login = login_for(_session.get().get("name"))
        return _result(f"{login} is not in the sudoers file. This incident will be reported.", ok=False)

    def cmd_ls(self, args):
        files = ["snowy/"] + [f"{p}.txt" for p in self.projects] + ["about_me.txt", "resume.pdf"]
        return _result("  ".join(files))

    def cmd_cat(self, args):
        if not args:
            return _result("usage: cat <file>", ok=False)
        name = args[0].lower()
        if name in ("about_me.txt", "about.txt"):
            return _result("\n\n".join(self.profile["about"]))
        if name.removesuffix(".txt") in self.projects:
            return self.cmd_projects([name])
        return _result(f"cat: {name}: No such file", ok=False)

    def cmd_rm(self, args):
        return _result("rm: permission denied. Nice try though.", ok=False)
