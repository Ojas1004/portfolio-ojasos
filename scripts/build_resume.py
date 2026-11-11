"""Print resume/resume.html to public/resume.pdf with headless Chromium.

Usage:  python scripts/build_resume.py
Needs Chromium or Google Chrome on PATH. The PDF keeps real, selectable text
(so applicant-tracking systems can read it) and embeds its fonts.
"""

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "resume" / "resume.html"
TARGET = ROOT / "public" / "resume.pdf"
BROWSERS = ["chromium", "chromium-browser", "google-chrome-stable", "google-chrome"]


def main():
    browser = next((b for b in BROWSERS if shutil.which(b)), None)
    if not browser:
        sys.exit("Chromium or Google Chrome is needed to build the PDF.")
    with tempfile.TemporaryDirectory() as profile:
        subprocess.run(
            [
                browser, "--headless=new", "--disable-gpu", "--no-first-run",
                f"--user-data-dir={profile}", "--no-pdf-header-footer",
                f"--print-to-pdf={TARGET}", SOURCE.as_uri(),
            ],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60,
        )
    print(f"wrote {TARGET.relative_to(ROOT)} ({TARGET.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
