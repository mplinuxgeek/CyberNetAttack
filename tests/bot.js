// A ruthless bot that plays Cyber Net Attack through the real simulation (no rendering) to measure how far a given power level gets.
//
//   node tests/bot.js                      # fresh save, no upgrades; upgrades only when a sector cannot be beaten
//   node tests/bot.js --max-sector 150 --seed 3 --attempts 3 --time 900 --assist
//
// Progression rules:
//   1. play sector 1, 2, 3 ... with no upgrades;
//   2. when a sector is lost `attempts` times, buy ONE level of every upgrade it can afford (squad, damage, fire rate, weapon,
//      reprogrammed unit, ordnance); if it cannot afford any it farms earlier sectors for scrap first;
//   3. retry; repeat until it passes, then carry on, to see how high it can get.
// Machines are not made easier by retries unless --assist is given (the game's "10% weaker per failure" help is off by default).
const fs = require('fs');
const noop = () => {};
const ctx = new Proxy({}, { get: (t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop: noop }) : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : (k === 'measureText' ? () => ({ width: 20 }) : (k in t ? t[k] : noop)), set: (t, k, v) => { t[k] = v; return true; } });
const el = () => ({ getContext: () => ctx, addEventListener: noop, style: {}, set innerHTML(v) {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 800 }), setPointerCapture: noop });
global.document = { getElementById: el, addEventListener: noop, hidden: false, querySelectorAll: () => [] };
global.window = { addEventListener: noop };
global.localStorage = { getItem: () => null, setItem: noop };
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = noop;
global.setTimeout = () => {}; global.setInterval = () => 0; global.clearInterval = noop;

const args = process.argv.slice(2);
const KNOWN = ['max-sector', 'attempts', 'time', 'assist', 'seed', 'why', 'form', 'start', 'up', 'help'], ALIAS = { max: 'max-sector', levels: 'max-sector', sectors: 'max-sector' };
if (args.includes('--help') || args.includes('-h')) {
  console.log(`usage: node tests/bot.js [options]
  --max-sector N   stop after clearing sector N (default 100; aliases --max, --levels)
  --start N        begin at sector N (default 1)
  --up L           begin with every upgrade at level L (to test a late sector)
  --attempts N     tries per sector before buying upgrades (default 3)
  --time S         optional wall-clock budget in seconds (default: none, runs until the cap; Ctrl+C to stop)
  --seed N         random seed (default 11)
  --form F         free | v | col | wall (default v)
  --assist         keep the game's "machines get weaker after a loss" help (off by default)
  --why            print what killed the squad or what a timed-out run was stuck on`); process.exit(0);
}
for (const a of args) if (a.startsWith('--')) { const k = ALIAS[a.slice(2)] || a.slice(2); if (!KNOWN.includes(k)) { console.error('unknown option ' + a + ' (try --help)'); process.exit(2); } }
const opt = (k, d) => { let i = args.indexOf('--' + k); if (i < 0) for (const a in ALIAS) if (ALIAS[a] === k && args.indexOf('--' + a) >= 0) i = args.indexOf('--' + a); return i < 0 ? d : (typeof d === 'boolean' ? true : +args[i + 1]); };
const WHY = opt('why', false), MAXLV = opt('max-sector', 100), ATT = opt('attempts', 3), BUDGET = opt('time', 0) > 0 ? opt('time', 0) * 1000 : Infinity, ASSIST = opt('assist', false);
const FORM = (args.indexOf('--form') >= 0 ? args[args.indexOf('--form') + 1] : 'v');
let seed = opt('seed', 11); Math.random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

const src = fs.readFileSync(require('path').join(__dirname, '..', 'game.js'), 'utf8') + `
;globalThis.__t={update,startLevel,useItem,cycleForm,squadHalf,armoryBuy,UPS,ET,ITEMS,bigFoe,bossShielded,CLASS,get save(){return save},get G(){return G},get state(){return state},WEAPONS};`;
eval(src); const t = globalThis.__t, save = t.save;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const LANE = 205;

