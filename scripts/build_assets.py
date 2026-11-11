"""Generate OjasOS static assets with Pillow + NumPy.

Outputs (all in public/):
  img/wallpaper.png   dithered retro landscape used as the desktop wallpaper
  wallpaper.txt       the same image as ASCII art (shown by `neofetch`-style output)
  resume.pdf          placeholder resume built from data/profile.json
                      (only written if it does not exist yet, or with --resume)
  img/favicon.svg     tiny pixel icon
  img/snowy/          photos for the "Snowy" folder (+ thumbs/ and photos.json),
                      only with --photos

Usage:
  python scripts/build_assets.py              # wallpaper + favicon (+ resume if missing)
  python scripts/build_assets.py photo.jpg    # turn your own image into the wallpaper
  python scripts/build_assets.py --resume     # regenerate the placeholder resume (overwrites the real one;
                                              # the real resume is built by scripts/build_resume.py)
  python scripts/build_assets.py --photos SNOW1.jpeg SNOW2.jpeg
                                              # add photos to the Snowy folder
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
W, H = 480, 270  # rendered small, scaled up with pixelated CSS

PALETTE = np.array(
    [
        (11, 30, 32),     # deep teal / foreground
        (18, 48, 50),
        (29, 74, 79),     # desk teal
        (44, 104, 104),
        (84, 150, 136),   # horizon green
        (150, 196, 160),  # haze
        (226, 161, 61),   # amber
        (246, 210, 122),  # light amber
        (255, 246, 214),  # cream
    ],
    dtype=np.float32,
)

BAYER4 = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], dtype=np.float32) / 16.0


def lerp(a, b, t):
    return a + (b - a) * t


def render_landscape():
    """Paint a dusk landscape as a float RGB array."""
    rng = np.random.default_rng(7)
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    img = np.zeros((H, W, 3), np.float32)

    # sky: vertical gradient top -> horizon
    horizon = H * 0.62
    t = np.clip(y / horizon, 0, 1)[..., None]
    img[:] = lerp(np.array([16, 42, 47]), np.array([120, 178, 150]), t**1.6)

    # stars in the upper sky
    for _ in range(70):
        sx, sy = rng.integers(0, W), rng.integers(0, int(H * 0.3))
        img[sy, sx] = (230, 240, 220)

    # sun with retro horizontal cut-outs
    cx, cy, r = W * 0.7, horizon - 30, 40
    d = np.hypot(x - cx, y - cy)
    sun = d < r
    stripes = (y > cy - 6) & (((cy + 40 - y) % 9) < (1 + (y - (cy - 6)) / 11))
    mask = sun & ~stripes
    sun_t = np.clip((y[mask] - (cy - r)) / (2 * r), 0, 1)[:, None]
    img[mask] = lerp(np.array([250, 222, 140]), np.array([226, 140, 52]), sun_t)
    glow = np.clip(1 - d / (r * 2.6), 0, 1)[..., None] * (y < horizon)[..., None]
    img = lerp(img, np.array([240, 190, 110]), glow * 0.35)

    # mountain ridges: back to front
    def ridge(base, amp, freqs, seed):
        g = np.random.default_rng(seed)
        xs = np.arange(W, dtype=np.float32)
        h = np.zeros(W, np.float32)
        for f in freqs:
            h += np.sin(xs * f + g.uniform(0, 6.28)) / (f * 40)
        h = (h - h.min()) / (h.max() - h.min() + 1e-6)
        return base - h * amp

    layers = [
        (horizon + 6, 34, [0.011, 0.027, 0.061], 1, (52, 110, 108)),
        (horizon + 26, 46, [0.009, 0.033, 0.08], 2, (29, 74, 79)),
        (H * 0.86, 40, [0.006, 0.021, 0.05], 3, (18, 48, 50)),
        (H + 6, 34, [0.004, 0.015, 0.04], 4, (11, 30, 32)),
    ]
    for base, amp, freqs, seed, col in layers:
        top = ridge(base, amp, freqs, seed)
        below = y >= top[None, :]
        # slight vertical shading inside each layer
        shade = np.clip((y - top[None, :]) / 60, 0, 1)[..., None]
        layer_rgb = lerp(np.array(col, np.float32) * 1.12, np.array(col, np.float32) * 0.85, shade)
        img = np.where(below[..., None], layer_rgb, img)

    return np.clip(img, 0, 255)


def ordered_dither(img, spread=46.0):
    """Map RGB to PALETTE using a 4x4 Bayer matrix (retro look)."""
    h, w, _ = img.shape
    threshold = np.tile(BAYER4, (h // 4 + 1, w // 4 + 1))[:h, :w][..., None]
    noisy = img + (threshold - 0.5) * spread
    dist = ((noisy[:, :, None, :] - PALETTE[None, None, :, :]) ** 2).sum(-1)
    return PALETTE[dist.argmin(-1)].astype(np.uint8)


def to_ascii(img, cols=72):
    """Luminance -> ASCII ramp. Characters are ~2x taller than wide."""
    ramp = " .,:;-=+*#%@"
    pil = Image.fromarray(np.asarray(img, dtype=np.uint8)).convert("L")
    rows = int(cols * pil.height / pil.width * 0.5)
    small = np.asarray(pil.resize((cols, rows), Image.Resampling.BOX), dtype=np.float32)
    small = (small - small.min()) / (np.ptp(small) + 1e-6)  # stretch contrast
    idx = np.clip((small * (len(ramp) - 1)).round().astype(int), 0, len(ramp) - 1)
    return "\n".join("".join(ramp[i] for i in row).rstrip() for row in idx) + "\n"


def load_font(size, bold=False):
    candidates = [
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/TTF/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf",
    ]
    for c in candidates:
        try:
            return ImageFont.truetype(c, size)
        except OSError:
            continue
    return ImageFont.load_default(size=size)


def build_resume(path):
    """A4 placeholder resume rendered from profile.json (replace with your real one)."""
    profile = json.loads((ROOT / "data" / "profile.json").read_text(encoding="utf-8"))
    page = Image.new("RGB", (1240, 1754), "white")  # A4 @ 150 dpi
    d = ImageDraw.Draw(page)
    teal, ink, dim = (31, 79, 87), (28, 38, 38), (92, 105, 103)
    x, y = 110, 110

    d.rectangle([0, 0, 1240, 22], fill=teal)
    d.text((x, y), profile["name"], font=load_font(64, True), fill=ink)
    y += 86
    d.text((x, y), profile["role"], font=load_font(28), fill=dim)
    y += 44
    d.text((x, y), f'{profile["email"]}  ·  {profile["links"]["github"]}', font=load_font(22), fill=teal)
    y += 60
    d.rectangle([x, y, 1130, y + 3], fill=teal)
    y += 30
    d.text((x, y), "PLACEHOLDER: replace public/resume.pdf with your real resume.", font=load_font(24, True), fill=(180, 68, 58))
    y += 60

    def section(title):
        nonlocal y
        d.text((x, y), title.upper(), font=load_font(30, True), fill=teal)
        y += 48

    section("Skills")
    for group, items in profile["skills"].items():
        d.text((x, y), f"{group}:", font=load_font(22, True), fill=ink)
        d.text((x + 260, y), ", ".join(items), font=load_font(22), fill=ink)
        y += 36
    y += 24

    section("Projects")
    body = load_font(21)
    for p in profile["projects"]:
        d.text((x, y), f'{p["name"]}  ({p["year"]})', font=load_font(24, True), fill=ink)
        y += 34
        d.text((x, y), p["tagline"], font=load_font(21), fill=dim)
        y += 32
        # naive word wrap
        line = ""
        for word in p["description"].split():
            trial = f"{line} {word}".strip()
            if d.textlength(trial, font=body) > 1010:
                d.text((x, y), line, font=body, fill=ink)
                y += 30
                line = word
            else:
                line = trial
        if line:
            d.text((x, y), line, font=body, fill=ink)
            y += 30
        y += 22

    page.save(path, "PDF", resolution=150.0)


FAVICON = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
<rect x="1" y="2" width="14" height="10" fill="#1f4f57"/><rect x="2" y="3" width="12" height="8" fill="#08110d"/>
<path d="M3.5 5l2 1.5-2 1.5" stroke="#8ff2aa" fill="none"/><rect x="6.5" y="8" width="3" height="1" fill="#ffc25a"/>
<rect x="5" y="12" width="6" height="1" fill="#353a35"/><rect x="3" y="13" width="10" height="2" fill="#8d9088"/></svg>
"""


