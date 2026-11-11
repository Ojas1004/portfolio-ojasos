"""Backend tests. MongoDB is replaced by mongomock, so no database is needed.

Run:  pip install -r requirements-dev.txt && pytest
"""

import mongomock
import pytest

import app as app_module
from core import db as db_module
from core.ask import FALLBACK, KnowledgeBase
from core.contact import validate_contact


@pytest.fixture()
def db():
    database = mongomock.MongoClient().ojasos_test
    db_module.set_db(database)
    yield database
    db_module.set_db(None)


@pytest.fixture()
def client(db):
    app_module.app.config.update(TESTING=True)
    return app_module.app.test_client()


# ── pages ───────────────────────────────────────────────────────────────
def test_index_injects_boot_config(client):
    res = client.get("/")
    assert res.status_code == 200
    html = res.get_data(as_text=True)
    assert "window.OJASOS" in html
    assert '"shell"' in html and '"commands"' in html


# ── terminal ────────────────────────────────────────────────────────────
@pytest.mark.parametrize("cmd", ["help", "whoami", "projects", "skills", "contact", "neofetch", "date"])
def test_commands_return_output(client, cmd):
    data = client.post("/api/command", json={"command": cmd}).get_json()
    assert data["ok"] is True
    assert data["output"]


def test_command_is_logged(client, db):
    client.post("/api/command", json={"command": "whoami"})
    doc = db.commands.find_one()
    assert doc["command"] == "whoami"
    assert doc["source"] == "terminal"
    assert doc["timestamp"] is not None


def test_project_details_and_typo_suggestion(client):
    data = client.post("/api/command", json={"command": "projects ozashi"}).get_json()
    assert "Ozashi" in data["output"]
    data = client.post("/api/command", json={"command": "projets"}).get_json()
    assert data["ok"] is False and "Did you mean 'projects'" in data["output"]


def test_actions(client):
    assert client.post("/api/command", json={"command": "clear"}).get_json()["action"] == {"type": "clear"}
    assert client.post("/api/command", json={"command": "open projects"}).get_json()["action"] == {"type": "open", "app": "projects"}
    assert client.post("/api/command", json={"command": "open nope"}).get_json()["ok"] is False


def test_command_rejects_non_string(client):
    assert client.post("/api/command", json={"command": 42}).status_code == 400


def test_command_too_long(client):
    data = client.post("/api/command", json={"command": "echo " + "x" * 300}).get_json()
    assert data["ok"] is False


# ── ask ─────────────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "question, source",
    [
        ("what are your skills?", "Skills overview"),
        ("tell me about velinto", "Project: Velinto"),
        ("what is the labsity coding platform", "Project: Labsity Coding Platform (app.labsity.in)"),
        ("where did you intern", "Experience and internships"),
        ("how can I contact you", "Contact"),
        ("can I see your cv", "Resume and CV"),
        ("what is ozashi", "Project: Ozashi (ozashi.in)"),
    ],
)
def test_ask_finds_right_entry(client, question, source):
    data = client.post("/api/ask", json={"question": question}).get_json()
    assert data["ok"] is True
    assert data["source"] == source
    assert data["score"] >= KnowledgeBase.from_file(app_module.DATA_DIR / "knowledge.json").threshold


def test_ask_fallback_below_threshold(client):
    data = client.post("/api/ask", json={"question": "what is the capital of france"}).get_json()
    assert data["matched"] is False
    assert data["source"] is None
    assert data["answer"] == FALLBACK


def test_ask_validation_and_logging(client, db):
    assert client.post("/api/ask", json={"question": "  "}).status_code == 400
    assert client.post("/api/ask", json={"question": "x" * 301}).status_code == 400
    client.post("/api/ask", json={"question": "skills?", "source": "chat"})
    assert db.commands.find_one({"source": "chat"})["command"] == "ask skills?"


def test_knowledge_base_rejects_bad_entries():
    with pytest.raises(ValueError):
        KnowledgeBase([{"title": "x", "text": ""}])


# ── contact ─────────────────────────────────────────────────────────────
GOOD = {"name": "Ada Lovelace", "email": "ada@example.com", "message": "Hello! Loved the site."}


