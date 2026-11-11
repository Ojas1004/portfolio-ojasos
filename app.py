"""OjasOS: a desktop-OS style portfolio served by Flask.

Vercel detects the module-level ``app`` object in this file and runs it as a
serverless function. Static assets live in ``public/`` and are served by
Vercel's CDN; Flask only renders the page and handles the ``/api/*`` routes.
"""

import hmac
import json
import logging
import os
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, abort, g, jsonify, render_template, request, send_from_directory
from pymongo import DESCENDING, ReturnDocument
from pymongo.errors import PyMongoError
from werkzeug.exceptions import HTTPException

from core.ask import MAX_QUESTION, KnowledgeBase
from core.commands import Shell
from core.contact import hash_ip, rate_limit, validate_contact
from core.db import get_db, query_timer

BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
DATA_DIR = BASE_DIR / "data"

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("ojasos")

# static_folder=None: Flask never serves /static. Vercel serves public/.
app = Flask(__name__, static_folder=None, template_folder=str(BASE_DIR / "templates"))
app.json.sort_keys = False

# ── loaded once per cold start, reused by warm invocations ──────────────
with open(DATA_DIR / "profile.json", encoding="utf-8") as fh:
    PROFILE = json.load(fh)

# TF-IDF is fitted once here at import time; warm invocations reuse it.
knowledge = KnowledgeBase.from_file(DATA_DIR / "knowledge.json")
shell = Shell(PROFILE, ask=knowledge.ask)

CONTACT_LIMIT = (3, 10 * 60)   # 3 messages per IP per 10 minutes
ADMIN_LIMIT = (10, 15 * 60)    # 10 failed admin logins per IP per 15 minutes


# ── helpers ─────────────────────────────────────────────────────────────
def now_utc():
    return datetime.now(timezone.utc)


def json_body():
    """Parsed JSON object from the request, or {} if missing/invalid."""
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def client_ip():
    """Visitor IP. On Vercel, X-Real-IP / X-Forwarded-For are set by the platform."""
    real = request.headers.get("X-Real-IP", "").strip()
    forwarded = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
    return real or forwarded or request.remote_addr or "unknown"


def no_store(response):
    response.headers["Cache-Control"] = "no-store"
    return response


def log_command(command, source):
    """Store a terminal command / question in MongoDB. Never raises."""
    db = get_db()
    if db is None:
        return
    try:
        db.commands.insert_one({"command": command[:300], "timestamp": now_utc(), "source": source})
    except PyMongoError as exc:
        log.warning("command log failed: %s", exc)


def boot_config():
    """Data the frontend needs at startup, injected into the page as JSON."""
    return {"profile": PROFILE, "shell": shell.completions(), "kb": {"entries": len(knowledge.entries)}}


# ── pages ───────────────────────────────────────────────────────────────
@app.get("/")
def index():
    return render_template("index.html", boot_config=boot_config())


# ── API ─────────────────────────────────────────────────────────────────
@app.post("/api/command")
def api_command():
    body = json_body()
    line = body.get("command", "")
    if not isinstance(line, str):
        return jsonify(ok=False, error="'command' must be a string"), 400
    # name + wallpaper only shape neofetch's output; they are never logged or stored
    user = body.get("user") if isinstance(body.get("user"), str) else ""
    wallpaper = body.get("wallpaper") if isinstance(body.get("wallpaper"), str) else ""
    result = shell.run(line, user=user, wallpaper=wallpaper)
    if line.strip():
        log_command(line.strip(), "terminal")
    return jsonify(result)


@app.post("/api/ask")
def api_ask():
    body = json_body()
    question = body.get("question", "")
    source = body.get("source") if body.get("source") in ("terminal", "chat") else "chat"
    if not isinstance(question, str) or not question.strip():
        return jsonify(ok=False, error="Please type a question."), 400
    if len(question) > MAX_QUESTION:
        return jsonify(ok=False, error=f"Questions can be at most {MAX_QUESTION} characters."), 400
    result = knowledge.ask(question)
    log_command(f"ask {question.strip()}", source)
    return jsonify(ok=True, **result)


@app.post("/api/contact")
def api_contact():
    body = json_body()

    # Honeypot: real visitors never see the "website" field; bots fill it in.
    if body.get("website"):
        return jsonify(ok=True, message="Message sent!")

    data, errors = validate_contact(body)
    if errors:
        return jsonify(ok=False, error="Please fix the highlighted fields.", errors=errors), 400

    db = get_db()
    if db is None:
        return jsonify(ok=False, error="Mail server offline: the database is not configured."), 503

    try:
        allowed, retry_after = rate_limit(db, f"contact:{hash_ip(client_ip())}", *CONTACT_LIMIT)
        if not allowed:
            minutes = max(1, round(retry_after / 60))
            resp = jsonify(ok=False, error=f"Too many messages. Please try again in about {minutes} minute(s).")
            resp.headers["Retry-After"] = str(retry_after)
            return resp, 429
        db.messages.insert_one({
            **data,
            "created_at": now_utc(),
            "ip_hash": hash_ip(client_ip()),
            "user_agent": request.headers.get("User-Agent", "")[:200],
        })
    except PyMongoError as exc:
        log.error("contact save failed: %s", exc)
        return jsonify(ok=False, error="Could not save your message right now. Please try again later."), 503

    return jsonify(ok=True, message=f"Thanks {data['name'].split()[0]}, your message was sent!")


