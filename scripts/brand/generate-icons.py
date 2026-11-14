#!/usr/bin/env python3
"""Generate all NEXO icon assets from the brand logo.

Usage (requires Pillow and numpy, e.g. in a throwaway venv):
    python3 -m venv /tmp/nexo-venv && /tmp/nexo-venv/bin/pip install pillow numpy
    /tmp/nexo-venv/bin/python scripts/brand/generate-icons.py

The source logo is a blue infinity mark on a white background. The white
background, including the two enclosed loop holes, becomes transparent; the
small white network nodes inside the mark stay opaque.
"""

import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SOURCE = os.path.join(ROOT, 'scripts', 'brand', 'nexo-logo.webp')

# Near-white threshold for background detection (0-255 distance from white).
WHITE_DIST = 14
# Background regions smaller than this are white nodes, not background.
MIN_BG_AREA = 10000


def extract_logo(path: str) -> Image.Image:
    src = Image.open(path).convert('RGB')
    rgb = np.asarray(src).astype(np.float32)
    dist = 255.0 - rgb.min(axis=2)
    near_white = dist <= WHITE_DIST

    # Label near-white regions with flood fills; keep only large ones as background.
    h, w = near_white.shape
    mask_img = Image.fromarray(np.where(near_white, 255, 0).astype(np.uint8))
    background = np.zeros_like(near_white)
    visited = np.zeros_like(near_white)
    ys, xs = np.nonzero(near_white)
    for y, x in zip(ys[::97], xs[::97]):
        if visited[y, x]:
            continue
        probe = mask_img.copy()
        ImageDraw.floodfill(probe, (int(x), int(y)), 128)
        region = np.asarray(probe) == 128
        visited |= region
        if region.sum() >= MIN_BG_AREA:
            background |= region

    # Soft edge: unmultiply white in a thin band around the background.
    bg_img = Image.fromarray(np.where(background, 255, 0).astype(np.uint8))
    band = np.asarray(bg_img.filter(ImageFilter.MaxFilter(9))) > 0
    edge = band & ~background

    alpha = np.full((h, w), 255.0, dtype=np.float32)
    alpha[background] = 0.0
    edge_alpha = np.clip(dist / 255.0 * 1.6, 0.0, 1.0) * 255.0
    alpha[edge] = edge_alpha[edge]

    out_rgb = rgb.copy()
    a = np.clip(alpha / 255.0, 1e-3, 1.0)[..., None]
    unmult = (rgb - (1.0 - a) * 255.0) / a
    out_rgb[edge] = np.clip(unmult, 0, 255)[edge]

    rgba = np.dstack([out_rgb, alpha]).astype(np.uint8)
    img = Image.fromarray(rgba)
    return img.crop(img.getbbox())


def square(img: Image.Image, size: int, margin: float = 0.06) -> Image.Image:
    inner = int(round(size * (1 - 2 * margin)))
    scale = inner / max(img.width, img.height)
    resized = img.resize(
        (max(1, round(img.width * scale)), max(1, round(img.height * scale))),
        Image.LANCZOS
    )
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.paste(resized, ((size - resized.width) // 2, (size - resized.height) // 2), resized)
    return canvas


def fit_height(img: Image.Image, height: int) -> Image.Image:
    width = round(img.width * height / img.height)
    return img.resize((width, height), Image.LANCZOS)


def hue_shift(img: Image.Image, degrees: float) -> Image.Image:
    r, g, b, a = img.split()
    hsv = Image.merge('RGB', (r, g, b)).convert('HSV')
    hh, ss, vv = hsv.split()
    shift = int(round(degrees / 360 * 255))
    hh = hh.point(lambda v: (v + shift) % 256)
    rgb = Image.merge('HSV', (hh, ss, vv)).convert('RGB')
    return Image.merge('RGBA', (*rgb.split(), a))


def monochrome(img: Image.Image, color: tuple) -> Image.Image:
    """Single-color silhouette; bright nodes/lines become see-through."""
    arr = np.asarray(img).astype(np.float32)
    brightness = arr[..., :3].min(axis=2) / 255.0
    cutout = np.clip((brightness - 0.55) / 0.35, 0.0, 1.0)
    alpha = arr[..., 3] * (1.0 - cutout)
    out = np.zeros_like(arr)
    out[..., 0], out[..., 1], out[..., 2] = color
    out[..., 3] = alpha
    return Image.fromarray(out.astype(np.uint8))


def save_ico(img: Image.Image, path: str) -> None:
    sizes = [16, 24, 32, 48, 64, 128, 256]
    base = square(img, 256)
    base.save(path, format='ICO', sizes=[(s, s) for s in sizes])


def save_icns(img: Image.Image, path: str) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        iconset = os.path.join(tmp, 'icon.iconset')
        os.makedirs(iconset)
        for size in [16, 32, 128, 256, 512]:
            square(img, size).save(os.path.join(iconset, f'icon_{size}x{size}.png'))
            square(img, size * 2).save(os.path.join(iconset, f'icon_{size}x{size}@2x.png'))
        subprocess.run(['iconutil', '-c', 'icns', iconset, '-o', path], check=True)


def main() -> int:
    logo = extract_logo(SOURCE)
    res = lambda *p: os.path.join(ROOT, *p)

    # Build (installer / packaged app) icons.
    square(logo, 1024).save(res('build', 'icon.png'))
    save_ico(logo, res('build', 'icon.ico'))
    save_ico(logo, res('build', 'installerIcon.ico'))
    if sys.platform == 'darwin':
        save_icns(logo, res('build', 'icon.icns'))
    else:
        print('skip build/icon.icns (iconutil is macOS only)')

    # Runtime window / tray icons. "blue" is the brand color; others are hue variants.
    variants = {
        'icon': logo,
        'icon_blue': logo,
        'icon_green': hue_shift(logo, -80),
        'icon_red': hue_shift(logo, 150),
    }
    for name, img in variants.items():
        square(img, 512).save(res('resources', f'{name}.png'))
        save_ico(img, res('resources', f'{name}.ico'))

    # macOS menu bar template (black + alpha), 2x for 16px height.
    fit_height(monochrome(logo, (0, 0, 0)), 64).save(res('resources', 'iconTemplate.png'))

    # Renderer logos.
    assets = res('src', 'renderer', 'src', 'assets')
    fit_height(logo, 128).save(os.path.join(assets, 'nexo-logo.png'))
    fit_height(monochrome(logo, (255, 255, 255)), 128).save(
        os.path.join(assets, 'nexo-logo-mono.png')
    )
    print('icons generated')
    return 0


if __name__ == '__main__':
    sys.exit(main())