def test_validate_contact():
    clean, errors = validate_contact(GOOD)
    assert not errors and clean["name"] == "Ada Lovelace"
    _, errors = validate_contact({"name": "", "email": "not-an-email", "message": "hi"})
    assert set(errors) == {"name", "email", "message"}
    _, errors = validate_contact({"name": ["x"], "email": "a@b.co", "message": "1234567890"})
    assert "name" in errors


def test_contact_saves_message(client, db):
    res = client.post("/api/contact", json=GOOD)
    assert res.status_code == 200 and res.get_json()["ok"] is True
    saved = db.messages.find_one()
    assert saved["email"] == "ada@example.com"
    assert "ip_hash" in saved and "127.0.0.1" not in str(saved)  # raw IP never stored


def test_contact_validation_errors(client, db):
    res = client.post("/api/contact", json={"name": "A", "email": "bad", "message": ""})
    assert res.status_code == 400
    assert set(res.get_json()["errors"]) == {"name", "email", "message"}
    assert db.messages.count_documents({}) == 0


def test_contact_honeypot(client, db):
    res = client.post("/api/contact", json={**GOOD, "website": "http://spam.example"})
    assert res.status_code == 200
    assert db.messages.count_documents({}) == 0


def test_contact_rate_limit_per_ip(client, db):
    limit = app_module.CONTACT_LIMIT[0]
    for _ in range(limit):
        assert client.post("/api/contact", json=GOOD).status_code == 200
    blocked = client.post("/api/contact", json=GOOD)
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) > 0
    # a different IP is not affected
    other = client.post("/api/contact", json=GOOD, headers={"X-Real-IP": "203.0.113.9"})
    assert other.status_code == 200


def test_contact_without_database(client):
    db_module.set_db(None)
    res = client.post("/api/contact", json=GOOD)
    assert res.status_code == 503


# ── visitor counter ─────────────────────────────────────────────────────
def test_visit_counter_increments(client):
    assert client.get("/api/visit").get_json()["count"] == 1
    assert client.get("/api/visit").get_json()["count"] == 2
    assert client.get("/api/visit?peek=1").get_json()["count"] == 2
    assert client.get("/api/visit").headers["Cache-Control"] == "no-store"


# ── admin ───────────────────────────────────────────────────────────────
def test_admin_disabled_without_password(client, monkeypatch):
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)
    assert client.get("/admin").status_code == 404


def test_admin_requires_password(client, monkeypatch):
    monkeypatch.setenv("ADMIN_PASSWORD", "s3cret")
    assert client.get("/admin").status_code == 401
    assert client.get("/admin", auth=("admin", "wrong")).status_code == 401
    client.post("/api/contact", json=GOOD)
    client.post("/api/command", json={"command": "whoami"})
    res = client.get("/admin", auth=("admin", "s3cret"))
    assert res.status_code == 200
    html = res.get_data(as_text=True)
    assert "Ada Lovelace" in html and "whoami" in html


def test_api_errors_are_json(client):
    res = client.get("/api/does-not-exist")
    assert res.status_code == 404 and res.get_json()["ok"] is False


# ── Snowy Singh (the cat) ────────────────────────────────────────────────────────
def test_snowy_command_returns_cat_action(client):
    assert client.post("/api/command", json={"command": "snowy"}).get_json()["action"] == {"type": "cat", "op": "status"}
    assert client.post("/api/command", json={"command": "snowy feed"}).get_json()["action"] == {"type": "cat", "op": "feed"}
    bad = client.post("/api/command", json={"command": "snowy dance"}).get_json()
    assert bad["ok"] is False and "usage" in bad["output"]
    assert client.post("/api/command", json={"command": "open cat"}).get_json()["action"] == {"type": "open", "app": "cat"}


def test_open_snowy_folder_and_ask_about_snowy(client):
    assert client.post("/api/command", json={"command": "open snowy"}).get_json()["action"] == {"type": "open", "app": "snowy"}
    assert "snowy/" in client.post("/api/command", json={"command": "ls"}).get_json()["output"]
    data = client.post("/api/ask", json={"question": "do you have a cat?"}).get_json()
    assert data["source"] == "Snowy Singh (my cat)"