@app.get("/api/health")
def api_health():
    """Round trip to MongoDB, used by the Network Monitor's Ping button."""
    db = get_db()
    region = os.environ.get("VERCEL_REGION", "local")
    if db is None:
        return no_store(jsonify(ok=True, db="not configured", region=region))
    started = time.perf_counter()
    try:
        db.command("ping")
    except PyMongoError as exc:
        log.warning("health ping failed: %s", exc)
        return no_store(jsonify(ok=False, db="down", region=region)), 503
    return no_store(jsonify(ok=True, db="up", db_ms=round((time.perf_counter() - started) * 1000, 1), region=region))


@app.get("/api/visit")
def api_visit():
    """Increment and return the visitor counter. ?peek=1 reads without incrementing."""
    db = get_db()
    if db is None:
        return no_store(jsonify(ok=False, count=None, error="counter offline"))
    try:
        if request.args.get("peek") == "1":
            doc = db.counters.find_one({"_id": "visitors"}) or {"count": 0}
        else:
            doc = db.counters.find_one_and_update(
                {"_id": "visitors"}, {"$inc": {"count": 1}}, upsert=True, return_document=ReturnDocument.AFTER
            )
    except PyMongoError as exc:
        log.warning("visit counter failed: %s", exc)
        return no_store(jsonify(ok=False, count=None, error="counter offline")), 503
    return no_store(jsonify(ok=True, count=int(doc["count"])))


# ── admin ───────────────────────────────────────────────────────────────
def _needs_login():
    resp = app.response_class("Login required", 401, {"WWW-Authenticate": 'Basic realm="OjasOS admin", charset="UTF-8"'})
    return no_store(resp)


@app.get("/admin")
def admin():
    """Read-only dashboard, protected by HTTP Basic auth (any username + ADMIN_PASSWORD)."""
    password = os.environ.get("ADMIN_PASSWORD", "")
    if not password:
        abort(404)  # admin disabled unless a password is configured

    db = get_db()
    auth = request.authorization
    supplied = (auth.password or "") if auth else ""
    if not hmac.compare_digest(supplied.encode(), password.encode()):
        if auth and db is not None:
            try:  # slow down password guessing
                allowed, retry_after = rate_limit(db, f"admin:{hash_ip(client_ip())}", *ADMIN_LIMIT)
                if not allowed:
                    resp = app.response_class("Too many attempts", 429, {"Retry-After": str(retry_after)})
                    return no_store(resp)
            except PyMongoError:
                pass
        return _needs_login()

    ctx = {"db_ok": False, "visitors": 0, "message_count": 0, "command_count": 0,
           "messages": [], "commands": [], "top_commands": []}
    if db is not None:
        try:
            ctx["visitors"] = (db.counters.find_one({"_id": "visitors"}) or {}).get("count", 0)
            ctx["message_count"] = db.messages.count_documents({})
            ctx["command_count"] = db.commands.count_documents({})
            ctx["messages"] = list(db.messages.find({}, {"ip_hash": 0}).sort("created_at", DESCENDING).limit(50))
            ctx["commands"] = list(db.commands.find().sort("timestamp", DESCENDING).limit(100))
            recent = db.commands.find({}, {"command": 1}).sort("timestamp", DESCENDING).limit(500)
            ctx["top_commands"] = Counter(c["command"].split()[0].lower() for c in recent if c.get("command")).most_common(6)
            ctx["db_ok"] = True
        except PyMongoError as exc:
            log.error("admin query failed: %s", exc)
    resp = app.make_response(render_template("admin.html", **ctx))
    resp.headers["X-Robots-Tag"] = "noindex"
    return no_store(resp)


@app.before_request
def start_timer():
    g.started = time.perf_counter()
    query_timer.reset()


@app.after_request
def server_timing(resp):
    """Server-Timing lets the browser (and the Network Monitor) see where time went."""
    if "started" in g:
        total = (time.perf_counter() - g.started) * 1000
        parts = [f'app;dur={total:.1f};desc="Flask"']
        count, db_ms = query_timer.read()
        if count:
            parts.append(f'db;dur={db_ms:.1f};desc="MongoDB, {count} quer{"y" if count == 1 else "ies"}"')
        resp.headers["Server-Timing"] = ", ".join(parts)
    return resp


@app.after_request
def security_headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    resp.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    return resp


@app.errorhandler(HTTPException)
def http_error(exc):
    """JSON errors for /api/*, normal HTML error pages elsewhere."""
    if request.path.startswith("/api/"):
        return jsonify(ok=False, error=exc.description), exc.code
    return exc


@app.errorhandler(Exception)
def server_error(exc):
    log.exception("unhandled error")
    if request.path.startswith("/api/"):
        return jsonify(ok=False, error="Internal server error"), 500
    return "Internal server error", 500


# Local development only (`flask run`). On Vercel the CDN serves public/
# before requests ever reach this function, so the route is not registered.
if not os.environ.get("VERCEL"):

    @app.get("/<path:filename>")
    def public_file(filename):
        return send_from_directory(PUBLIC_DIR, filename)
