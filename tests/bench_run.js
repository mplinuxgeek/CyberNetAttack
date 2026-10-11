// Run the in-game benchmark in Chrome and print the table in the terminal:  node tests/bench_run.js [--headless] [--chrome PATH] [--timeout 400]
// With a window (default) you see the ten sectors play; the browser caps drawing at the screen's refresh rate, so the "headroom fps" column (CPU work per frame) is the number that says how fast it could go.
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..'), args = process.argv.slice(2), has = k => args.includes('--' + k), val = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/__bench') { let b = ''; req.on('data', d => { b += d; }); req.on('end', () => { res.writeHead(204); res.end(); report(JSON.parse(b)); }); return; }
  let u = decodeURIComponent(req.url.split('?')[0]); if (u === '/') u = '/index.html'; if (u === '/sw.js') { res.writeHead(404); return res.end(); }
  const f = path.normalize(path.join(ROOT, u)); if (!f.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(d); });
});
let ch = null, dir = null;
function report(o) {
  const f = (v, d) => (v || 0).toFixed(d === undefined ? 1 : d), L = [];
  L.push('', `device: ${o.device.canvas} canvas, dpr ${o.device.dpr}, ${o.device.cores} cores, CRT ${o.device.crt ? 'on' : 'off'}, effects ${o.device.fx}`, '');
  L.push('sector  look                                  fps   1%low  work ms  render ms  headroom fps');
  for (const x of o.levels) L.push(String(x.lv).padEnd(7) + ' ' + x.look.padEnd(36) + f(x.fps).padStart(6) + f(x.low).padStart(8) + f(x.work).padStart(9) + f(x.rend).padStart(11) + f(x.head, 0).padStart(14));
  L.push('', `AVERAGE ${f(o.avg.fps)} fps, worst 1% low ${f(o.avg.low)} fps, ${f(o.avg.work)} ms of work per frame, headroom ${f(o.avg.head, 0)} fps${o.bad ? '  (' + o.bad + ')' : ''}`);
  console.log(L.join('\n')); stop(0);
}
function stop(code) { try { ch && ch.kill(); } catch (e) {} try { dir && fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} srv.close(); process.exit(code); }
srv.listen(0, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${srv.address().port}/index.html?bench&benchpost`;
  const bins = [val('chrome'), process.env.CHROME, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean); let bin = null;
  for (const b of bins) { try { if (cp.spawnSync(b, ['--version'], { stdio: 'ignore' }).status === 0) { bin = b; break; } } catch (e) {} }
  console.log('benchmark page: ' + url); if (!bin) { console.log('no Chrome found: open the address above in a browser and press the button; results appear on screen (Ctrl+C here to stop).'); return; }
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cna-bench-'));
  const fl = ['--user-data-dir=' + dir, '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--window-size=520,900'];
  if (has('headless')) fl.push('--headless=new', '--no-sandbox', '--disable-gpu'); else fl.push('--app=' + url);
  if (has('headless')) fl.push(url);
  ch = cp.spawn(bin, fl, { stdio: 'ignore' }); ch.on('exit', () => setTimeout(() => stop(1), 500)); process.on('SIGINT', () => stop(130));
  console.log('running 10 sectors, about 3 minutes' + (has('headless') ? ' (headless: software rendering, so the numbers are low)' : '') + '. Close the window to abort.');
  setTimeout(() => { console.log('timed out waiting for results'); stop(2); }, +val('timeout', 400) * 1000);
});