// ------------------------------------------------------------------ the pilot
function gateValue(o, n) {
  switch (o.k) {
    case 'add': return o.v >= 0 ? o.v : o.v - Math.floor(n * .1);
    case 'mul': return n * (o.v - 1);
    case 'wpn': return 14 + n * .35;
    case 'rate': return 6 + n * .25;
    case 'dmg': return 6 + n * .3;
    case 'cls': return o.v + 6;
    default: return 0;
  }
}
function pilot(G) {
  const half = t.squadHalf(), xs = []; for (let x = -.88; x <= .881; x += .04) xs.push(+x.toFixed(3));
  const cost = new Array(xs.length).fill(0), add = (fn) => { for (let i = 0; i < xs.length; i++) cost[i] += fn(xs[i]); };
  const near = (x, c, w) => Math.abs(x - c) < w;
  // enemy fire: where each bolt will land, and when
  for (const b of G.bolts) { const tl = b.rz / 170, xl = b.x + b.vx * tl; if (tl > 1.7) continue; const wgt = (b.dmg || 1) * (tl < .9 ? 9 : 4); add(x => near(x, xl, half + .12) ? wgt : 0); }
  for (const s of G.strikes) { if (s.fire) continue; const w = s.r + half + .06, wgt = 12 * (s.dmg || 1); add(x => near(x, s.x, w) ? wgt : 0); }
  for (const h of G.haz) { if (h.dead) continue; const rel = h.wz - G.dist; if (rel > 190 || rel < -25) continue; const w = h.hw + half + .07, wgt = h.k === 'mine' ? 11 : 8; add(x => near(x, h.x, w) ? wgt : 0); }
  for (const o of G.obs) {
    if (o.dead) continue; const rel = o.wz - G.dist; if (rel > 280 || rel < -30) continue;
    if (o.k === 'cable') { if (!o.sq) add(x => near(x, o.x, o.hw + half) ? 7 : 0); }
    else if (o.k === 'overpass') { if (o.st === 1) for (let i = 0; i < 3; i++) if (i !== o.open) add(x => near(x, (i - 1) * .6, .3 + half) ? 16 : 0); }
    else if (o.k === 'rubble' || o.k === 'jersey' || o.k === 'slab') add(x => near(x, o.x, o.hw + half) ? (o.k === 'rubble' ? 2.2 : 3) : 0);
    else if (o.k === 'truck' || o.k === 'sandbag') add(x => near(x, o.x, o.hw + half) ? 2 : 0);
  }
  // machines that will reach the squad
  let tgt = null, tgtScore = -1e9;
  for (const e of G.en) {
    if (e.dead) continue; const d = t.ET[e.t], rel = e.wz - G.dist;
    if (rel > 800) continue;
    if (!d.hold && rel < 260 && rel > -10) { const w = d.hw * e.sc + half + .1, wgt = rel < 130 ? 9 : 4; add(x => near(x, e.x, w) ? wgt : 0); }   // walkers, crawlers, drones, blades
    if (d.grab && (e.gs === 'aim' || e.gs === 'lock' || e.gs === 'slam')) add(x => near(x, e.tx, .22 + half) ? 14 : 0);
    if (rel < 40) continue;
    const big = t.bigFoe(e) || e.boss, sc = (e.boss && !t.bossShielded(e) ? 400 : big ? 200 : 40) - rel * .3 - (e.t === 't1000' ? 0 : 0);
    if (sc > tgtScore) { tgtScore = sc; tgt = e; }
  }
  // what to head for: the better side of the next gate, otherwise the target, crates and scrap
  let want = null, ww = 0;
  const gate = G.gates.filter(g => !g.used && g.wz - G.dist > -5).sort((a, b) => a.wz - b.wz)[0];
  if (gate && gate.wz - G.dist < 900) {
    const lv = gateValue(gate.L, G.n), rv = gateValue(gate.R, G.n);
    want = (lv >= rv ? -1 : 1) * (.42 + Math.min(.2, half)); ww = 1.6;
    if (gate.wz - G.dist < 120) ww = 3;   // commit
  }
  if (!want && tgt) { want = tgt.x; ww = tgt.boss ? .9 : .5; }
  const blockWz = Math.min(1e9, ...G.en.filter(e => !e.dead && (t.ET[e.t].block || e.boss)).map(e => e.wz - t.ET[e.t].hold - 60 + G.dist * 0));   // a crate behind a machine that stops the squad cannot be reached
  const pu = G.pups.filter(p => p.wz - G.dist > 30 && p.wz - G.dist < 520 && p.wz < blockWz - 10).sort((a, b) => a.wz - b.wz)[0];
  if (pu && (!gate || gate.wz > pu.wz) && !G.sweep) { want = pu.x; ww = 1.1; }
  if (!want) { const sc = G.scr.filter(c => c.wz - G.dist > 0 && c.wz - G.dist < 360).sort((a, b) => a.wz - b.wz)[0]; if (sc) { want = sc.x; ww = .3; } }
  let best = 0, bc = 1e9;
  for (let i = 0; i < xs.length; i++) {
    let c = cost[i] + .12 * Math.abs(xs[i] - G.px) * 6 + .02 * Math.abs(xs[i]);
    if (want !== null) c += ww * 3 * Math.abs(xs[i] - want);
    if (c < bc) { bc = c; best = i; }
  }
  G.tx = xs[best]; DBG = `want ${want === null ? '-' : want.toFixed(2)} w${ww} tgt ${tgt ? tgt.t + (tgt.boss ? '*' : '') : '-'} cost ${bc.toFixed(1)} tx ${G.tx}`;
}
let DBG = '';

