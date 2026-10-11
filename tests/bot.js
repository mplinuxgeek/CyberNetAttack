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
const REAL = { setTimeout, setInterval, clearInterval };   // (the headless bot stubs timers; --watch needs the real ones)
global.setTimeout = () => {}; global.setInterval = () => 0; global.clearInterval = noop;

const args = process.argv.slice(2);
const KNOWN = ['max-sector', 'attempts', 'time', 'assist', 'seed', 'why', 'form', 'start', 'up', 'help', 'watch', 'speed', 'mute', 'chrome', 'port', 'size', 'shot', 'shot-after', 'headless', 'verbose', 'level-time', 'slow-time', 'slow-levels', 'capture'], ALIAS = { max: 'max-sector', levels: 'max-sector', sectors: 'max-sector' };
if (args.includes('--help') || args.includes('-h')) {
  console.log(`usage: node tests/bot.js [options]
  --max-sector N   stop after clearing sector N (default 100; aliases --max, --levels)
  --start N        begin at sector N (default 1)
  --up L           begin with every upgrade at level L (to test a late sector)
  --attempts N     tries per sector before buying upgrades (default 3)
  --time S         optional wall-clock budget in seconds (default: none, runs until the cap; Ctrl+C to stop)
  --level-time S   give up on one attempt after S simulated seconds (default 900; raise it for very high sectors)
  --slow-time S    also buy an upgrade round when the last --slow-levels cleared sectors each took longer than S game seconds (default 300 = 5 minutes; 0 turns the rule off)
  --slow-levels N  how many slow sectors in a row trigger it (default 3)
  --seed N         random seed (default 11)
  --form F         free | v | col | wall (default v)
  --assist         keep the game's "machines get weaker after a loss" help (off by default)
  --watch          play it in a Chrome window instead (same bot, same rules); with --speed N (1-16, default 1 = normal game speed),
                   --mute, --chrome PATH, --size W,H. In the window: ] faster, [ slower, H hides the panel
  --why            print what killed the squad or what a timed-out run was stuck on`); process.exit(0);
}
for (const a of args) if (a.startsWith('--')) { const k = ALIAS[a.slice(2)] || a.slice(2); if (!KNOWN.includes(k)) { console.error('unknown option ' + a + ' (try --help)'); process.exit(2); } }
if (args.includes('--watch')) { Object.assign(global, REAL); require('../tools/watch.js')(args); return; }   // the same bot, drawn in a Chrome window
const opt = (k, d) => { let i = args.indexOf('--' + k); if (i < 0) for (const a in ALIAS) if (ALIAS[a] === k && args.indexOf('--' + a) >= 0) i = args.indexOf('--' + a); return i < 0 ? d : (typeof d === 'boolean' ? true : +args[i + 1]); };
const WHY = opt('why', false), MAXLV = opt('max-sector', 100), ATT = opt('attempts', 3), BUDGET = opt('time', 0) > 0 ? opt('time', 0) * 1000 : Infinity, ASSIST = opt('assist', false);
const LEVELT = opt('level-time', 900), SLOWT = opt('slow-time', 300), SLOWN = opt('slow-levels', 3);
const FORM = (args.indexOf('--form') >= 0 ? args[args.indexOf('--form') + 1] : 'v');
let seed = opt('seed', 11); Math.random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

const src = fs.readFileSync(require('path').join(__dirname, '..', 'game.js'), 'utf8') + `
;globalThis.__t={update,startLevel,useItem,cycleForm,squadHalf,armoryBuy,UPS,ET,ITEMS,bigFoe,bossShielded,CLASS,get save(){return save},get G(){return G},get state(){return state},WEAPONS};`;
eval(src); const t = globalThis.__t, save = t.save;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const LANE = 205;

// ------------------------------------------------------------------ the pilot (tools/botlib.js)
const bot = require('../tools/botlib.js')(t);
const pilot = bot.pilot, useItems = bot.useItems; let DBG = ''; const dbgNow = () => bot.dbg();

