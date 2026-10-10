#!/usr/bin/env python3
"""Find spots on the solid body of big sprites where boss fire and smoke may start (never over transparent pixels).
Writes meta 'vents': {view: [[x, y], ...]} - normalised 0..1 (x from the left, y from the top), spread out by farthest-point sampling.
   tools/gen_vents.py walker harvester tank hunter ogre overmind"""
import json, os, re, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sprites')

def points(path, n=14, erode=5):
    a = np.asarray(Image.open(path).convert('RGBA'))[..., 3] > 200
    core = ndi.binary_erosion(a, iterations=erode)
    if core.sum() < 40: core = ndi.binary_erosion(a, iterations=2)
    ys, xs = np.where(core)
    if len(xs) == 0: return []
    H, W = a.shape; pts = np.stack([xs, ys], 1).astype(float)
    # prefer the upper-middle body: weight start point, then spread
    start = int(np.argmin(np.hypot((xs - W / 2) / W, (ys - H * .4) / H)))
    chosen = [start]; dist = np.hypot(*(pts - pts[start]).T)
    while len(chosen) < n:
        k = int(np.argmax(dist)); chosen.append(k); dist = np.minimum(dist, np.hypot(*(pts - pts[k]).T))
    return [[round(float(pts[k][0] / W), 3), round(float(pts[k][1] / H), 3)] for k in chosen]

def main():
    mp = os.path.join(ROOT, 'meta.json'); top = json.load(open(mp))
    for name in sys.argv[1:]:
        d = os.path.join(ROOT, name)
        if os.path.isdir(d):
            m = json.load(open(os.path.join(d, 'meta.json'))) if os.path.exists(os.path.join(d, 'meta.json')) else {}
            v = {}
            for f in sorted(os.listdir(d)):
                g = re.match(r'^([a-z]+)_0\.png$', f)
                if g: v[g.group(1)] = points(os.path.join(d, f))
            m['vents'] = v; json.dump(m, open(os.path.join(d, 'meta.json'), 'w'), indent=1); print(name, {k: len(x) for k, x in v.items()})
        elif os.path.exists(os.path.join(ROOT, name + '.png')):
            top.setdefault(name, {})['vents'] = {'e': points(os.path.join(ROOT, name + '.png'))}; print(name, 'legacy e view')
    json.dump(top, open(mp, 'w'), indent=1)

if __name__ == '__main__':
    main()
