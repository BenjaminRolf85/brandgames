#!/usr/bin/env python3
"""Cuts the picture of a generated coin image for the 3D menu coins.

The images in docs/spielkarten show a round coin with a painted frame on a light background.
The 3D coin brings its own metal frame, so only the picture inside the painted frame is used:
the script finds the coin (saturated pixels along the middle row and column), crops a square at
82 % of its radius (the painted frame's dark inner edge sits at about 81 %), and saves it as a
512 x 512 WebP in public/assets/cards/<key>.webp. Then add the key to CARD_ART in
public/js/menu-coins.js.

Usage: python3 scripts/coin-face.py <image> <game key> [radius factor] [dx] [dy]
  radius factor: default 0.82; larger keeps text that runs into the painted frame
  dx, dy:        shift of the crop center in pixels of the source image
Needs Pillow (pip install pillow).
"""
import os
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    src, key = sys.argv[1], sys.argv[2]
    factor = float(sys.argv[3]) if len(sys.argv) > 3 else 0.82
    dx = float(sys.argv[4]) if len(sys.argv) > 4 else 0
    dy = float(sys.argv[5]) if len(sys.argv) > 5 else 0
    im = Image.open(src).convert('RGB')
    w, h = im.size
    px = im.load()
    sat = lambda c: max(c) - min(c)
    xs = [x for x in range(w) if sat(px[x, h // 2]) > 60]
    ys = [y for y in range(h) if sat(px[w // 2, y]) > 60]
    if not xs or not ys:
        sys.exit('No coin found (expects a colorful coin on a light background).')
    cx, cy = (xs[0] + xs[-1]) / 2 + dx, (ys[0] + ys[-1]) / 2 + dy
    r = ((xs[-1] - xs[0]) + (ys[-1] - ys[0])) / 4 * factor
    face = im.crop((round(cx - r), round(cy - r), round(cx + r), round(cy + r))).resize((512, 512), Image.LANCZOS)
    out = os.path.join(ROOT, 'public', 'assets', 'cards', key + '.webp')
    face.save(out, 'WEBP', quality=86, method=6)
    print(f'{key}: coin center {cx:.0f},{cy:.0f}, picture radius {r:.0f} px -> {out} ({os.path.getsize(out)} bytes)')


if __name__ == '__main__':
    main()
