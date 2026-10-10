// `node tests/bot.js --watch ...`: serve the game on a local port with the bot injected, and open it in a Chrome window.
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.css': 'text/css', '.ico': 'image/x-icon' };

module.exports = function watch(args) {
  const val = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; }, has = k => args.includes('--' + k);
  const alias = k => { for (const a of [k, ...(k === 'max-sector' ? ['max', 'levels', 'sectors'] : [])]) if (has(a)) return val(a); return undefined; };
  const qs = new URLSearchParams();
  for (const [k, p] of [['max', 'max-sector'], ['start', 'start'], ['up', 'up'], ['attempts', 'attempts'], ['speed', 'speed'], ['form', 'form'], ['leveltime', 'level-time']]) { const v = alias(p); if (v !== undefined) qs.set(k, v); }
  if (has('assist')) qs.set('assist', '1'); if (has('mute')) qs.set('mute', '1');
  const shot = val('shot'), headless = has('headless') || !!shot;

  const page = () => fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    .replace(/<script>if \("serviceWorker"[^]*?<\/script>/, '')   // no service worker: nothing cached between runs
    .replace('</body>', '<script src="tools/botlib.js"></script><script src="tools/botwatch.js"></script></body>');
  let status = '', lastLine = '';
  const srv = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/__status') { let b = ''; req.on('data', d => { if (b.length < 4000) b += d; }); req.on('end', () => { status = b; const m = /sector (\d+)\/\d+  try (\d+)\/\d+[^\n]*\nruns (\d+)  won (\d+)  lost (\d+)  upgrade rounds (\d+)/.exec(b); const line = m ? `sector ${m[1]} try ${m[2]}  runs ${m[3]} won ${m[4]} lost ${m[5]} upgrade rounds ${m[6]}` : ''; if (line && line !== lastLine && !headless) { lastLine = line; console.log(line); } res.writeHead(204); res.end(); }); return; }
    let u = decodeURIComponent(req.url.split('?')[0]); if (u === '/' || u === '/index.html') { res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' }); return res.end(page()); }
    const f = path.normalize(path.join(ROOT, u)); if (!f.startsWith(ROOT + path.sep) || /\/(tests|docs|\.git|node_modules)\//.test(f.replace(ROOT, '') + '/')) { res.writeHead(403); return res.end(); }
    fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(d); });
  });
  srv.listen(+val('port', 0) || 0, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${srv.address().port}/?${qs}`;
    const bins = [val('chrome'), process.env.CHROME, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome'].filter(Boolean);
    let bin = null; for (const b of bins) { try { if (cp.spawnSync(b, ['--version'], { stdio: 'ignore' }).status === 0) { bin = b; break; } } catch (e) {} }
    console.log('bot viewer: ' + url);
    if (!bin) { console.log('no Chrome/Chromium found: open the URL above in a browser (Ctrl+C here to stop).'); return; }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cna-watch-'));
    const flags = ['--user-data-dir=' + dir, '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--window-size=' + (val('size', '540,900'))];
    if (shot) flags.push('--headless=new', '--no-sandbox', '--disable-gpu', '--virtual-time-budget=' + Math.round(+val('shot-after', 30) * 1000), '--screenshot=' + shot);
    else if (headless) flags.push('--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=0');   // real-time headless run: the panel is printed after --shot-after seconds
    else flags.push('--app=' + url);
    flags.push(url);
    const ch = cp.spawn(bin, flags, { stdio: ['ignore', 'ignore', has('verbose') ? 'inherit' : 'ignore'] });
    if (headless && !shot) setTimeout(() => { console.log(status || '(no status received)'); stop(); }, Math.round(+val('shot-after', 30) * 1000));
    const stop = () => { if (status && !(headless && !shot)) console.log('\nlast bot panel:\n' + status); try { ch.kill(); } catch (e) {} try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} srv.close(); process.exit(0); };
    ch.on('exit', () => setTimeout(stop, 200)); process.on('SIGINT', stop);
    console.log('close the window (or Ctrl+C) to stop. Keys in the window: ] faster, [ slower, H hides the panel.');
  });
};