let lastItem = -9;
function useItems(G) {
  const it = G.item; if (!it || G.t - lastItem < .9 || G.over) return;
  const us = G.en.filter(e => !e.dead && e.wz - G.dist > 30 && e.wz - G.dist < 800);
  const big = us.filter(e => t.bigFoe(e) && !t.ET[e.t].fly), cnt = (r) => us.filter(e => e.wz - G.dist < r).length;
  const boss = us.find(e => e.boss), lane = us.filter(e => Math.abs(e.x - G.px) < .22);
  let go = false;
  switch (it.k) {
    case 'pulse': go = big.some(e => e.wz - G.dist < 360) || cnt(300) >= 5 || (G.n < G.peak * .4 && cnt(300) >= 2); break;
    case 'c4': { const armed = G.c4.filter(c => c.stuck && !c.dead); if (armed.length) { go = armed[0].fuse < 2.6; } else go = big.some(e => e.wz - G.dist < 520 && !t.bossShielded(e)); break; }
    case 'flare': go = us.filter(e => e.wz - G.dist > 160).length >= 5 || big.length >= 1 && us.length >= 3; break;
    case 'spike': go = !(G.guard && !G.guard.dead) && us.some(e => (e.t === 'grunt' || e.t === 'gunner') && e.wz - G.dist > 60 && e.wz - G.dist < 500); break;
    case 'cannon': go = lane.length >= 3 || lane.some(e => t.bigFoe(e) || e.boss); break;
    case 'nuke': { const zone = us.filter(e => e.wz - G.dist > 380 && e.wz - G.dist < 760); go = zone.length >= 8 || (boss && zone.some(e => e.boss) && big.length >= 1); break; }   // it lands 400+ px ahead and reaches about 340 px around that point
  }
  if (go && t.useItem()) lastItem = G.t;
}

// ------------------------------------------------------------------ one attempt at a sector
const ORDER = Object.keys(t.UPS);   // every upgrade path, in the Armory's order
const ABBR = { squad: 'Sq', dmg: 'Dm', rate: 'Fr', weapon: 'Wp', guard: 'Gu', emp: 'Or', plate: 'Pl', rein: 'Rn', gate: 'Gi', crit: 'Mk', cache: 'Qm' };
function attempt(lv) {
  if (!ASSIST) save.fails[lv] = 0;
  t.startLevel(lv); let G = t.G; G.form = FORM;
  const t0 = Date.now(); let f = 0, pn = G.n; const drops = [];
  for (; f < 60 * 480 && t.state === 'play'; f++) {
    G = t.G;
    if (WHY && G.n < pn - 2) { const g = G.gates.find(g => !g.used); drops.push(`f${f} -${pn - G.n} dist ${G.dist.toFixed(0)} gate ${g ? Math.round(g.wz - G.dist) : '-'} near ${G.en.filter(e => !e.dead).sort((a, b) => a.wz - b.wz).slice(0, 2).map(e => e.t + '@' + Math.round(e.wz - G.dist)).join(',')}`); } pn = G.n;
    if (f % 4 === 0 && !G.sweep && !G.over) { pilot(G); useItems(G); }
    t.update(1 / 60);
    if (WHY && f % 1200 === 0) { const b = G.en.find(e => e.boss && !e.dead && e.wz - G.dist < 800); if (b) console.log(`    boss t=${(f / 60) | 0}s hp ${(b.hp / b.max * 100).toFixed(0)}% plate ${b.plateMax ? (b.plate / b.plateMax * 100).toFixed(0) : '-'}% x ${b.x.toFixed(2)} px ${G.px.toFixed(2)} n ${G.n} dbg[${DBG}] bolts ${G.bolts.length} strikes ${G.strikes.length} en ${G.en.length}`); }
  }
  G = t.G;
  if (WHY && !G.won) { console.log('    drops: ' + drops.slice(-5).join(' | ')); if (t.state === 'play') console.log('    stuck: dist ' + G.dist.toFixed(0) + '/' + G.L + ' spd ' + G.spd.toFixed(1) + ' en ' + G.en.filter(e => !e.dead).sort((a, b) => a.wz - b.wz).slice(0, 4).map(e => `${e.t}${e.boss ? '*' : ''}@${Math.round(e.wz - G.dist)} hp${Math.round(e.hp)}/${Math.round(e.max)}${e.form ? ' ' + e.form : ''}${e.stun > 0 ? ' stun' : ''}`).join(', ') + ' | gates ' + G.gates.filter(g => !g.used).length + ' | boss ' + G.en.filter(e => e.boss && !e.dead).map(e => `${e.t}@${Math.round(e.wz - G.dist)} hp${Math.round(e.hp)}/${Math.round(e.max)} plate${Math.round(e.plate || 0)}/${Math.round(e.plateMax || 0)} shielded ${t.bossShielded(e)} gl${e.gl} stun${e.stun || 0}`).join(';')); }
  return { won: !!G.won, frames: f, left: G.n, peak: G.peak, kills: G.kills, scrap: G.scrap, lost: G.lostN || 0, ms: Date.now() - t0, timeout: t.state === 'play' };
}
const upLine = () => ORDER.map(k => (ABBR[k] || k) + save.up[k]).join(' ');
const T0 = Date.now(); let runs = 0, farmed = 0, rounds = 0; const hist = [];
function log(s) { console.log(s); }
function upgradeRound() {
  rounds++; let bought = [];
  for (const k of ORDER) { const u = t.UPS[k]; if (save.up[k] < u.max && save.scrap >= u.cost(save.up[k])) { if (t.armoryBuy(k)) bought.push(k); } }
  return bought;
}
function cheapestNeed() { let m = 1e9; for (const k of ORDER) { const u = t.UPS[k]; if (save.up[k] < u.max) m = Math.min(m, u.cost(save.up[k])); } return m; }
const allMaxed = () => ORDER.every(k => save.up[k] >= t.UPS[k].max);