// ------------------------------------------------------------------ one attempt at a sector
const ORDER = Object.keys(t.UPS);   // every upgrade path, in the Armory's order
const ABBR = { squad: 'Sq', dmg: 'Dm', rate: 'Fr', weapon: 'Wp', guard: 'Gu', emp: 'Or', plate: 'Pl', rein: 'Rn', gate: 'Gi', crit: 'Mk', cache: 'Qm', breaker: 'Bb', orbital: 'Ou', overdrive: 'Od' };
let STOP = false;   // Ctrl+C: finish up, print the summary (a second Ctrl+C quits at once)
process.on('SIGINT', () => { if (STOP) process.exit(130); STOP = true; console.log('\n^C: stopping, summary follows (press Ctrl+C again to quit immediately)...'); });
const tick = () => new Promise(r => setImmediate(r));   // the simulation is synchronous: yielding now and then is what lets Ctrl+C be heard
async function attempt(lv, farm) {
  if (!ASSIST) save.fails[lv] = 0;
  t.startLevel(lv); let G = t.G; G.form = FORM;
  let stuckN = 0, stall = null; const t0 = Date.now(); let f = 0, pn = G.n; const drops = [];
  let aborted = false;
  for (; f < 60 * LEVELT && t.state === 'play'; f++) {
    G = t.G;
    if (f % 300 === 0) { await tick(); if (STOP) { aborted = true; break; } }
    if (WHY && G.n < pn - 2) { const g = G.gates.find(g => !g.used); drops.push(`f${f} -${pn - G.n} dist ${G.dist.toFixed(0)} gate ${g ? Math.round(g.wz - G.dist) : '-'} near ${G.en.filter(e => !e.dead).sort((a, b) => a.wz - b.wz).slice(0, 2).map(e => e.t + '@' + Math.round(e.wz - G.dist)).join(',')}`); } pn = G.n;
    if (f % 4 === 0 && !G.sweep && !G.over) { pilot(G); useItems(G); }
    if (WHY && f % 60 === 0) { // stall detector: held by a machine for 60 s with almost no progress on it
      const bl = G.en.filter(e => !e.dead && (t.ET[e.t].block || e.boss) && e.wz - G.dist < t.ET[e.t].hold + 70).sort((a, b) => a.wz - b.wz)[0];
      if (bl && G.spd < 3) { const fr = (bl.hp + (bl.plate || 0)) / (bl.max + (bl.plateMax || 0)); if (stall && stall.e === bl) { if (f - stall.f >= 3600) { if (stall.fr - fr < .03) console.log(`    STALL 60 s: ${bl.t}${bl.boss ? '*' : ''}@${Math.round(bl.wz - G.dist)} x ${bl.x.toFixed(2)} px ${G.px.toFixed(2)} hp ${(fr * 100).toFixed(0)}% (was ${(stall.fr * 100).toFixed(0)}%) form ${bl.form || '-'} stun ${bl.stun || 0} shielded ${t.bossShielded(bl)} plate ${bl.plateMax ? Math.round(bl.plate / bl.plateMax * 100) + '%' : '-'} n ${G.n} item ${G.item ? G.item.k : '-'} en ${G.en.filter(e => !e.dead).length} dbg[${dbgNow()}]`); stall = { e: bl, f, fr }; } } else stall = { e: bl, f, fr }; } else stall = null;
    }
    if (WHY && f % 4 === 0 && G.spd < 3 && !G.over) { const w = bot.why(); if (w && w.tgt && Math.abs(G.px - w.tgt.x) > .5) { stuckN++; if (stuckN === 75) { const i0 = w.xs.findIndex(x => x >= w.tgt.x), ip = w.xs.findIndex(x => x >= G.px); console.log(`    OFF-TARGET 5 s: px ${G.px.toFixed(2)} target ${w.tgt.t}${w.tgt.boss ? '*' : ''} x ${w.tgt.x.toFixed(2)} want ${w.want === null ? '-' : w.want.toFixed(2)} w${w.ww}; cost at px ${w.cost[ip].toFixed(1)}, at target ${w.cost[i0].toFixed(1)}; bolts ${G.bolts.length} strikes ${G.strikes.length} haz ${G.haz.filter(h => !h.dead).length} pups ${G.pups.map(p => p.k + '@' + Math.round(p.wz - G.dist)).join(',')} en ${G.en.filter(e => !e.dead).slice(0, 6).map(e => e.t + '@' + Math.round(e.wz - G.dist) + 'x' + e.x.toFixed(2)).join(' ')}`); } } else stuckN = 0; }
    t.update(1 / 60);
    if (WHY && f % 1200 === 0) { const b = G.en.find(e => e.boss && !e.dead && e.wz - G.dist < 800); if (b) console.log(`    boss t=${(f / 60) | 0}s hp ${(b.hp / b.max * 100).toFixed(0)}% plate ${b.plateMax ? (b.plate / b.plateMax * 100).toFixed(0) : '-'}% x ${b.x.toFixed(2)} px ${G.px.toFixed(2)} n ${G.n} dbg[${dbgNow()}] bolts ${G.bolts.length} strikes ${G.strikes.length} en ${G.en.length}`); }
  }
  G = t.G;
  if (WHY && !G.won) { console.log('    drops: ' + drops.slice(-5).join(' | ')); if (t.state === 'play') console.log('    stuck: dist ' + G.dist.toFixed(0) + '/' + G.L + ' spd ' + G.spd.toFixed(1) + ' en ' + G.en.filter(e => !e.dead).sort((a, b) => a.wz - b.wz).slice(0, 4).map(e => `${e.t}${e.boss ? '*' : ''}@${Math.round(e.wz - G.dist)} hp${Math.round(e.hp)}/${Math.round(e.max)}${e.form ? ' ' + e.form : ''}${e.stun > 0 ? ' stun' : ''}`).join(', ') + ' | gates ' + G.gates.filter(g => !g.used).length + ' | boss ' + G.en.filter(e => e.boss && !e.dead).map(e => `${e.t}@${Math.round(e.wz - G.dist)} hp${Math.round(e.hp)}/${Math.round(e.max)} plate${Math.round(e.plate || 0)}/${Math.round(e.plateMax || 0)} shielded ${t.bossShielded(e)} gl${e.gl} stun${e.stun || 0}`).join(';')); }
  return { won: !!G.won && !aborted, frames: f, left: G.n, peak: G.peak, kills: G.kills, scrap: G.scrap, lost: G.lostN || 0, ms: Date.now() - t0, timeout: t.state === 'play' && !aborted, aborted, farm: !!farm };
}
const upLine = () => ORDER.map(k => (ABBR[k] || k) + save.up[k]).join(' ');
const T0 = Date.now(); let runs = 0, farmed = 0, rounds = 0; const hist = [];
function log(s) { console.log(s); }
let spent = 0; const timeline = [];
function upgradeRound(atLv, why) {
  rounds++; let bought = []; const before = save.scrap;
  for (const k of ORDER) { const u = t.UPS[k]; if (save.up[k] < u.max && save.scrap >= u.cost(save.up[k])) { if (t.armoryBuy(k)) bought.push(k); } }
  spent += before - save.scrap; timeline.push({ round: rounds, why, before: atLv, bought: bought.slice(), line: upLine(), cost: before - save.scrap });
  return bought;
}
function cheapestNeed() { let m = 1e9; for (const k of ORDER) { const u = t.UPS[k]; if (save.up[k] < u.max) m = Math.min(m, u.cost(save.up[k])); } return m; }
const allMaxed = () => ORDER.every(k => save.up[k] >= t.UPS[k].max);

