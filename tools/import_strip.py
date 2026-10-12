#!/usr/bin/env python3
"""Install a horizontal strip of animation frames (one view) from a flat-background image as game sprites.
  tools/import_strip.py strip.png rifle2 --dir n [--height 110] [--bg black|fuchsia|alpha] [--tol 14] [--muz-left]
  tools/import_strip.py sheet.png rifle3 --groups s:1,n:6,ne:6,nw:6 --bg fuchsia --tol 150 --dilate 0   (several views in one row, left to right)
 - removes the background (connected to the image border), splits frames by blob, drops specks
 - locks every frame to one feet line and one body centre, downsamples to --height px (box filter, hard alpha)
 - writes assets/sprites/<name>/<dir>_<i>.png, <name>/meta.json (h, muzzle) and rebuilds the manifest"""
import argparse, json, os, subprocess, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

FR_T = 45   # purple-ness threshold for removing magenta fringe (lower = more aggressive)
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..', 'assets', 'sprites')

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('sheet'); ap.add_argument('name')
    ap.add_argument('--dir', default='n'); ap.add_argument('--height', type=int, default=110); ap.add_argument('--bg', default='black')
    ap.add_argument('--tol', type=int, default=14); ap.add_argument('--dilate', type=int, default=8); ap.add_argument('--groups', default=''); ap.add_argument('--rows', type=int, default=1, help='frames laid out in this many rows (read row by row)'); ap.add_argument('--h', type=float, default=56); ap.add_argument('--muz-left', action='store_true', help='muzzle = leftmost point of the figure (slung/pointed left)')
    ap.add_argument('--keep', type=int, default=0, help='keep only the N biggest blobs (drops stray fragments)'); ap.add_argument('--fringe', type=int, default=45); ap.add_argument('--split-wide', action='store_true', help='cut cells that touch (a merged blob about twice as wide as the others) at the thinnest column'); o = ap.parse_args(); FR_T = o.fringe
    im = Image.open(o.sheet).convert('RGBA'); a = np.asarray(im).copy()
    if o.bg == 'alpha': fg = a[..., 3] > 20
    else:
        ref = np.array([0, 0, 0]) if o.bg == 'black' else np.array([255, 0, 255])
        near = np.abs(a[..., :3].astype(int) - ref).sum(-1) <= o.tol
        lab, _ = ndi.label(near); edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
        fg = ~np.isin(lab, list(edge))
        if o.bg == 'fuchsia':   # also drop dark/blended magenta (ground shadows, fringe)
            rr, gg, bb = (a[..., k].astype(int) for k in range(3)); fg &= ~((rr - gg > FR_T) & (bb - gg > FR_T))
    fg = ndi.binary_opening(fg, iterations=1)
    if o.split_wide:
        l0, n0 = ndi.label(fg); bx = [(sl[1].start, sl[1].stop, l0[sl] == i + 1) for i, sl in enumerate(ndi.find_objects(l0))]
        ws = sorted(b[1] - b[0] for b in bx if (fg[:, b[0]:b[1]]).sum() > 2000); med = ws[len(ws) // 2] if ws else 0
        for x0_, x1_, _ in bx:
            if med and x1_ - x0_ > 1.6 * med:
                lo, hi = x0_ + int((x1_ - x0_) * .35), x0_ + int((x1_ - x0_) * .65); cut = lo + int(np.argmin(fg[:, lo:hi].sum(0))); fg[:, cut] = False; print('split a merged pair at column', cut)
    lab, n = ndi.label(ndi.binary_dilation(fg, iterations=o.dilate) if o.dilate else fg)
    objs = [(s, i + 1) for i, s in enumerate(ndi.find_objects(lab))]
    objs = [(s, i) for s, i in objs if (fg[s] & (lab[s] == i)).sum() > 2000]
    if o.keep and len(objs) > o.keep: objs = sorted(objs, key=lambda t: -(fg[t[0]] & (lab[t[0]] == t[1])).sum())[:o.keep]
    if o.rows > 1:   # split into rows at the biggest vertical gaps, then left to right within a row
        yc = sorted((t[0][0].start + t[0][0].stop) / 2 for t in objs); gaps = sorted(range(1, len(yc)), key=lambda k: yc[k] - yc[k - 1], reverse=True)[:o.rows - 1]
        cuts = sorted(yc[k] for k in gaps); rowof = lambda t: sum(((t[0][0].start + t[0][0].stop) / 2) >= c for c in cuts)
        objs.sort(key=lambda t: (rowof(t), t[0][1].start))
    else: objs.sort(key=lambda t: t[0][1].start)
    print('frames found:', len(objs))
    frames = []
    for s, i in objs:
        m = fg & (lab == i); ys, xs = np.where(m); y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        if o.bg == 'fuchsia':   # drop leftover magenta fringe (edge pixels blended with the key colour)
            rr, gg, bb = (a[..., k].astype(int) for k in range(3)); m = m & ~((rr - gg > FR_T) & (bb - gg > FR_T))
        rgba = a.copy(); rgba[..., 3] = (m * 255).astype('uint8'); c = Image.fromarray(rgba).crop((x0, y0, x1, y1))
        al = np.asarray(c)[..., 3] > 0; rows = np.where(al.any(1))[0]; torso = al[int(len(al) * .2):int(len(al) * .6)]
        cx = np.where(torso.any(0))[0]; cx = (cx.min() + cx.max()) / 2 if len(cx) else c.width / 2        # body centre ignores a protruding rifle
        frames.append((c, cx))
    H = max(c.height for c, _ in frames); sc = o.height / H
    left = max(cx for _, cx in frames); right = max(c.width - cx for c, cx in frames)
    W = int(round((left + right) * sc)) + 2
    outs = []
    for c, cx in frames:
        c2 = c.resize((max(1, round(c.width * sc)), max(1, round(c.height * sc))), Image.BOX)
        arr = np.asarray(c2).copy(); arr[..., 3] = np.where(arr[..., 3] > 128, 255, 0); c2 = Image.fromarray(arr)
        canvas = Image.new('RGBA', (W, o.height + 1), (0, 0, 0, 0))
        canvas.paste(c2, (int(round(left * sc - cx * sc)) + 1, o.height + 1 - c2.height), c2); outs.append(canvas)
    groups = [(g.split(':')[0], int(g.split(':')[1])) for g in o.groups.split(',')] if o.groups else [(o.dir, len(outs))]
    assert sum(c for _, c in groups) == len(outs), 'groups %s do not match %d frames' % (groups, len(outs))
    UD = os.path.join(ROOT, o.name); os.makedirs(UD, exist_ok=True)
    mp = os.path.join(UD, 'meta.json'); e = json.load(open(mp)) if os.path.exists(mp) else {}
    e['h'] = o.h; wsc = o.h / (o.height + 1); k0 = 0
    for f in os.listdir(UD):
        if f.endswith('.png') and f.split('_')[0] in [g for g, _ in groups]: os.remove(os.path.join(UD, f))
    for d, cnt in groups:
        for i, c in enumerate(outs[k0:k0 + cnt]): c.save(os.path.join(UD, '%s_%d.png' % (d, i)))
        if o.muz_left or o.groups:      # muzzle = the figure's extreme point on the weapon side (left for n/nw, right otherwise)
            al = np.asarray(outs[k0])[..., 3] > 0; ys, xs = np.where(al); k = xs.argmin() if (o.muz_left or d in ('n', 'nw', 'w')) else xs.argmax()
            e.setdefault('muz', {})[d] = [round(float(xs[k] - W / 2) * wsc, 1), round(float(o.height + 1 - ys[k]) * wsc, 1)]
        k0 += cnt
    json.dump(e, open(mp, 'w'), indent=1)
    subprocess.run([sys.executable, os.path.join(HERE, 'build_manifest.py'), ROOT], check=True, stdout=subprocess.DEVNULL)
    print('installed', o.name, groups, outs[0].size, e)

if __name__ == '__main__':
    main()
