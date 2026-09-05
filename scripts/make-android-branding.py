# -*- coding: utf-8 -*-
"""
Generates the Android launcher icons and splash screens from the Qurious logo.

`npx cap add android` scaffolds Capacitor's own stock artwork, and `cap sync` never
replaces it — which is why the phone showed a completely different logo. Output goes to
`resources/android/`, and build-apk.mjs copies that over the generated project on every
build, so regenerating the Android folder can never lose the branding again.

    python scripts/make-android-branding.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
LOGO = ROOT / 'public' / 'brand' / 'logo.png'
OUT = ROOT / 'resources' / 'android'

# The logo is bright cyan and violet with a pale sphere at its centre: it needs a dark
# ground. Capacitor's default was #FFFFFF, which washed the whole mark out.
NAVY_MID = (22, 33, 74)
NAVY_EDGE = (7, 11, 22)
BG_HEX = '#0B1226'

LAUNCHER = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
# Adaptive foregrounds are 108dp canvases whose guaranteed-visible area is the middle
# 66dp, so the mark has to sit inside ~61% of the width.
FOREGROUND = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}
SPLASH = {
    'port-mdpi': (320, 480), 'port-hdpi': (480, 800), 'port-xhdpi': (720, 1280),
    'port-xxhdpi': (960, 1600), 'port-xxxhdpi': (1280, 1920),
    'land-mdpi': (480, 320), 'land-hdpi': (800, 480), 'land-xhdpi': (1280, 720),
    'land-xxhdpi': (1600, 960), 'land-xxxhdpi': (1920, 1280),
}

logo = Image.open(LOGO).convert('RGBA')


def radial(size, inner=NAVY_MID, outer=NAVY_EDGE):
    """A soft radial ground, so the icon does not read as a flat black square."""
    w, h = size
    img = Image.new('RGB', (w, h), outer)
    px = img.load()
    cx, cy = w / 2, h / 2
    maxd = (cx ** 2 + cy ** 2) ** 0.5
    for y in range(h):
        for x in range(w):
            d = min(1.0, ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 / maxd)
            t = d ** 1.35
            px[x, y] = tuple(round(inner[i] + (outer[i] - inner[i]) * t) for i in range(3))
    return img


def fit(img, box):
    """Scale to fit inside a square of `box` px, keeping aspect."""
    w, h = img.size
    s = box / max(w, h)
    return img.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)


def paste_centre(base, mark, dy=0):
    x = (base.width - mark.width) // 2
    y = (base.height - mark.height) // 2 + dy
    base.paste(mark, (x, y), mark)


def rounded_mask(size, radius_frac=0.22):
    m = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius_frac), fill=255)
    return m


def circle_mask(size):
    m = Image.new('L', (size * 4, size * 4), 0)
    ImageDraw.Draw(m).ellipse([0, 0, size * 4 - 1, size * 4 - 1], fill=255)
    return m.resize((size, size), Image.LANCZOS)


def write(img, rel):
    p = OUT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    img.save(p)
    return p


count = 0

# ---------------------------------------------------------------- launcher icons
for dpi, px in LAUNCHER.items():
    ground = radial((px, px)).convert('RGBA')
    square = ground.copy()
    paste_centre(square, fit(logo, round(px * 0.74)))
    square.putalpha(rounded_mask(px))
    write(square, f'mipmap-{dpi}/ic_launcher.png'); count += 1

    round_icon = ground.copy()
    paste_centre(round_icon, fit(logo, round(px * 0.68)))
    round_icon.putalpha(circle_mask(px))
    write(round_icon, f'mipmap-{dpi}/ic_launcher_round.png'); count += 1

# Adaptive foreground: transparent, mark inside the safe circle.
for dpi, px in FOREGROUND.items():
    fg = Image.new('RGBA', (px, px), (0, 0, 0, 0))
    paste_centre(fg, fit(logo, round(px * 0.58)))
    write(fg, f'mipmap-{dpi}/ic_launcher_foreground.png'); count += 1

write_bg = OUT / 'values' / 'ic_launcher_background.xml'
write_bg.parent.mkdir(parents=True, exist_ok=True)
write_bg.write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<resources>\n'
    f'    <color name="ic_launcher_background">{BG_HEX}</color>\n'
    '</resources>\n', encoding='utf-8')
count += 1

# ---------------------------------------------------------------- splash screens
def font(px):
    for name in ('seguisb.ttf', 'segoeuib.ttf', 'arialbd.ttf'):
        try:
            return ImageFont.truetype(f'C:/Windows/Fonts/{name}', px)
        except OSError:
            continue
    return ImageFont.load_default()


for name, (w, h) in SPLASH.items():
    img = radial((w, h)).convert('RGBA')
    mark = fit(logo, round(min(w, h) * 0.32))
    paste_centre(img, mark, dy=-round(min(w, h) * 0.05))

    d = ImageDraw.Draw(img)
    size = max(14, round(min(w, h) * 0.072))
    f = font(size)
    text = 'Qurious'
    tw = d.textbbox((0, 0), text, font=f)[2]
    ty = (h + mark.height) // 2 - round(min(w, h) * 0.05) + round(min(w, h) * 0.035)
    d.text(((w - tw) / 2, ty), text, font=f, fill=(233, 240, 255, 255))

    write(img.convert('RGB'), f'drawable-{name}/splash.png'); count += 1

# The density-less fallback Capacitor also ships.
base = radial((480, 320)).convert('RGBA')
paste_centre(base, fit(logo, 150))
write(base.convert('RGB'), 'drawable/splash.png'); count += 1

print(f'wrote {count} files to {OUT}')