# ── games + network monitor ─────────────────────────────────────────────
@pytest.mark.parametrize("app_id", ["games", "sweep", "yarn", "boxes", "network"])
def test_open_new_apps(client, app_id):
    res = client.post("/api/command", json={"command": f"open {app_id}"}).get_json()
    assert res["action"] == {"type": "open", "app": app_id}


def test_health_pings_database(client):
    res = client.get("/api/health")
    data = res.get_json()
    assert res.status_code == 200 and data["ok"] is True and data["db"] == "up"
    assert res.headers["Cache-Control"] == "no-store"


def test_health_without_database(client):
    db_module.set_db(None)
    data = client.get("/api/health").get_json()
    assert data == {"ok": True, "db": "not configured", "region": data["region"]}


def test_server_timing_header(client):
    timing = client.get("/api/visit").headers["Server-Timing"]
    assert timing.startswith("app;dur=") and 'desc="Flask"' in timing


def test_query_timer_counts_commands():
    from types import SimpleNamespace

    timer = db_module.QueryTimer()
    timer.reset()
    timer.succeeded(SimpleNamespace(duration_micros=1500))
    timer.failed(SimpleNamespace(duration_micros=500))
    assert timer.read() == (2, 2.0)
    timer.reset()
    assert timer.read() == (0, 0)


# ── Ask Ojas: suggestion chips and common phrasings ─────────────────────
@pytest.fixture(scope="module")
def real_kb():
    return KnowledgeBase.from_file(app_module.DATA_DIR / "knowledge.json")


def test_every_suggestion_chip_answers_its_own_entry(real_kb):
    # chips send an entry title (shown without the "Project: " prefix); none may hit the fallback
    for title in real_kb.titles:
        for q in (title, title.removeprefix("Project: ")):
            res = real_kb.ask(q)
            assert res["matched"] and res["source"] == title, q


@pytest.mark.parametrize("question,source", [
    ("Who is Ojas", "Who is Ojas"),
    ("who is ojas?", "Who is Ojas"),
    ("Tell me about yourself", "Who is Ojas"),
    ("How does this site work?", "Project: OjasOS (this website)"),
    ("What are your skills?", "Skills overview"),
    ("Tell me about Velinto", "Project: Velinto"),
    ("How can I contact you?", "Contact"),
    ("how does ask ojas work", "How Ask Ojas works"),
])
def test_common_questions(real_kb, question, source):
    assert real_kb.ask(question)["source"] == source


def test_off_topic_still_falls_back(real_kb):
    assert real_kb.ask("what is the weather on mars")["answer"] == FALLBACK


# ── visitor name (log-on screen) in the terminal ────────────────────────
from core.commands import clean_name, login_for  # noqa: E402


def test_neofetch_shows_visitor_name(client, db):
    out = client.post("/api/command", json={"command": "neofetch", "user": "Priya Sharma", "wallpaper": "Neon Harbour Ferry"}).get_json()["output"]
    assert "priya-sharma@ojasos" in out and "Priya Sharma" in out and "Neon Harbour Ferry" in out
    # the name is never stored: only the command text is logged
    assert db.commands.find_one({"command": "neofetch"}).keys() == {"_id", "command", "timestamp", "source"}


def test_neofetch_defaults_to_guest(client):
    out = client.post("/api/command", json={"command": "neofetch"}).get_json()["output"]
    assert "guest@ojasos" in out and "Ocean Sunset (photo: César Couto, Unsplash)" in out
    assert "\n" + " " * 13 + "name" not in out


def test_sudo_uses_login(client):
    out = client.post("/api/command", json={"command": "sudo ls", "user": "Ravi"}).get_json()["output"]
    assert out.startswith("ravi is not in the sudoers file")


def test_names_are_cleaned():
    assert clean_name("  <b>Ojas</b>  Chaudhary!! ") == "bOjasb Chaudhary"
    assert login_for("प्रिया शर्मा") == "प्रिया-शर्मा"  # Devanagari vowel signs survive
    assert login_for("") == login_for("!!!") == "guest"
    assert len(clean_name("x" * 100)) == 24
    assert clean_name(None) == "" and clean_name(123) == "123"