log(`bot: sectors up to ${MAXLV}, ${ATT} attempts per sector before upgrading, ${ASSIST ? 'with' : 'without'} the retry assist, seed ${opt('seed', 11)}`);
if (opt('up', 0)) for (const k of ORDER) save.up[k] = save.paid[k] = Math.min(t.UPS[k].max, opt('up', 0));   // --up N: start with every upgrade at level N (for diagnosing a late sector)
let lv = opt('start', 1), best = 0, fails = 0, exhausted = false;
while (lv <= MAXLV && Date.now() - T0 < BUDGET && !exhausted) {
  let won = false;
  for (let a = 1; a <= ATT && !won; a++) {
    const r = attempt(lv); runs++; won = r.won; hist.push({ lv, ...r });
    log(`  S${String(lv).padStart(2)} try ${a}  ${won ? 'WON ' : r.timeout ? 'TIME' : 'LOST'}  squad ${String(r.left).padStart(3)}/${String(r.peak).padStart(3)}  kills ${String(r.kills).padStart(3)}  ${(r.frames / 60).toFixed(0)}s  scrap ${save.scrap}  [${upLine()}]  (${r.ms} ms)`);
    if (Date.now() - T0 > BUDGET) break;
  }
  if (won) { best = lv; lv++; fails = 0; continue; }
  if (Date.now() - T0 > BUDGET) break;
  // could not pass: upgrade one step of everything it can afford, farming earlier sectors for scrap if it cannot afford anything
  let bought = upgradeRound(), farmRuns = 0;
  while (!bought.length && !allMaxed() && farmRuns < 40 && Date.now() - T0 < BUDGET) {
    const fl = Math.max(1, Math.min(lv - 1, save.best - 1) || 1), r = attempt(fl); runs++; farmRuns++; farmed++;
    if (farmRuns % 5 === 0) log(`  ...farming sector ${fl} for scrap: ${save.scrap} / ${cheapestNeed()}`);
    if (save.scrap >= cheapestNeed()) bought = upgradeRound();
  }
  if (!bought.length) { log(`  nothing left to buy or farm: stopping at sector ${lv}`); exhausted = true; break; }
  fails++;
  log(`  >> upgrade round ${rounds} before sector ${lv}: bought ${bought.join(', ')}  [${upLine()}]  scrap ${save.scrap}`);
  if (allMaxed() && fails > 3) { log('  all upgrades maxed and still losing'); break; }
}
const why = best >= MAXLV ? 'reached --max-sector' : Date.now() - T0 >= BUDGET ? `ran out of time (--time ${BUDGET / 1000} s; raise it)` : exhausted ? 'nothing left to buy or farm' : 'stopped';
log(`\nRESULT: cleared sector ${best} (${why}) in ${((Date.now() - T0) / 1000).toFixed(0)} s, ${runs} runs (${farmed} farming), ${rounds} upgrade rounds`);
log(`upgrades: ${ORDER.map(k => `${t.UPS[k].name} ${save.up[k]}/${t.UPS[k].max}`).join(', ')}   scrap left ${save.scrap}`);
