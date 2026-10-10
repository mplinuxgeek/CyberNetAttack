#!/usr/bin/env python3
"""3D model -> pixel-art sprites for the game.
   tools/render3d/run.py model.glb unitname [--views 8|12] [--height 96] [--colors 28] [--faces 30000] [--out DIR] [--install]
 1. (optional) decimates a huge scan/AI mesh to --faces triangles (needs: pip install trimesh fast-simplification scipy)
 2. renders the model from every angle in headless Chrome with three.js (npm install in this folder once)
 3. grades colour, crops all views to one canvas, downsamples to --height px, shares one palette, adds a 1px outline
 4. --install writes assets/sprites/<unit>/<dir>_0.png + manifest (8 views only)
The model must face +X at rotation 0 (east); pass --yaw to correct it."""
import argparse, os, subprocess, sys, shutil, time, threading, http.server, socketserver, functools
import numpy as np
from PIL import Image, ImageEnhance
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..', '..', 'assets', 'sprites')
D8 = ['s', 'se', 'e', 'ne', 'n', 'nw', 'w', 'sw']

def chrome():
    for c in ('google-chrome', 'chromium', 'chromium-browser'):
        if shutil.which(c): return c
    sys.exit('no chrome')

def render(glb, views, yaw, size, el):
    if not os.path.isdir(os.path.join(HERE, 'node_modules', 'three')):
        subprocess.run(['npm', 'install', '--silent'], cwd=HERE, check=True)
    shutil.copy(glb, os.path.join(HERE, '_model.glb'))
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=HERE); h.log_message = lambda *a, **k: None
    srv = socketserver.TCPServer(('127.0.0.1', 0), h); port = srv.server_address[1]; threading.Thread(target=srv.serve_forever, daemon=True).start()
    out = os.path.join(HERE, '_sheet.png')
    subprocess.run([chrome(), '--headless=new', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--hide-scrollbars',
                    '--default-background-color=00000000', '--window-size=%d,%d' % (size * views, size), '--virtual-time-budget=60000',
                    '--screenshot=' + out, 'http://127.0.0.1:%d/render.html?x=1&f=_model.glb&n=%d&s=%d&off=%d&el=%d' % (port, views, size, yaw, el)],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    srv.shutdown(); os.remove(os.path.join(HERE, '_model.glb'))
    im = Image.open(out).convert('RGBA'); os.remove(out)
    return [im.crop((i * size, 0, (i + 1) * size, size)) for i in range(views)]

def despeckle(c):
    a = np.asarray(c.getchannel('A')) > 100
    lab, n = ndi.label(ndi.binary_dilation(a, iterations=6))
    if n > 1:
        sizes = ndi.sum(a, lab, range(1, n + 1)); keep = [i + 1 for i, v in enumerate(sizes) if v > .02 * sizes.max()]
        m = np.isin(lab, keep); arr = np.asarray(c).copy(); arr[~m] = 0; c = Image.fromarray(arr)
    return c

def pixelize(cells, height, colors, sat, bright):
    cells = [despeckle(c) for c in cells]
    boxes = [c.getchannel('A').point(lambda v: 255 if v > 100 else 0).getbbox() for c in cells]
    x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes); x1 = max(b[2] for b in boxes); y1 = max(b[3] for b in boxes)
    sc = height / (y1 - y0); tw, th = max(8, round((x1 - x0) * sc)), height
    small = []
    for c in cells:
        c = c.crop((x0, y0, x1, y1)); rgb = c.convert('RGB'); a = c.getchannel('A')
        rgb = ImageEnhance.Color(rgb).enhance(sat); rgb = ImageEnhance.Brightness(rgb).enhance(bright)
        rgb = rgb.resize((tw, th), Image.BOX); a = a.resize((tw, th), Image.BOX).point(lambda v: 255 if v > 150 else 0)
        small.append((rgb, a))
    mosaic = Image.new('RGB', (tw * len(small), th)); [mosaic.paste(r, (i * tw, 0)) for i, (r, a) in enumerate(small)]
    pal = mosaic.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    outs = []
    for rgb, a in small:
        q = rgb.quantize(palette=pal, dither=Image.Dither.NONE).convert('RGB')
        o = Image.new('RGBA', (tw + 2, th + 2), (0, 0, 0, 0)); o.paste(q, (1, 1), a)
        al = np.asarray(o)[..., 3] > 0; px = np.asarray(o).copy(); px[ndi.binary_dilation(al) & ~al] = (12, 14, 20, 255)
        outs.append(Image.fromarray(px))
    return outs

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('glb'); ap.add_argument('name')
    ap.add_argument('--views', type=int, default=8); ap.add_argument('--height', type=int, default=96); ap.add_argument('--colors', type=int, default=28)
    ap.add_argument('--faces', type=int, default=30000); ap.add_argument('--yaw', type=int, default=270, help='rotation of the first (south) view')
    ap.add_argument('--elev', type=int, default=12); ap.add_argument('--sat', type=float, default=.8); ap.add_argument('--bright', type=float, default=.92)
    ap.add_argument('--out', default=None); ap.add_argument('--install', action='store_true'); ap.add_argument('--size', type=int, default=512)
    o = ap.parse_args(); t = time.time()
    glb = o.glb
    if o.faces and os.path.getsize(glb) > 4_000_000:
        small = os.path.join(HERE, '_simplified.glb'); subprocess.run([sys.executable, '-P', os.path.join(HERE, 'decimate.py'), glb, small, str(o.faces)], check=True); glb = small
    cells = render(glb, o.views, o.yaw, o.size, o.elev); outs = pixelize(cells, o.height, o.colors, o.sat, o.bright)
    out = o.out or os.path.join(HERE, 'out_' + o.name); os.makedirs(out, exist_ok=True)
    names = D8 if o.views == 8 else ['a%d' % (i * 360 // o.views) for i in range(o.views)]
    for n, im in zip(names, outs): im.save(os.path.join(out, '%s_%s_0.png' % (o.name, n)))
    print('wrote', len(outs), 'views', outs[0].size, 'to', out, '%.0fs' % (time.time() - t))
    if o.install and o.views == 8:
        ud = os.path.join(ROOT, o.name); os.makedirs(ud, exist_ok=True)
        for n, im in zip(names, outs): im.save(os.path.join(ud, '%s_0.png' % n))
        subprocess.run([sys.executable, os.path.join(HERE, '..', 'build_manifest.py'), ROOT], check=True, stdout=subprocess.DEVNULL)
if __name__ == '__main__':
    main()
