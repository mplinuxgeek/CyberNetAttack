#!/usr/bin/env python3
"""Remove the pink/fuchsia haze that chroma-key cut-outs leave on sprite edges.
Edge pixels (within --band px of transparency) whose colour leans magenta are repainted with the median colour of nearby clean pixels
(or the dark outline colour when none are nearby). Idempotent.   tools/defringe.py [folder ...]   (default: assets/sprites)"""
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sprites')
OUTLINE = np.array([14, 16, 22])

def clean(path, band=2, thr=10):
    im = Image.open(path).convert('RGBA'); a = np.asarray(im).astype(int).copy()
    al = a[..., 3] > 0
    if not al.any(): return 0
    near_edge = ndi.binary_dilation(~al, iterations=band) & al
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    pink = near_edge & (r - g > thr) & (b - g > thr)
    # strongly magenta pixels anywhere on the figure's rim, even a little inside
    pink |= (ndi.binary_dilation(~al, iterations=band + 1) & al) & (r - g > 30) & (b - g > 30)
    n = int(pink.sum())
    if not n: return 0
    good = al & ~pink & ~((r - g > thr) & (b - g > thr))
    out = a.copy(); H, W = al.shape
    ys, xs = np.where(pink)
    for y, x in zip(ys, xs):
        y0, y1, x0, x1 = max(0, y - 3), min(H, y + 4), max(0, x - 3), min(W, x + 4)
        m = good[y0:y1, x0:x1]
        if m.sum() >= 3: out[y, x, :3] = np.median(a[y0:y1, x0:x1][m][:, :3], axis=0)
        else: out[y, x, :3] = OUTLINE
    Image.fromarray(out.astype('uint8'), 'RGBA').save(path)
    return n

def main():
    roots = sys.argv[1:] or [ROOT]; tot = files = 0
    for rt in roots:
        for d, _, fs in os.walk(rt):
            if '_archive' in d or '_orig' in d: continue
            for f in fs:
                if f.endswith('.png'):
                    n = clean(os.path.join(d, f))
                    if n: tot += n; files += 1
    print('repainted %d pixels in %d files' % (tot, files))

if __name__ == '__main__':
    main()
