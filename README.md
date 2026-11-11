# OjasOS

**A portfolio that boots like a tiny retro operating system.**

OjasOS is my personal portfolio, built to look and feel like a small desktop OS. It has a boot screen, desktop icons, draggable windows, a taskbar with a Start menu, a working terminal and a cat who lives on the taskbar. The backend is real Python: **Flask**, **scikit-learn** and **MongoDB Atlas**, deployed as a **Vercel** serverless function.

![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3-000000?logo=flask&logoColor=white)
![scikit-learn](https://img.shields.io/badge/scikit--learn-TF--IDF-F7931E?logo=scikitlearn&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)
![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-000000?logo=vercel&logoColor=white)
![Tests](https://img.shields.io/badge/tests-pytest-0A9EDC?logo=pytest&logoColor=white)

### **[▶ Live demo: ojaschaudhary.vercel.app](https://ojaschaudhary.vercel.app/)**

<!-- Add a screenshot or GIF here, e.g.:
![OjasOS desktop](docs/screenshot.png)
-->

---

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [How the Python parts work](#how-the-python-parts-work)
- [API](#api)
- [Project structure](#project-structure)
- [Run locally](#run-locally)
- [Deploy to Vercel](#deploy-to-vercel)
- [Make it yours](#make-it-yours)
- [Credits](#credits)

---

## Features

| App | What it does | Backend |
| --- | --- | --- |
| **Terminal** | `help`, `whoami`, `projects [name]`, `skills`, `contact`, `ask <question>`, `open <app>`, `resume`, `snowy`, `neofetch`, `date`, `echo`, `clear`, `exit`, plus a few hidden ones. Has ↑ history, Tab completion, typed output and "did you mean…?" suggestions | `POST /api/command` (each command is logged to MongoDB) |
| **About Me** | Notepad-style bio | `data/profile.json` |
| **Projects** | A folder of project files. Double-click one to open its details | `data/profile.json` |
| **Ask Ojas** | A chat window that answers questions about me | `POST /api/ask`: TF-IDF retrieval with scikit-learn, no LLM |
| **Contact** | Mail-style form | `POST /api/contact`: server-side validation, per-IP rate limit, honeypot |
| **Resume** | PDF viewer for `public/resume.pdf` | Vercel CDN |
| **Games** | Three small games: *Cucumber Sweep*, *Yarn Trail* and *Box Tower*. Best scores are saved in the browser | client-side |
| **Network Monitor** | A live inspector for the page's real requests. Shows headers, response bodies, timing phases and the Flask/MongoDB time read from `Server-Timing`, plus a Ping button | `GET /api/health` |
| **Snowy Singh** | A white cat with a pink nose who wanders along the taskbar. Click him for Fullness / Happiness / Energy meters and Feed / Play / Sleep buttons. Five fish are hidden around OjasOS for you to find | `snowy [feed\|play\|pet\|sleep\|wake]` in the terminal |
| **Snowy** folder | A photo viewer with Snowy's pictures | `public/img/snowy/` |
| **Notes** | Right-click the desktop and choose *New note*. Notes autosave in your browser | client-side |
| **Backgrounds** | Animated halftone wallpapers, solid colours, or your own photo turned into halftone dots. Your photo never leaves your browser | client-side |
| Tray | Clock and visitor counter | `GET /api/visit` (atomic `$inc`) |
| `/admin` | Inbox, recent commands and the most-used commands | HTTP Basic auth with `ADMIN_PASSWORD` |

**Touch edition:** on screens narrower than 768px the desktop becomes an icon grid. Apps open full-screen with a single tap. Desktop visitors can turn this mode on from the right-click menu.

## Tech stack

- **Backend:** Python 3.12, Flask 3, PyMongo, scikit-learn, NumPy
- **Database:** MongoDB Atlas. For local development you can use [mongomock](https://github.com/mongomock/mongomock) instead
- **Frontend:** plain HTML, CSS and ES modules. There is no framework and no build step
- **Hosting:** Vercel. Flask runs as a Python function and `public/` is served from the CDN
- **Tooling:** pytest + mongomock for tests, and Pillow + NumPy for asset generation

## How the Python parts work

- **`core/ask.py`: retrieval Q&A.** `data/knowledge.json` is a list of `{title, text}` entries. When the app starts, it fits a `TfidfVectorizer` over them once, and warm invocations reuse that fit. The analyzer lowercases text, maps synonyms (`cv` → `resume`), drops stop words, strips plurals and adds bigrams. A question is vectorized with the same vocabulary and compared to every entry by cosine similarity. The best match is returned with its `source` and `score`. If the score is below `0.1`, the answer is a polite "I don't know" instead of a wrong guess.
- **`core/commands.py`: the shell.** A command table maps names to handlers. Input is parsed with `shlex`, and `difflib` suggests the closest command when you make a typo. Commands such as `open`, `clear` and `exit` return an `action` that the frontend carries out.
- **`core/contact.py`: validation and rate limiting.** Fields are validated on the server (type, length, email format). The rate limiter is a fixed-window counter stored in MongoDB. Each IP-and-window pair is a document that is incremented atomically with `find_one_and_update(upsert=True)`, and a TTL index deletes old windows. Raw IPs are never stored. Only a salted SHA-256 hash is kept.
- **`core/db.py`: database access.** A lazily created, module-level `MongoClient` is reused across warm invocations. A query timer feeds the `Server-Timing` header. If `MONGODB_URI` is missing, the site still works and the database-backed features say they are offline.
- **`app.py`: the Flask app.** It contains the routes, security headers, JSON error handlers for `/api/*`, and `Server-Timing` (`app;dur=…`, `db;dur=…`) on every response.

## API

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/` | The OS page. Boot config is injected as JSON |
| `POST` | `/api/command` | `{ "command": "projects" }` → terminal output and an optional `action` |
| `POST` | `/api/ask` | `{ "question": "What are your skills?" }` → `{ answer, source, score }` |
| `POST` | `/api/contact` | `{ name, email, message }` → saved to MongoDB (3 per IP per 10 min) |
| `GET` | `/api/visit` | Increments and returns the visitor count. `?peek=1` reads it without incrementing |
| `GET` | `/api/health` | MongoDB ping round trip and the Vercel region |
| `GET` | `/admin` | Admin dashboard (Basic auth; returns 404 when `ADMIN_PASSWORD` is unset) |

## Project structure

```
app.py                    Flask app (module-level `app`, auto-detected by Vercel)
core/                     ask.py · commands.py · contact.py · db.py
data/profile.json         bio, skills, projects, links   ← edit me
data/knowledge.json       Ask Ojas knowledge base         ← edit me
templates/index.html      the OS page
templates/admin.html      admin dashboard
public/                   static assets served by Vercel's CDN
  css/os.css              all styles (theme variables at the top)
  js/                     window manager, apps, terminal, games, cat, network monitor…
  js/wallpapers/          live halftone wallpaper scenes
  img/                    favicon, wallpaper, Snowy's photos
  certificates/           certificate PDFs
  resume.pdf
resume/resume.html        resume source, printed to public/resume.pdf
scripts/build_assets.py   wallpaper, favicon and photo generator (Pillow + NumPy)
scripts/build_resume.py   resume.html → resume.pdf with headless Chromium
tests/test_app.py         pytest suite (uses mongomock, no database needed)
vercel.json               keeps tests/scripts/public out of the function bundle
```

## Run locally

**Requirements:** Python 3.12. MongoDB Atlas is optional.

```bash
git clone https://github.com/Ojas1004/portfolio-ojasos.git
cd portfolio-ojasos

python -m venv .venv
source .venv/bin/activate              # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt

flask run --debug                      # → http://127.0.0.1:5000
```

Create a `.env` file in the project root (it is git-ignored):

```ini
MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/
MONGODB_DB=ojasos            # optional
ADMIN_PASSWORD=change-me     # optional, enables /admin
IP_HASH_SALT=any-random-text # optional
# OJASOS_MOCK_DB=1           # use an in-memory fake MongoDB instead
```

> **No MongoDB yet?** Set `OJASOS_MOCK_DB=1` in `.env` to use an in-memory fake database. Its data is lost on restart, so use it for development only.

`flask run` serves `public/` through a development-only route. On Vercel that route isn't registered, because the CDN serves `public/` directly.

To run it the way Vercel does, use the [Vercel CLI](https://vercel.com/docs/cli):

```bash
npm i -g vercel
vercel link            # connect the folder to your Vercel project
vercel env pull .env   # optional: download env vars set on Vercel
vercel dev             # → http://localhost:3000
```

### Tests

```bash
pytest
```

The tests use mongomock, so no database or network access is needed.

## Deploy to Vercel

1. **Create a MongoDB Atlas database.** The free M0 tier is enough.
   - *Database Access*: create a user with read/write access.
   - *Network Access*: allow `0.0.0.0/0`. Vercel functions don't have fixed IPs, so rely on a strong password.
   - *Connect → Drivers*: copy the `mongodb+srv://…` connection string.
2. **Push this repo to GitHub.** `.gitignore` already excludes `.env`, `.venv` and `.vercel`.
3. **Import the repo** at [vercel.com/new](https://vercel.com/new) and keep the defaults. Vercel detects Flask from `requirements.txt` and `app.py`. There's no build command and no gunicorn.
4. **Set environment variables**, either on the import screen or later under *Project → Settings → Environment Variables*:

   | Name | Required | Value |
   | --- | --- | --- |
   | `MONGODB_URI` | yes | your Atlas connection string |
   | `ADMIN_PASSWORD` | no | a long random password. Leave it unset to disable `/admin` |
   | `IP_HASH_SALT` | no | any random string |
   | `MONGODB_DB` | no | database name (default `ojasos`) |

5. **Deploy.** After you change environment variables, redeploy from *Deployments → ⋯ → Redeploy*.
6. Open `https://<your-project>.vercel.app/admin`. Log in with any username and your `ADMIN_PASSWORD`, then check that messages and commands appear.

### Serverless notes

- Nothing is kept on local disk or in memory between requests. The visitor counter, command log, contact messages and rate-limit counters all live in MongoDB.
- The TF-IDF model is fitted at import time, so only cold starts pay that cost. For this corpus it takes a few milliseconds.
- Python is pinned to 3.12 in `.python-version`. Pillow is only used by `scripts/build_assets.py`. Move it to `requirements-dev.txt` if you want a smaller bundle.

## Make it yours

- Edit **`data/profile.json`** (name, bio, skills, projects, links, email) and **`data/knowledge.json`** (what Ask Ojas knows).
- Edit **`resume/resume.html`**, then run `python scripts/build_resume.py` to rebuild `public/resume.pdf`. This needs Chromium or Chrome.
- Add photos to the Snowy folder with `python scripts/build_assets.py --photos path/to/photo.jpg …`. The script strips EXIF/GPS data, makes thumbnails and updates `public/img/snowy/photos.json`. Edit the `caption` fields in that file to change the text in the viewer.
- To use your own image as the pixel-art wallpaper, run `python scripts/build_assets.py photo.jpg`.
- To change colours, edit the CSS variables at the top of `public/css/os.css`.

## Credits

- The **Ocean Sunset** wallpaper is a halftone piece made from a photo by [César Couto on Unsplash](https://unsplash.com/photos/ZGx6vRlEySY). It is drawn live by `public/js/halftone.js`, with animated sea glints, palms and birds.
- The other wallpapers (*Harbour Neon Skyline*, *Orbit Window Earth* and *Redwood Forest Light*) are procedural scenes built by hand in `public/js/wallpapers/`.

---

Made by **Ojas Chaudhary** · [Website](https://ojaschaudhary.vercel.app/) · [GitHub](https://github.com/ojas1004) · [LinkedIn](https://www.linkedin.com/in/ojaschaudhary)