PHOTO_MAX = 1600  # longest side of the full-size photo
THUMB_MAX = 320


def build_photos(paths, out_dir=PUBLIC / "img" / "snowy"):
    """Copy photos into the site, stripping metadata (EXIF/GPS), and make thumbnails.

    Photos are re-encoded from pixels only, so camera details and location data
    in the originals never reach the public site. A photos.json manifest lists
    every photo in the folder, so the frontend needs no code change to show more.
    """
    thumbs = out_dir / "thumbs"
    thumbs.mkdir(parents=True, exist_ok=True)
    manifest_path = out_dir / "photos.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else []
    by_name = {p["name"]: p for p in manifest}

    for path in map(Path, paths):
        img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")  # honour camera rotation, then drop EXIF
        img.thumbnail((PHOTO_MAX, PHOTO_MAX), Image.Resampling.LANCZOS)
        name = path.name
        img.save(out_dir / name, "JPEG", quality=88, optimize=True, progressive=True)
        thumb = img.copy()
        thumb.thumbnail((THUMB_MAX, THUMB_MAX), Image.Resampling.LANCZOS)
        thumb.save(thumbs / name, "JPEG", quality=82, optimize=True)
        entry = by_name.setdefault(name, {"name": name, "caption": ""})
        entry.update({"src": f"/img/snowy/{name}", "thumb": f"/img/snowy/thumbs/{name}",
                      "width": img.width, "height": img.height})
        print(f"photo {name}: {img.width}x{img.height}")

    manifest = sorted(by_name.values(), key=lambda p: p["name"].lower())
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {manifest_path.relative_to(ROOT)} ({len(manifest)} photos)")


def main(argv):
    (PUBLIC / "img").mkdir(parents=True, exist_ok=True)
    if "--photos" in argv:
        build_photos(argv[argv.index("--photos") + 1:])
        return
    sources = [a for a in argv if not a.startswith("--")]

    if sources:  # user-supplied photo
        src = Image.open(sources[0]).convert("RGB")
        src = src.resize((W, int(W * src.height / src.width)), Image.Resampling.LANCZOS)
        rgb = np.asarray(src, dtype=np.float32)
    else:
        rgb = render_landscape()

    dithered = ordered_dither(rgb)
    Image.fromarray(dithered).save(PUBLIC / "img" / "wallpaper.png", optimize=True)
    (PUBLIC / "wallpaper.txt").write_text(to_ascii(rgb), encoding="utf-8")
    (PUBLIC / "img" / "favicon.svg").write_text(FAVICON, encoding="utf-8")
    print("wrote public/img/wallpaper.png, public/wallpaper.txt, public/img/favicon.svg")

    resume = PUBLIC / "resume.pdf"
    if "--resume" in argv or not resume.exists():
        build_resume(resume)
        print("wrote public/resume.pdf (placeholder)")


if __name__ == "__main__":
    main(sys.argv[1:])
