// Watch the bot play: loaded into the real game page by `node tests/bot.js --watch` (see tools/watch.js).
// Same brain as the headless bot (tools/botlib.js), same progression rules, but it drives the live game and you see every frame.
// Keys: ] faster   [ slower   H hide this panel   C capture a screenshot + game state   P pause (the game's own pause)
(function () {
  const q = new URLSearchParams(location.search);
  const num = (k, d) => (q.has(k) && Number.isFinite(+q.get(k)) ? +q.get(k) : d);
  const OPT = { max: num('max', 100), start: num('start', 1), up: num('up', 0), attempts: num('attempts', 3), speed: Math.max(1, Math.min(16, num('speed', 1))), form: q.get('form') || 'v', levelTime: num('leveltime', 900), slowTime: num('slowtime', 300), slowLevels: num('slowlevels', 3), assist: q.has('assist'), mute: q.has('mute') };
  const bot = makeBot({ squadHalf, ET, bigFoe, bossShielded, useItem });
  const ORDER = Object.keys(UPS), ABBR = { squad: 'Sq', dmg: 'Dm', rate: 'Fr', weapon: 'Wp', guard: 'Gu', emp: 'Or', plate: 'Pl', rein: 'Rn', gate: 'Gi', crit: 'Mk', cache: 'Qm', breaker: 'Bb', orbital: 'Ou', overdrive: 'Od' };
  let slowRun = [], lv = OPT.start, playLv = OPT.start, tries = 0, best = 0, runs = 0, rounds = 0, wins = 0, losses = 0, started = false, handled = true, done = '', speed = OPT.speed, frame = 0, farming = false, last = '';
  if (OPT.mute) save.mute = true;

  let canvases = 0; { const ce0 = document.createElement.bind(document); document.createElement = (t, o) => { if (String(t).toLowerCase() === 'canvas') canvases++; return ce0(t, o); }; }   // leak check: offscreen canvases created so far
  const errs = []; const ce = console.error; console.error = (...a) => { errs.push(String((a[0] && a[0].stack) || a[0]).split('\n').slice(0, 3).join(' | ').slice(0, 300)); ce.apply(console, a); };
  window.addEventListener('error', e => errs.push('ERR ' + e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno));
  const hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;left:6px;top:6px;z-index:99;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;color:#9ff;background:rgba(0,8,12,.66);padding:6px 8px;border:1px solid #2a6a7a;border-radius:4px;pointer-events:none;white-space:pre;max-width:46vw';
  document.body.appendChild(hud);
  const upLine = () => ORDER.map(k => (ABBR[k] || k) + save.up[k]).join(' ');
  function paint() {
    if (hud.dataset.off) { hud.textContent = ''; return; }
    const g = (typeof G !== 'undefined' && G) ? G : null;
    hud.textContent = `BOT PLAYING  speed x${speed}  ( [ ] to change, H hides )\n` +
      `sector ${playLv}/${OPT.max}  try ${tries + 1}/${OPT.attempts}${farming ? '  (farming scrap)' : ''}  best ${best}\n` +
      `runs ${runs}  won ${wins}  lost ${losses}  upgrade rounds ${rounds}\n` + (g && state === 'play' ? `squad ${g.n}/${g.peak}  kills ${g.kills}  ${Math.round(g.dist)}/${g.L}\n` : '\n') +
      `${upLine()}\nscrap ${save.scrap}\n${done || last}` + `\ncanvases created ${canvases}` + (errs.length ? `\nJS ERRORS ${errs.length}: ${errs[errs.length - 1]}` : '');
    if (Date.now() - lastPost > 1500) { lastPost = Date.now(); try { fetch('/__status', { method: 'POST', body: hud.textContent || lastText, keepalive: true }).catch(() => {}); } catch (e) {} }
    lastText = hud.textContent || lastText;
  }
  let lastPost = 0, lastText = '';

  function begin() {
    if (done) return;
    if (!OPT.assist) save.fails[playLv] = 0;
    startLevel(playLv); G.form = OPT.form; ovHide(); handled = false; frame = 0; bot.reset();
  }
  function upgradeRound() { rounds++; const bought = []; for (const k of ORDER) { const u = UPS[k]; if (save.up[k] < u.max && save.scrap >= u.cost(save.up[k]) && armoryBuy(k)) bought.push(k); } return bought; }
  const allMaxed = () => ORDER.every(k => save.up[k] >= UPS[k].max);
  const cheapest = () => Math.min(1e9, ...ORDER.filter(k => save.up[k] < UPS[k].max).map(k => UPS[k].cost(save.up[k])));

  function result(kind) {
    handled = true; runs++;
    const won = kind === 'WON'; won ? wins++ : losses++;
    last = `last: sector ${playLv} ${kind}`;
    if (farming) { if (save.scrap >= cheapest()) { farming = false; const b = upgradeRound(); last = 'bought: ' + b.join(', '); } }
    else if (won) {
      best = lv; lv++; tries = 0; if (lv > OPT.max) { done = `DONE: cleared sector ${best} (reached the cap)`; paint(); return; }
      slowRun.push(G.t);
      if (OPT.slowTime > 0 && slowRun.length >= OPT.slowLevels && slowRun.slice(-OPT.slowLevels).every(x => x > OPT.slowTime)) { slowRun = []; const bb = upgradeRound(); if (bb.length) last = `upgrade round ${rounds} (slow clears): ${bb.join(', ')}`; }
    }
    else if (++tries >= OPT.attempts) {
      tries = 0; const b = upgradeRound();
      if (b.length) last = `upgrade round ${rounds}: ${b.join(', ')}`;
      else if (!allMaxed()) farming = true;
      else { done = `DONE: cleared sector ${best}; nothing left to buy`; paint(); return; }
    }
    playLv = farming ? Math.max(1, Math.min(lv - 1, best) || 1) : lv;   // farming replays an earlier sector for scrap
    setTimeout(begin, 1600);
  }

  // the bot steers and fires items four times a frame-step; extra steps give the speed-up
  const orig = update;
  function think() { if (!done && state === 'play' && G && !G.over && !G.sweep && !G.paused && (frame++ & 3) === 0) { bot.pilot(G); bot.useItems(G); } }
  update = function (dt) {
    think(); orig(dt);
    for (let i = 1; i < speed && state === 'play' && G && !G.paused; i++) { think(); orig(dt); }
  };

  setInterval(() => {
    if (done) { paint(); return; }
    if (!started && state === 'menu') { started = true; if (OPT.up) for (const k of ORDER) save.up[k] = save.paid[k] = Math.min(UPS[k].max, OPT.up); begin(); }
    else if (started && !handled) {
      if (state === 'end') result(G.won ? 'WON' : 'LOST');
      else if (state === 'play' && G && G.t > OPT.levelTime) result('TIME');
    }
    paint();
  }, 150);
  function capture() { // screenshot of the canvas (as drawn, HUD panel excluded) and the facts needed to explain a glitch
    try {
      const g = G, ens = g ? g.en.filter(e => !e.dead).slice(0, 40).map(e => ({ t: e.t, boss: !!e.boss, x: +e.x.toFixed(2), rel: Math.round(e.wz - g.dist), hp: Math.round(e.hp), max: Math.round(e.max), sc: e.sc, stun: e.stun, flash: e.flash, gl: e.gl, crash: e.crash })) : [];
      const state = { when: new Date().toISOString(), speed, sector: g && g.lv, n: g && g.n, dist: g && Math.round(g.dist), env: g && g.env, form: g && g.form, parts: g && g.parts.length, lights: g && g.lt.length, bullets: g && g.bullets.length, bolts: g && g.bolts.length, rockets: g && g.rockets.length, strikes: g && g.strikes.length, waves: g && g.waves.length, flash: g && g.flash, shake: g && g.shake, mz: g && g.mz, fx: save.fx, crt: save.crt, zoom: zoomLevel(), rs: RS, sizePx: [cv.width, cv.height], canvasesCreated: canvases, dpr: window.devicePixelRatio, enemies: ens };
      fetch('/__capture', { method: 'POST', body: JSON.stringify({ png: cv.toDataURL('image/png'), state }) }).catch(() => {});
      last = 'captured a screenshot (tests/captures)';
    } catch (e) { last = 'capture failed: ' + e.message; }
  }
  if (q.has('capture')) setTimeout(capture, num('capture', 10) * 1000);   // (for testing the capture path without a keyboard)
  window.addEventListener('keydown', e => {
    if (e.key === ']') speed = Math.min(16, speed + 1); else if (e.key === '[') speed = Math.max(1, speed - 1);
    else if (e.key === 'h' || e.key === 'H') hud.dataset.off = hud.dataset.off ? '' : '1';
    else if (e.key === 'c' || e.key === 'C') capture();
  });
})();