(async () => {
log(`bot: sectors up to ${MAXLV}, ${ATT} attempts per sector before upgrading, ${ASSIST ? 'with' : 'without'} the retry assist, seed ${opt('seed', 11)}`);
if (opt('up', 0)) for (const k of ORDER) save.up[k] = save.paid[k] = Math.min(t.UPS[k].max, opt('up', 0));   // --up N: start with every upgrade at level N (for diagnosing a late sector)
let slowRun = []; let lv = opt('start', 1), best = 0, fails = 0, exhausted = false;
while (lv <= MAXLV && Date.now() - T0 < BUDGET && !exhausted && !STOP) {
  let won = false;
  for (let a = 1; a <= ATT && !won; a++) {
    const r = await attempt(lv); if (r.aborted) { STOP = true; break; } runs++; won = r.won; hist.push({ lv, ...r });
    log(`  S${String(lv).padStart(2)} try ${a}  ${won ? 'WON ' : r.timeout ? 'TIME' : 'LOST'}  squad ${String(r.left).padStart(3)}/${String(r.peak).padStart(3)}  kills ${String(r.kills).padStart(3)}  ${(r.frames / 60).toFixed(0)}s  scrap ${save.scrap}  [${upLine()}]  (${r.ms} ms)`);
    if (Date.now() - T0 > BUDGET) break;
  }
  if (won) {
    best = lv; lv++; fails = 0;
    const lastWin = [...hist].reverse().find(h => !h.farm && h.won); slowRun.push(lastWin ? lastWin.frames / 60 : 0);
    if (SLOWT > 0 && slowRun.length >= SLOWN && slowRun.slice(-SLOWN).every(x => x > SLOWT)) {   // sectors are taking too long: buy a round now rather than wait for a loss
      const b = upgradeRound(lv, 'slow'); slowRun = [];
      if (b.length) log(`  >> upgrade round ${rounds} before sector ${lv} (the last ${SLOWN} sectors each took over ${Math.round(SLOWT / 60 * 10) / 10} min): bought ${b.join(', ')}  [${upLine()}]  scrap ${save.scrap}`);
    }
    continue;
  }
  if (Date.now() - T0 > BUDGET) break;
  // could not pass: upgrade one step of everything it can afford, farming earlier sectors for scrap if it cannot afford anything
  let bought = upgradeRound(lv), farmRuns = 0;
  while (!bought.length && !allMaxed() && farmRuns < 40 && Date.now() - T0 < BUDGET && !STOP) {
    const fl = Math.max(1, Math.min(lv - 1, save.best - 1) || 1), r = await attempt(fl, true); if (r.aborted) break; hist.push({ lv: fl, ...r }); runs++; farmRuns++; farmed++;
    if (farmRuns % 5 === 0) log(`  ...farming sector ${fl} for scrap: ${save.scrap} / ${cheapestNeed()}`);
    if (save.scrap >= cheapestNeed()) bought = upgradeRound(lv);
  }
  if (STOP) break;
  if (!bought.length) { log(`  nothing left to buy or farm: stopping at sector ${lv}`); exhausted = true; break; }
  fails++;
  log(`  >> upgrade round ${rounds} before sector ${lv}: bought ${bought.join(', ')}  [${upLine()}]  scrap ${save.scrap}`);
  if (allMaxed() && fails > 3) { log('  all upgrades maxed and still losing'); break; }
}

const why = STOP ? 'stopped with Ctrl+C' : best >= MAXLV ? 'reached --max-sector' : Date.now() - T0 >= BUDGET ? `ran out of time (--time ${BUDGET / 1000} s; raise it)` : exhausted ? 'nothing left to buy or farm' : 'stopped';
log(`\nRESULT: cleared sector ${best} (${why}) in ${((Date.now() - T0) / 1000).toFixed(0)} s, ${runs} runs (${farmed} farming), ${rounds} upgrade rounds`);

// ------------------------------------------------------------------ the end-of-run report (also what Ctrl+C prints)
const fmtT = sec => { sec = Math.round(sec); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60); return (h ? h + 'h ' : '') + (m || h ? m + 'm ' : '') + (sec % 60) + 's'; };
const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '-';
const avg = (a, f) => a.length ? a.reduce((x, y) => x + f(y), 0) / a.length : 0;
function summary() {
  const real = hist.filter(h => !h.farm), won = real.filter(h => h.won), tmo = real.filter(h => h.timeout), lostH = real.filter(h => !h.won && !h.timeout);
  const wall = (Date.now() - T0) / 1000, sim = hist.reduce((a, h) => a + h.frames, 0) / 60;
  const bySec = {}; for (const h of real) (bySec[h.lv] = bySec[h.lv] || []).push(h);
  const sectors = Object.keys(bySec).map(Number).sort((a, b) => a - b), top = sectors.length ? sectors[sectors.length - 1] : 0;
  const first = sectors.filter(l => bySec[l][0].won).length;
  const why = STOP ? 'stopped with Ctrl+C' : best >= MAXLV ? 'reached --max-sector' : Date.now() - T0 >= BUDGET ? `ran out of time (--time ${BUDGET / 1000} s)` : exhausted ? 'nothing left to buy or farm' : 'stopped';
  const L = [];
  L.push('', '================ BOT SUMMARY ================');
  L.push(`Cleared sector ${best} (${why}); furthest sector attempted ${top}; threat tier ${Math.floor(best / 10)} (enemy health +${Math.floor(best / 10) * 10}%)`);
  L.push(`Wall time ${fmtT(wall)}; simulated play ${fmtT(sim)} (${wall > 0 ? (sim / wall).toFixed(0) : '-'}x real time)`);
  L.push(`Runs ${hist.length} (${hist.length - real.length} farming): sector attempts ${real.length}, won ${won.length} (${pct(won.length, real.length)}), lost ${lostH.length}, timed out ${tmo.length}`);
  L.push(`Sectors passed first try ${first} of ${sectors.length} attempted (${pct(first, sectors.length)}); attempts per cleared sector ${best ? (real.filter(h => h.lv <= best).length / best).toFixed(2) : '-'}`);
  L.push(`Machines destroyed ${real.reduce((a, h) => a + h.kills, 0)}; soldiers lost ${real.reduce((a, h) => a + h.lost, 0)}; avg squad left after a win ${Math.round(avg(won, h => h.left))}`);
  if (won.length) { const c = won.map(h => h.frames / 60); L.push(`Clear time (game seconds): average ${Math.round(avg(won, h => h.frames / 60))}, fastest ${Math.round(Math.min(...c))} (sector ${won[c.indexOf(Math.min(...c))].lv}), slowest ${Math.round(Math.max(...c))} (sector ${won[c.indexOf(Math.max(...c))].lv})`); }
  L.push(`Scrap: earned ${save.scrap + spent}, spent on upgrades ${spent}, left ${save.scrap}`);
  L.push(`Upgrades: ${ORDER.map(k => `${t.UPS[k].name} ${save.up[k]}/${t.UPS[k].max}`).join(', ')}`);
  if (timeline.length) { L.push('', 'Upgrade rounds (one level of each affordable path; after a sector beat the bot ' + ATT + ' times' + (SLOWT > 0 ? ', or after ' + SLOWN + ' sectors in a row took over ' + Math.round(SLOWT / 60 * 10) / 10 + ' min' : '') + '):'); for (const r of timeline) L.push(`  round ${String(r.round).padStart(2)} before sector ${String(r.before).padStart(3)}${r.why === 'slow' ? ' (slow clears)' : ''}: ${r.bought.length ? r.bought.join(', ') : '(nothing affordable)'}`); }
  else L.push('', 'No upgrades were needed (no sector beat the bot ' + ATT + ' times in a row).');
  if (sectors.length) {
    L.push('', 'By sector band:   attempts  wins  win%   first-try%  avg clear  avg squad left');
    const bands = {}; for (const l of sectors) (bands[Math.floor((l - 1) / 10)] = bands[Math.floor((l - 1) / 10)] || []).push(l);
    for (const b of Object.keys(bands).map(Number).sort((x, y) => x - y)) {
      const ls = bands[b], hs = [].concat(...ls.map(l => bySec[l])), w = hs.filter(h => h.won), ft = ls.filter(l => bySec[l][0].won).length;
      L.push(`  ${String(b * 10 + 1).padStart(4)}-${String(b * 10 + 10).padEnd(4)}      ${String(hs.length).padStart(5)}  ${String(w.length).padStart(5)}  ${pct(w.length, hs.length).padStart(5)}   ${pct(ft, ls.length).padStart(9)}   ${(w.length ? fmtT(avg(w, h => h.frames / 60)) : '-').padStart(8)}   ${w.length ? String(Math.round(avg(w, h => h.left))).padStart(6) : '-'}`);
    }
    const hard = sectors.map(l => ({ l, n: bySec[l].length, t: bySec[l].filter(h => h.timeout).length, w: bySec[l].some(h => h.won) })).filter(x => x.n > 1).sort((a, b) => b.n - a.n).slice(0, 6);
    if (hard.length) { L.push('', 'Hardest sectors (most attempts):'); for (const h of hard) L.push(`  sector ${String(h.l).padStart(3)}: ${h.n} attempts (${h.t} timed out), ${h.w ? 'cleared' : 'NOT cleared'}`); }
    const slow = real.filter(h => h.timeout).length; if (slow) L.push('', `Note: ${slow} attempts hit the ${LEVELT}-second per-attempt limit (--level-time); those are slow clears or stalls, not necessarily deaths.`);
  }
  console.log(L.join('\n'));
}
summary();
})();
