#!/usr/bin/env python3
"""Shrink sprite PNGs ~4x with no visible change: quantise to a 192-colour palette (alpha kept), no dithering.
   tools/optimize_sprites.py [folder]      (default assets/sprites; safe to re-run, run it after importing new art)"""
import os, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sprites')

def main():
    root = sys.argv[1] if len(sys.argv) > 1 else ROOT; a = b = 0
    for d, _, fs in os.walk(root):
        for f in fs:
            if f.endswith('.png'):
                p = os.path.join(d, f); a += os.path.getsize(p)
                Image.open(p).convert('RGBA').quantize(colors=192, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(p, optimize=True)
                b += os.path.getsize(p)
    print('%.2f MB -> %.2f MB' % (a / 1e6, b / 1e6))

if __name__ == '__main__':
    main()
