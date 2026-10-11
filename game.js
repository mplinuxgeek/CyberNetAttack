'use strict';
// Cyber Net Attack - gate-runner shooter. Single canvas, no dependencies.

const W = 480, H = 800, HOR = 190, PY = 655, LANE = 205, K = 0.0058;
const cv = document.getElementById('c');
let RS = 1.4;   // render scale: the world is always 480x800; the canvas backing store is 480*RS by 800*RS
function setRS() { // match the backing store to the physical pixels the canvas is shown at (Retina phones, zoomed windows, CRT mode), in 0.05 steps so 3:5 holds exactly
  let rs = 1.4;
  try {
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 0, cssW = cv.clientWidth || (cv.getBoundingClientRect && cv.getBoundingClientRect().width) || 0;
    if (dpr && cssW) { const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches; rs = clamp(Math.round(cssW * dpr / W / .05) * .05, 1, coarse ? 1.6 : 2); }
  } catch (e) {}
  RS = Math.round(rs * 20) / 20;
  const w = Math.round(W * RS), h = Math.round(H * RS);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  return { w, h, rs: RS };
}
setRS();
if (typeof window !== 'undefined' && window.addEventListener) { let rt = 0; const re = () => { clearTimeout(rt); rt = setTimeout(setRS, 150); }; window.addEventListener('resize', re); window.addEventListener('orientationchange', re); }
const cx = cv.getContext('2d');
// Draw safety: one bad draw call (say a negative radius from an object far behind the squad) must never leave a clip, blend mode or unbalanced save() behind for every later frame.
let SAVED = 0; { const s0 = cx.save.bind(cx), r0 = cx.restore.bind(cx); cx.save = () => { SAVED++; s0(); }; cx.restore = () => { if (SAVED > 0) { SAVED--; r0(); } }; }
const DRAW_ERRS = {};
function safeDraw(f) {
  const d = SAVED;
  try { f(); } catch (e) { const k = String(e && e.message); if (!DRAW_ERRS[k]) { DRAW_ERRS[k] = 1; console.error(e); } }
  while (SAVED > d) cx.restore();
  cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over';
}
const $ = id => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(rnd(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const FONT = '"Arial Black", Impact, sans-serif';

// ---------------------------------------------------------------- save
const SAVE_KEY = 'cybernetattack.v1';
let save = { scrap: 0, best: 1, sel: 1, mute: false, crt: true, fails: {},
  up: { squad: 0, dmg: 0, rate: 0, weapon: 0, emp: 0, guard: 0 }, unlocked: { heavy: 1, tech: 1 }, loadout: ['heavy', 'tech'], paid: {}, stars: {} };
try {
  const s = JSON.parse(localStorage.getItem(SAVE_KEY));
  if (s) { save = Object.assign(save, s); save.up = Object.assign({ squad: 0, dmg: 0, rate: 0, weapon: 0, emp: 0, guard: 0 }, s.up || {}); save.unlocked = Object.assign({ heavy: 1, tech: 1 }, s.unlocked || {}); if (!Array.isArray(save.loadout)) save.loadout = ['heavy', 'tech']; save.stars = Object.assign({}, s.stars || {}); save.paid = Object.assign({}, s.paid || {}); for (const k of Object.keys(save.up)) save.paid[k] = Math.max(save.paid[k] || 0, save.up[k]); }   // paid = highest level ever bought for each upgrade
  if (s && s.crt === undefined) save.crt = true;
} catch (e) {}
function applyCRT() { const w = document.getElementById('wrap'); if (w && w.classList) w.classList.toggle('crt', !!save.crt); setRS(); }
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

// ---------------------------------------------------------------- data
const DMG_K = .12, RATE_K = .08, CRIT_K = .06, GATE_K = .08, SQUAD_K = 3, SIZE_DISCOUNT = .6;   // per-level strength of the Armory upgrades
const UPS = {
  squad:  { name: 'Squad Size',      desc: '+3 starting fighters',          max: 25, cost: l => Math.round(50 * Math.pow(1.3, l)) },
  dmg:    { name: 'Damage',          desc: '+12% weapon damage',            max: 40, cost: l => Math.round(70 * Math.pow(1.3, l)) },
  rate:   { name: 'Fire Rate',       desc: '+8% fire rate',                 max: 40, cost: l => Math.round(70 * Math.pow(1.3, l)) },
  weapon: { name: 'Starting Weapon', desc: 'Begin each run with a better gun. Max tier: Pulse-Plasma Rifle (40kW Output)', max: 4, cost: l => [200, 500, 1100, 2200][l] },
  guard:  { name: 'Reprogrammed Unit', desc: '+25% alloy plating on the infiltrator unit leading your squad', max: 15, cost: l => Math.round(80 * Math.pow(1.3, l)) },
  emp:    { name: 'Tactical Ordnance', desc: '+30% special-item power, supply crates drop more often', max: 15, cost: l => Math.round(90 * Math.pow(1.3, l)) },
  plate:  { name: 'Reactive Plating', desc: 'Start every sector with 2 hit-blocking plates per level', max: 12, cost: l => Math.round(120 * Math.pow(1.35, l)) },
  rein:   { name: 'Field Reinforcements', desc: 'Fallen soldiers are replaced by reserves, faster with each level', max: 10, cost: l => Math.round(100 * Math.pow(1.4, l)) },
  gate:   { name: 'Gate Intel', desc: 'Good gates give 8% more, bad gates take 8% less', max: 10, cost: l => Math.round(90 * Math.pow(1.4, l)) },
  crit:   { name: 'Marksmanship', desc: '+6% chance per level that a round lands for 2.5x damage', max: 10, cost: l => Math.round(110 * Math.pow(1.4, l)) },
  breaker:{ name: 'Boss Breaker', desc: '+6% damage per level against bosses and big machines (machines do not scale up to match it)', max: 25, cost: l => Math.round(150 * Math.pow(1.3, l)) },
  orbital:{ name: 'Orbital Uplink', desc: 'Automatic orbital strikes on the machines ahead: a share of their health, more targets and faster with each level', max: 20, cost: l => Math.round(200 * Math.pow(1.33, l)) },
  overdrive:{ name: 'Overdrive Cells', desc: 'OVERDRIVE (fire rate x1.8) switches itself on regularly, for longer and more often with each level', max: 15, cost: l => Math.round(180 * Math.pow(1.35, l)) },
  cache:  { name: 'Quartermaster', desc: 'Start every sector with a better special item', max: 8, cost: l => Math.round(150 * Math.pow(1.5, l)) },
};
const U = k => save.up[k] | 0;   // upgrade level, tolerant of older saves and test harness saves
const QM = [['pulse', 2], ['pulse', 3], ['pulse', 4], ['c4', 3], ['c4', 4], ['flare', 2], ['cannon', 1], ['cannon', 2], ['nuke', 1]];   // the starting item for each Quartermaster level
const WEAPONS = [
  { name: 'Sidearm',       dmg: 3,   int: .30,  pierce: false, splash: 0,   col: '#bfe3ff', spread: .01 },
  { name: 'SMG',           dmg: 2.5, int: .13,  pierce: false, splash: 0,   col: '#ffe08a', spread: .03 },
  { name: 'Assault Rifle', dmg: 5,   int: .16,  pierce: false, splash: 0,   col: '#ffd24a', spread: .015 },
  { name: 'Minigun',       dmg: 3.6, int: .065, pierce: false, splash: 0,   col: '#ffb02e', spread: .04 },
  { name: 'Pulse-Plasma Rifle', dmg: 14,  int: .22,  pierce: false, splash: .2,  col: '#6dffb5', spread: .01, plasma: true },
  { name: 'Rail Cannon',   dmg: 40,  int: .5,   pierce: true,  splash: 0,   col: '#9a8cff', spread: 0 },
];
const ET = {
  grunt:    { hp: 14,  spd: 17,  hw: .09, scrap: 3,   emp: 3,  chase: .12, name: 'T-800 Endoskeleton' },
  runner:   { hp: 3,   spd: 7,  hw: .07, scrap: 1,   emp: 1.5, chase: .2, name: 'T-800 Crawler' },
  gunner:   { hp: 30,  spd: 17,  hw: .09, scrap: 9,   emp: 6,  chase: .1, hold: 300, shoot: 2.2, dmg: 1, name: 'T-800 Infiltrator' },
  aerostat: { hp: 220, armor: .05, weave: .55, spd: 40,  hw: .09, scrap: 45,  emp: 15, chase: .06, hold: 270, shoot: 2.1, dmg: 1, fly: 1, name: 'Aerostat' },
  gunship:  { hp: 1000, armor: .25, weave: .3, spd: 30,  hw: .48,  scrap: 150,  emp: 30, chase: .05, hold: 320, shoot: 2.1, dmg: 1, volley: 3, fly: 1, name: 'HK-Aerial' },
  behemoth: { tracked: 1, mg: 1, hp: 500,  spd: 16, hw: .2,  scrap: 120, emp: 45, chase: .06, weave: .3, hold: 170, shoot: 2.7, dmg: 1, block: 1, burst: 1, armor: .05, soft: .7, name: 'T-1' },   // an early pre-war machine: a thin-skinned tracked minigun carrier, nothing like the later HK armour
  harvester:{ plate: .35, hp: 700, spd: 14, hw: .16, scrap: 400, emp: 0,  chase: .06, weave: .3, hold: 270, shoot: 3.0, dmg: 2, block: 1, armor: .2, grab: 1, name: 'Harvester' },
  heavy:    { hp: 650, armor: .25, plate: .5, spd: 18,  hw: .2,  scrap: 70,  emp: 25, chase: .1, weave: .35, hold: 110, shoot: 2.6, dmg: 2, block: 1, name: 'T-47' },
  tank:     { tracked: 1, hp: 1800, spd: 15, hw: .26, scrap: 240, emp: 50, chase: .05, weave: .3, hold: 190, shoot: 2.2, dmg: 2, block: 1, volley: 4, armor: .3, name: 'HK-Tank' },
  t700:     { hp: 95, armor: .2, spd: 15, hw: .1, scrap: 24, emp: 8, chase: .1, hold: 280, shoot: 1.5, dmg: 1, mg: 1, volley: 2, name: 'T-700 Endoskeleton' },   // armour-plated precursor with an SMG on each arm
  t1000:    { hp: 420, spd: 40, hw: .08, scrap: 110, emp: 20, chase: .3, stab: 1, show: 1, name: 'T-1000' },   // liquid metal: a charging blade stance, then bullet-proof chrome
  drone:    { hp: 9, spd: 60, hw: .06, scrap: 6, emp: 1, chase: .45, fly: 1, swarm: 1, name: 'HK Scout Drone' },   // swarm flyers that dive at the squad
  minelayer:{ tracked: 1, hp: 520, armor: .2, spd: 17, hw: .2, scrap: 120, emp: 30, chase: .05, weave: .3, hold: 300, block: 1, mines: 2.4, name: 'HK Minelayer' },
  t400:     { hp: 11, spd: 13, hw: .09, scrap: 4, emp: 2, chase: .1, fuel: 1, name: 'T-400 Maintenance Endo' },   // rusty droid carrying fuel cells that go up when it does
  centurion:{ plate: .4, hp: 1200, armor: .25, spd: 12, hw: .4, scrap: 450, emp: 0, chase: .06, weave: .25, hold: 230, shoot: 1.15, dmg: 2, block: 1, mg: 1, volley: 4, mortar: 1, name: 'HK-Centurion' },   // quad-legged boss: twin gatlings, side mortar pods
  ogre:     { tracked: 1, plate: .35, hp: 560, spd: 13, hw: .36, scrap: 320, emp: 0,  chase: .08, weave: .3, hold: 200, shoot: 2.0, dmg: 3, block: 1, volley: 3, name: 'The Ogre' },   // final boss: a three-storey tracked fortress
};
const CLASS = {   // special squad classes: pick up to 3 before a sector (unlock with scrap); gates then grow only your picks
  heavy:  { name: 'ORDNANCE',  col: '#ff9a4a', gate: 'rgba(255,140,40,.6)', spr: 'resistance_heavy', cost: 0,   desc: 'Homing rockets (splash) at armoured machines and bosses' },
  tech:   { name: 'TECH OP',   col: '#6ff3ff', gate: 'rgba(40,215,230,.6)', spr: 'resistance_tech',     cost: 0,   desc: 'Supply crates drop more often, wider scrap and gate pickup' },
  medic:  { name: 'FIELD MEDIC', col: '#6dffb5', gate: 'rgba(50,215,120,.6)', spr: 'resistance_medic',     cost: 120, desc: 'Revives fallen soldiers, repairs the reprogrammed unit, drops nanite repair kits when the squad is nearly gone' },
  shot:   { name: 'SHOTGUNNER', col: '#ffd27a', gate: 'rgba(255,200,90,.6)', spr: 'resistance_shotgunner',  cost: 150, desc: 'Close-range pellet bursts: huge damage up close' },
  mark:   { name: 'MARKSMAN',  col: '#b9a8ff', gate: 'rgba(160,140,255,.6)', spr: 'resistance_goggles', cost: 220, desc: 'Armour-piercing shots that punch through the whole line' },
  officer:{ name: 'OFFICER',   col: '#ff8f8f', gate: 'rgba(255,110,110,.6)', spr: 'resistance_captain', cost: 300, desc: 'Squad fires faster: +5% fire rate per officer (max +30%)' },
  gren:   { name: 'GRENADIER', col: '#c9d94a', gate: 'rgba(190,210,60,.6)', spr: 'resistance_heavy', cost: 260, desc: '40mm grenades that blow endoskeletons apart: they keep coming as crawlers' },
  hack:   { name: 'TECH-COM HACKER', col: '#4dffb0', gate: 'rgba(60,255,170,.6)', spr: 'resistance_tech', cost: 350, desc: 'Corrupts machine targeting: 15% of enemy plasma bolts miss, more with extra hackers' },
  sniper: { name: 'SCOUT SNIPER', col: '#ff9ad0', gate: 'rgba(255,140,200,.6)', spr: 'resistance_goggles', cost: 450, desc: 'Thermal scope: aimed shots hit machine and boss weak points for 2.5x critical damage' },
  demo:   { name: 'DEMOLITIONS', col: '#ffb347', gate: 'rgba(255,170,60,.6)', spr: 'resistance_captain', cost: 500, desc: 'All splash damage and C4 / mini-nuke blast radius +35%' },
  signal: { name: 'SIGNALLER', col: '#8fe8ff', gate: 'rgba(110,220,255,.6)', spr: 'resistance_signaller', cost: 400, desc: 'Calls air strikes on the machines ahead' },
};
const FORMS = {   // tactical formations: hitbox width, how wide the fire pattern is, how far rounds curve toward targets, scrap / gate pickup width
  free:  { name: 'FREE',   half: 1,    spread: 1,   cone: 1,   pick: 1 },
  v:     { name: 'V-SHAPE', half: 1.05, spread: 1,   cone: 1.6, pick: 1 },
  col:   { name: 'COLUMN', half: .55,  spread: .35, cone: .55, pick: .75 },
  wall:  { name: 'WALL',   half: 1.5,  spread: 1.8, cone: .8,  pick: 1.35 },
};
const FORM_ORDER = ['free', 'v', 'col', 'wall'];
const formK = () => FORMS[(G && G.form) || 'free'] || FORMS.free;
const CLS = Object.keys(CLASS);        // display / sprite order
const MAXPICK = 3;
const SQUAD_CONE = .22;   // how far off its own line (in lane widths) a squad round will curve toward a machine
const classStart = () => Math.max(2, Math.round((6 + SQUAD_K * save.up.squad) * .15));   // soldiers each picked class starts with: 2, growing with Squad Size upgrades
function sanitizeSave() { // a hand-edited, corrupted or older save can never break the game: every field is clamped to what is legal
  const n = (v, lo, hi, d) => Number.isFinite(+v) ? Math.min(hi, Math.max(lo, Math.floor(+v))) : d;
  if (!save.up || typeof save.up !== 'object') save.up = {}; if (!save.paid || typeof save.paid !== 'object') save.paid = {}; if (!save.fails || typeof save.fails !== 'object') save.fails = {}; if (!save.stars || typeof save.stars !== 'object') save.stars = {};
  if (!save.unlocked || typeof save.unlocked !== 'object') save.unlocked = {};
  save.scrap = n(save.scrap, 0, 1e9, 0); save.best = n(save.best, 1, 999, 1); save.sel = n(save.sel, 1, save.best, 1);
  for (const k of Object.keys(UPS)) { save.up[k] = n(save.up[k], 0, UPS[k].max, 0); save.paid[k] = n(Math.max(save.paid[k] || 0, save.up[k]), 0, UPS[k].max, 0); }
  for (const k of Object.keys(save.unlocked)) if (!CLASS[k]) delete save.unlocked[k]; save.unlocked.heavy = 1; save.unlocked.tech = 1;
  save.loadout = (Array.isArray(save.loadout) ? save.loadout : []).filter((k, i, a) => CLASS[k] && save.unlocked[k] && a.indexOf(k) === i).slice(0, MAXPICK);
  for (const k of Object.keys(save.stars)) save.stars[k] = n(save.stars[k], 0, 3, 0);
  save.mute = !!save.mute; save.crt = !!save.crt; save.v = 2; if (!FORMS[save.form]) save.form = 'free';
  if (!Array.isArray(save.presets)) save.presets = [];
  save.presets = [0, 1, 2].map(i => { const p = save.presets[i]; if (!p || !Array.isArray(p.l)) return null; return { l: p.l.filter((k, j, a) => CLASS[k] && a.indexOf(k) === j).slice(0, MAXPICK), f: FORMS[p.f] ? p.f : 'free' }; });
  save.chat = save.chat !== false;
  save.name = (typeof save.name === 'string' ? save.name : '').replace(/[^A-Za-z0-9 _.\-]/g, '').slice(0, 14).trim() || 'RESISTANCE';
  save.board = (Array.isArray(save.board) ? save.board : []).filter(b => b && Number.isFinite(+b.s)).map(b => ({ n: String(b.n || 'RESISTANCE').slice(0, 14), s: n(b.s, 0, 1e7, 0), sec: n(b.sec, 0, 500, 0), k: n(b.k, 0, 1e5, 0) })).sort((a, b) => b.s - a.s).slice(0, 10);
}
sanitizeSave();
const clsTotal = () => CLS.reduce((a, k) => a + (G.cls[k] || 0), 0);
const MUZ = { t700: { ox: 32, h: 42, alt: 1 }, centurion: { ox: 90, h: 86, alt: 1 }, gunner: { ox: 30, h: 40, fwd: 1 }, aerostat: { ox: 0, h: 66 }, gunship: { ox: 0, h: 112 }, heavy: { ox: 78, h: 74, alt: 1 }, tank: { ox: 66, h: 50, fwd: 1 }, behemoth: { ox: 50, h: 58, alt: 1 }, harvester: { ox: -50, h: 150, fwd: 1 }, overlord: { ox: 72, h: 76, alt: 1 } };   // muzzle offset (px) and height at scale 1; fwd = flips with facing
const HITH = { t700: 42, t1000: 44, drone: 26, minelayer: 60, t400: 38, centurion: 130, grunt: 40, gunner: 40, runner: 12, aerostat: 36, heavy: 80, tank: 60, gunship: 190, behemoth: 40, harvester: 105, ogre: 150 };
const GZ = 38;   // the reprogrammed unit walks point this far ahead of the squad
const SECT = ['Rubble Fields', 'Scrapyard', 'Dead City', 'Reactor Ring', 'Foundry', 'Black Bridge', 'Salt Flats', 'Server Vault', 'Drowned Metro', 'Core Gate'];
const PAL = [
  { sky: ['#04070f', '#0c1a2e', '#2d628a'], gnd: ['#2a3b50', '#111a24'] },
  { sky: ['#050a12', '#0b2230', '#2a7a8c'], gnd: ['#24393f', '#0e171c'] },
  { sky: ['#060616', '#14173a', '#3e4f9a'], gnd: ['#2c3252', '#121528'] },
];

// ---------------------------------------------------------------- audio
// haptics: Web Vibration API (Android Chrome and most Android browsers; iOS Safari and desktop ignore it)
let lastBuzz = 0;
function buzz(p, soft) {
  if (save.vib === false || typeof navigator === 'undefined' || !navigator.vibrate) return;
  const n = performance.now();
  if (soft) {   // firing is a ragged, uneven rattle: 1-3 very short pulses at irregular gaps, then a random pause
    if (n < lastBuzz) return;
    lastBuzz = n + 130 + Math.random() * 380;
    const k = 1 + Math.floor(Math.random() * 3); p = [];
    for (let i = 0; i < k; i++) { p.push(2 + Math.floor(Math.random() * 4)); if (i < k - 1) p.push(22 + Math.floor(Math.random() * 60)); }
  }
  if (!soft) lastBuzz = Math.max(lastBuzz, n + (Array.isArray(p) ? p.reduce((a, b) => a + b, 0) : p) + 60);   // let a heavy buzz finish before firing ticks resume (vibrate() replaces whatever is playing)
  try { navigator.vibrate(p); } catch (e) {}
}
// ---------------------------------------------------------------- audio (all synthesised: filtered noise for blasts and impacts, pitched tones for plasma, rings and chimes)
let AC = null, OUT = null, MUS = null, DL = null, DEST = null, NB = null, live = 0;
const gap = {};   // per-sound rate limits (ms)
function ok(name, ms) { const n = performance.now(); if (n - (gap[name] || 0) < ms) return false; gap[name] = n; return true; }
function audio() {
  if (save.mute) return null;
  try {
    if (!AC) {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      const cp = AC.createDynamicsCompressor(); cp.threshold.value = -16; cp.knee.value = 12; cp.ratio.value = 5; cp.attack.value = .003; cp.release.value = .14;   // stacked shots never clip
      OUT = AC.createGain(); OUT.gain.value = 1.5 * (save.vol === undefined ? 1 : save.vol);
      const sh = AC.createWaveShaper(), cv = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; cv[i] = Math.tanh(x * 2.6) / Math.tanh(2.6) * .9 + x * .1; } sh.curve = cv; sh.oversample = '2x';   // tube-style saturation: grit on every effect
      const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4800; lp.Q.value = .6;                                                           // no sparkle: the top end is rolled off
      const hs = AC.createBiquadFilter(); hs.type = 'lowshelf'; hs.frequency.value = 220; hs.gain.value = 5;                                                         // and the low end pushed up for weight
      OUT.connect(sh); sh.connect(hs); hs.connect(lp); lp.connect(cp); cp.connect(AC.destination);
      const ir = AC.createBuffer(2, Math.floor(AC.sampleRate * 1.1), AC.sampleRate); for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < d.length; i++) { const t = i / d.length; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * (i < 400 ? i / 400 : 1); } }
      const rv = AC.createConvolver(); rv.buffer = ir; const rg = AC.createGain(); rg.gain.value = .2; lp.connect(rg); rg.connect(rv); rv.connect(cp);                // a short, dirty, outdoor-ruins reverb tail
      MUS = AC.createGain(); MUS.gain.value = .5 * (save.mvol === undefined ? 1 : save.mvol); MUS.connect(cp);                       // music bus (own level, shares the limiter)
      DL = AC.createDelay(1); DL.delayTime.value = .417; const fb = AC.createGain(); fb.gain.value = .38; DL.connect(fb); fb.connect(DL); DL.connect(MUS);   // dotted-eighth echo for the lead
      NB = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const d = NB.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (AC.state === 'suspended') AC.resume();
    return AC;
  } catch (e) { return null; }
}
// browsers keep audio locked until the page has had a click / key / touch: unlock (and re-unlock after the tab was hidden) on every such event
let resuming = false;
function audioWake() { if (state === 'menu') musicStart(); else if (state === 'play' && G && !G.paused) ambStart(); }   // whatever should be sounding in this screen starts once the context really runs
function unlockAudio() { // Safari: a context can be 'suspended' or 'interrupted' and its resume() promise may never settle if called without a gesture; never stack calls, always re-arm
  const a = audio(); if (!a) return;
  if (a.state === 'running') { audioWake(); return; }
  if (resuming) return; resuming = true;
  const done = () => { resuming = false; if (a.state === 'running') audioWake(); };
  try { const p = a.resume(); if (p && p.then) p.then(done, done); else done(); } catch (e) { resuming = false; }
  setTimeout(() => { resuming = false; }, 1200);
}
for (const ev of ['pointerdown', 'touchstart', 'touchend', 'click', 'keydown', 'pageshow', 'focus']) window.addEventListener(ev, unlockAudio, true);
document.addEventListener('visibilitychange', () => { if (document.hidden) { try { if (AC && AC.state === 'running') AC.suspend(); } catch (e) {} } else unlockAudio(); });   // no audio (or battery) spent while the tab is hidden
function audioStatus() { return !AC ? 'not started yet' : AC.state === 'running' ? 'running (' + AC.sampleRate + ' Hz)' : AC.state + ' - tap or click the page, then try again'; }
function nz(at, dur, o) { // a burst of filtered noise: the body of gunshots, crunches, explosions and whooshes
  const a = audio(); if (!a || live > 48) return; o = o || {};
  const t = a.currentTime + (at || 0), s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = NB; s.loop = true; f.type = o.type || 'bandpass'; f.Q.value = o.q || .8;
  f.frequency.setValueAtTime(o.f0 || 1500, t); if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.f1), t + dur);
  g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(o.g || .3, t + (o.atk || .002)); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(DEST || OUT); live++; s.onended = () => live--; s.start(t, Math.random() * .5); s.stop(t + dur + .03);
}
function tn(at, f0, f1, dur, type, gain) { // a pitched tone that glides from f0 to f1: thumps, plasma, rings, chimes
  const a = audio(); if (!a || live > 48) return;
  const t = a.currentTime + (at || 0), o = a.createOscillator(), g = a.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(gain || .1, t + .003); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g); g.connect(DEST || OUT); live++; o.onended = () => live--; o.start(t); o.stop(t + dur + .03);
}
function beep(f, d, type, v, slide) { tn(0, f, slide ? Math.max(20, f + slide) : f, d, type || 'square', v || .04); }   // simple UI blips
// ---- title music: an original industrial march (not the film's theme): a ten-step driving bass in E minor, anvil clangs, a brooding pad, and a lead that enters on the fifth bar
const MU = { on: false, t: 0, step: 0, timer: null }, EIGHTH = 60 / 104 / 2;
const ROOTS = [82.41, 82.41, 65.41, 65.41, 73.42, 73.42, 61.74, 61.74];   // E E C C D D B B, one bar of ten eighths each
const BASS = [0, null, 0, 0, null, 7, 0, null, 5, null];                   // semitones above the root
const LEAD = [   // [eighth, semitones above E3, length]: two answering phrases over D and B, low and falling, leaning on the dark notes (F natural, C)
  [[0, 12, 4], [4, 13, 2], [6, 12, 3], [9, 10, 3], [12, 8, 3], [15, 7, 5]],
  [[0, 7, 4], [4, 8, 2], [6, 7, 3], [9, 3, 3], [12, 1, 3], [15, 0, 5]]];
const hz = (f, semi) => f * Math.pow(2, semi / 12);
function vx(at, f, dur, o) { // a filtered, slightly detuned synth voice
  const a = AC; if (!a || live > 60) return; o = o || {};
  const t = a.currentTime + at, g = a.createGain(), lp = a.createBiquadFilter();
  lp.type = 'lowpass'; lp.Q.value = o.q || 2; lp.frequency.setValueAtTime(o.c0 || 900, t); lp.frequency.exponentialRampToValueAtTime(Math.max(80, o.c1 || 300), t + dur);
  g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(o.g || .2, t + (o.atk || .01)); g.gain.setValueAtTime(o.g || .2, t + Math.max(.02, dur - (o.rel || .08))); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  lp.connect(g); g.connect(DEST || MUS); if (o.echo && DL) { const sg = a.createGain(); sg.gain.value = o.echo; g.connect(sg); sg.connect(DL); }
  for (const dt of (o.det || [-6, 6])) { const os = a.createOscillator(); os.type = o.type || 'sawtooth'; os.frequency.setValueAtTime(f, t); os.detune.value = dt; os.connect(lp); live++; os.onended = () => live--; os.start(t); os.stop(t + dur + .03); }
}
function musicStep(n, t) { // schedule one eighth-note step at absolute audio time t
  const a = AC, at = Math.max(0, t - a.currentTime), bar = Math.floor(n / 10) % 8, s = n % 10, root = ROOTS[bar];
  DEST = MUS;
  try {
    if (s === 0 || s === 5) { tn(at, 140, 42, .24, 'sine', .8); }                                                          // kick on the pulse
    if (s === 0 || s === 5 || (bar % 2 && s === 8)) { tn(at, 810, 790, .4, 'triangle', .1); tn(at, 1270, 1240, .28, 'sine', .06); tn(at, 2150, 2100, .16, 'sine', .035); nz(at, .05, { type: 'highpass', f0: 3000, g: .12 }); }   // anvil clang
    if (bar >= 1 && s % 2 === 1) nz(at, .03, { type: 'highpass', f0: 6000, g: .035 });                                        // hat
    if (s === 3 || s === 8) nz(at, .12, { f0: 1800, f1: 900, q: 1, g: .1 });                                                 // snare-ish
    if (bar % 4 === 3 && s >= 8) nz(at + (s - 8) * EIGHTH * .5, .06, { f0: 2500, q: 2, g: .12 });                            // metallic rattle fill
    const sem = BASS[s]; if (sem !== null) vx(at, hz(root, sem), EIGHTH * 1.7, { c0: 900, c1: 220, g: .26, det: [-8, 8], q: 3 });   // bass
    if (bar >= 2 && s === 0) { for (const [m, gn] of [[0, .09], [7, .07], [12, .045]]) vx(at, hz(root * 2, m), EIGHTH * 10, { type: 'sawtooth', c0: 500, c1: 900, g: gn, atk: .6, rel: 1.2, det: [-10, 10], q: 1 }); }   // pad
    if (bar >= 4) { const ph = LEAD[bar >= 6 ? 1 : 0], base = (bar % 2) * 10; for (const [st, semi, len] of ph) if (st === base + s) vx(at, hz(164.81, semi), EIGHTH * len * .98, { type: 'sawtooth', c0: 1300, c1: 380, g: .13, det: [-7, 7], echo: .32, q: 2, atk: .05, rel: .25 }); }
  } finally { DEST = null; }
}
function musicTick() {
  if (!MU.on || !AC) return;
  while (MU.t < AC.currentTime + .5) { musicStep(MU.step, MU.t); MU.t += EIGHTH; MU.step++; }
}
function musicStart() {
  if (MU.on || save.mute || save.music === false) return;
  const a = audio(); if (!a || a.state !== 'running') return;
  MU.on = true; MU.t = a.currentTime + .12; MU.step = 0;
  MUS.gain.cancelScheduledValues(a.currentTime); MUS.gain.setValueAtTime(.0001, a.currentTime); MUS.gain.linearRampToValueAtTime(.5 * (save.mvol === undefined ? 1 : save.mvol), a.currentTime + .4);
  MU.timer = setInterval(musicTick, 100); musicTick();
}
function musicStop() {
  if (!MU.on) return; MU.on = false; clearInterval(MU.timer);
  if (AC && MUS) { MUS.gain.cancelScheduledValues(AC.currentTime); MUS.gain.setValueAtTime(MUS.gain.value, AC.currentTime); MUS.gain.linearRampToValueAtTime(.0001, AC.currentTime + .7); }
}
let AMB = null;
function ambStart() { // a low wind-and-machinery bed under the battle
  const a = audio(); if (!a || AMB || save.mute || a.state !== 'running') return;
  const s = a.createBufferSource(), f = a.createBiquadFilter(), f2 = a.createBiquadFilter(), g = a.createGain(), lfo = a.createOscillator(), lg = a.createGain();
  s.buffer = NB; s.loop = true; f.type = 'lowpass'; f.frequency.value = 260; f.Q.value = .7; f2.type = 'bandpass'; f2.frequency.value = 90; f2.Q.value = .5;
  g.gain.value = .0001; g.gain.linearRampToValueAtTime(.16, a.currentTime + 2.5); lfo.frequency.value = .09; lg.gain.value = 110; lfo.connect(lg); lg.connect(f.frequency);   // the wind swells and falls slowly
  s.connect(f); f.connect(f2); f2.connect(g); g.connect(OUT); s.start(); lfo.start(); AMB = { s, g, lfo };
}
function ambStop() { if (!AMB || !AC) { AMB = null; return; } const A = AMB; AMB = null; try { A.g.gain.cancelScheduledValues(AC.currentTime); A.g.gain.setTargetAtTime(.0001, AC.currentTime, .3); setTimeout(() => { try { A.s.stop(); A.lfo.stop(); } catch (e) {} }, 1500); } catch (e) {} }
const SHOT_GAP = [60, 44, 44, 36, 52, 0];
const sfx = {   // gritty, low and heavy: filtered noise and saturated low tones, nothing bright or bell-like
  shot(tier) { // the squad's weapon, one per round released, so the rattle is ragged like real fire
    if (!ok('shot', SHOT_GAP[tier] || 40)) return;
    const p = rnd(.9, 1.1), v = .7;
    if (tier === 0) { nz(0, .07, { f0: 1700 * p, f1: 500, q: .7, g: .7 * v }); tn(0, 160 * p, 55, .11, 'sawtooth', .5 * v); nz(.012, .24, { type: 'lowpass', f0: 800, f1: 160, g: .16 * v }); }                // pistol: flat crack, boxy tail
    else if (tier === 1) { nz(0, .05, { f0: 2000 * p, f1: 800, q: .8, g: .55 * v }); tn(0, 210 * p, 80, .06, 'sawtooth', .35 * v); }                                                           // SMG: dry rattle
    else if (tier === 2) { nz(0, .09, { f0: 1500 * p, f1: 500, q: .6, g: .75 * v }); tn(0, 130 * p, 45, .13, 'sawtooth', .6 * v); nz(.01, .22, { type: 'lowpass', f0: 1100, f1: 140, g: .2 * v }); }  // rifle: hard crack and thump
    else if (tier === 3) { nz(0, .045, { f0: 1700 * p, q: .9, g: .6 * v }); tn(0, 105 * p, 55, .055, 'square', .2 * v); }                                                                     // minigun: chain-saw chatter
    else if (tier === 4) { tn(0, 300 * p, 55, .26, 'sawtooth', .38 * v); tn(0, 120 * p, 38, .3, 'sine', .55 * v); nz(0, .09, { f0: 2400, f1: 700, q: 1.2, g: .3 * v }); }                         // plasma: the franchise "thwump"
    else { tn(0, 62, 26, .5, 'sine', .8 * v); nz(0, .4, { type: 'lowpass', f0: 3200, f1: 120, q: .5, g: .55 * v }); tn(0, 700 * p, 120, .12, 'sawtooth', .25 * v); }                           // rail: sonic crack, huge thump
  },
  shotgun() { if (!ok('sg', 130)) return; nz(0, .15, { f0: 800, f1: 220, q: .5, g: .8 }); tn(0, 95, 34, .24, 'sawtooth', .7); nz(.02, .34, { type: 'lowpass', f0: 600, f1: 90, g: .2 }); },
  sniper() { if (!ok('sn', 150)) return; nz(0, .06, { f0: 2400, f1: 600, q: .8, g: .7 }); tn(0, 85, 30, .3, 'sawtooth', .6); nz(.03, .45, { type: 'lowpass', f0: 1300, f1: 100, g: .24 }); },
  impact(res, tier, name) { // what a round does when it lands on a machine
    if (!ok('imp', 38)) return;
    if (res === 'plate') { const f = rnd(380, 620); tn(0, f, f * .8, .13, 'square', .2); tn(0, f * 2.4, f * 2, .07, 'sawtooth', .08); nz(0, .05, { f0: rnd(1300, 2000), q: 1.4, g: .35 }); if (Math.random() < .25) nz(.01, .22, { f0: 1500, f1: 600, q: 5, g: .08 }); return; }   // armour: a dull, ringing clang
    if (name === 'sniper' || tier === 5) { tn(0, 120, 40, .22, 'sawtooth', .5); nz(0, .12, { f0: 1000, q: .7, g: .35 }); return; }
    if (tier === 4) { nz(0, .18, { f0: 2000, f1: 500, q: 1.5, g: .3 }); tn(0, 250, 70, .12, 'sawtooth', .2); return; }                                                                         // plasma: a wet sizzle
    nz(0, .06, { f0: rnd(500, 800), q: .9, g: .4 }); tn(0, 170, 60, .07, 'sawtooth', .3);                                                                                                       // dull thunk into chassis
  },
  tick() { if (ok('tk', 45)) { nz(0, .03, { f0: 900, q: 1.5, g: .3 }); tn(0, 420, 300, .04, 'square', .08); } },   // a round hits a gate: a flat tink
  hit() { nz(0, .2, { f0: 900, f1: 180, q: .6, g: .5 }); tn(0, 130, 38, .16, 'sawtooth', .45); nz(.02, .14, { f0: 2400, q: .8, g: .1 }); },   // a small machine dies: a crunch
  boom() { nz(0, 1.0, { type: 'lowpass', f0: 2000, f1: 60, q: .5, g: .95 }); tn(0, 80, 24, .85, 'sawtooth', .6); tn(0, 55, 20, .9, 'sine', .9); nz(0, .09, { f0: 1100, f1: 300, g: .55 }); nz(.18, .6, { f0: 500, f1: 150, g: .2 }); },
  clink() { // scrap: heavy metal bits landing, not a bell
    if (!ok('ck', 30)) return;
    const f = rnd(520, 820); tn(0, f, f * .85, .09, 'square', .1); tn(0, f * 1.9, f * 1.6, .05, 'sawtooth', .05); nz(0, .035, { f0: rnd(1400, 2200), q: 2.2, g: .3 });
    nz(.05, .03, { f0: rnd(1200, 1800), q: 2.5, g: .22 });
  },
  gate() { tn(0, 196, 165, .22, 'sawtooth', .22); tn(.09, 262, 247, .3, 'sawtooth', .22); nz(0, .08, { f0: 900, q: .8, g: .1 }); },       // a low brass stab
  bad() { nz(0, .45, { type: 'lowpass', f0: 800, f1: 90, g: .35 }); tn(0, 150, 50, .5, 'sawtooth', .2); },
  hurt() { tn(0, 110, 36, .2, 'sawtooth', .5); nz(0, .13, { type: 'lowpass', f0: 1200, f1: 160, g: .4 }); },
  emp() { tn(0, 70, 1400, .35, 'sawtooth', .16); nz(.28, .7, { f0: 2200, f1: 120, q: .6, g: .6 }); tn(.28, 70, 22, .7, 'sawtooth', .5); tn(.28, 48, 20, .8, 'sine', .8); },   // charge up then a deep concussive burst
  cannon() { tn(0, 1400, 70, .5, 'sawtooth', .3); nz(0, .6, { f0: 3500, f1: 250, q: .7, g: .55 }); tn(.05, 60, 30, .8, 'sine', .8); tn(0, 200, 900, .25, 'square', .1); },   // a heavy plasma discharge
  thump() { tn(0, 190, 60, .14, 'square', .3); nz(0, .07, { type: 'lowpass', f0: 900, f1: 200, g: .35 }); },   // a 40mm launcher
  thunder() { nz(0, .07, { f0: 3200, q: 1, g: .3 }); nz(.05, 2.2, { type: 'lowpass', f0: 420, f1: 50, q: .4, g: .7 }); tn(.05, 62, 24, 1.8, 'sine', .55); nz(.9, 1.6, { type: 'lowpass', f0: 240, f1: 40, q: .4, g: .35 }); },   // a crack, then the rolling rumble
  squelch() { nz(0, .014, { f0: 3500, q: 3, g: .4 }); nz(.02, .11, { f0: 2400, f1: 1300, q: .6, g: .3 }); },   // radio key-up: a click and a burst of hiss
  squelchEnd() { nz(0, .016, { f0: 2800, q: 3, g: .38 }); nz(.03, .05, { f0: 1800, q: .7, g: .2 }); },   // key-down click
  geiger() { if (ok('gg', 70)) nz(0, .012, { f0: 3200, q: 3, g: .16 }); },
  arc() { nz(0, .2, { f0: 3200, f1: 700, q: 2, g: .4 }); tn(0, 1900, 160, .14, 'square', .14); },   // live cable discharge
  ping() { if (ok('png', 60)) { tn(0, rnd(300, 480), 220, .16, 'square', .12); nz(0, .03, { f0: 1600, q: 1.5, g: .2 }); } },   // a clang on the reprogrammed unit
  mg() { for (let i = 0; i < 3; i++) { nz(i * .055, .045, { f0: 1500, q: .9, g: .45 }); tn(i * .055, 100, 55, .06, 'sawtooth', .25); } },   // enemy minigun burst
  zap(big) { // enemy plasma bolt leaving the barrel
    if (!ok('zap', 70)) return; const p = rnd(.9, 1.1);
    tn(0, 380 * p, 70, .22, 'sawtooth', .22); tn(0, 150 * p, 45, .24, 'sine', .4); nz(0, .06, { f0: 2200, f1: 700, q: 1.2, g: .2 });
    if (big) { tn(0, 90, 30, .4, 'sawtooth', .35); nz(0, .25, { type: 'lowpass', f0: 900, f1: 120, g: .25 }); }
  },
  mega() { nz(0, 2.6, { type: 'lowpass', f0: 1600, f1: 36, q: .5, g: 1.1 }); tn(0, 50, 14, 2.2, 'sine', 1); tn(0, 78, 20, 1.6, 'sawtooth', .6); nz(0, .22, { f0: 1100, f1: 250, g: .8 }); nz(.5, 1.7, { f0: 300, f1: 55, q: .6, g: .4 }); for (let i = 0; i < 10; i++) nz(.25 + i * .17, .1, { f0: 1800, q: 1, g: .25 }); },
  distant() { nz(0, 1.1, { type: 'lowpass', f0: 420, f1: 60, q: .5, g: .32 }); tn(0, 58, 28, .9, 'sine', .28); nz(.35, .6, { type: 'lowpass', f0: 300, f1: 50, g: .12 }); },   // far-off artillery, now and then
  rocket() { nz(0, .55, { f0: 250, f1: 1200, q: .8, g: .5 }); tn(0, 90, 260, .45, 'sawtooth', .16); nz(0, .06, { f0: 1500, g: .35 }); },
  siren() { for (let i = 0; i < 6; i++) tn(i * .26, i % 2 ? 330 : 440, i % 2 ? 320 : 430, .24, 'sawtooth', .2); },   // a low industrial klaxon
  win() { tn(0, 165, 196, .2, 'sawtooth', .18); tn(.18, 247, 262, .35, 'sawtooth', .18); },
  lose() { tn(0, 140, 40, .9, 'sawtooth', .3); nz(0, .8, { type: 'lowpass', f0: 700, f1: 80, g: .35 }); },
};

// ---------------------------------------------------------------- projection
function P(x, z) { const s = 1 / (1 + z * K); return { x: W / 2 + x * LANE * s, y: HOR + (PY - HOR) * s, s }; }

// ---------------------------------------------------------------- level gen
function mk(t, wz, x, hpm, o) {
  const d = ET[t], hp = d.hp * hpm;
  return Object.assign({ t, wz, x, hp, max: hp, fcd: rnd(.6, d.shoot || 1), flash: 0, id: Math.random() * 100,
    active: false, dead: false, sc: 1, boss: false, sum: 5, dx: 0, gs: 'idle', gt: 0, gcd: rnd(1.8, 3), ext: 0, tx: 0, cap: 0, muz: 0 }, o || {});
}
function makeGate(z, lv) {
  const r = Math.random(), a = rint(3, 5 + lv);
  let A, B;
  if (lv >= 2 && save.loadout.length && Math.random() < .14) { A = { k: 'cls', c: save.loadout[rint(0, save.loadout.length - 1)], v: 2 }; B = { k: 'add', v: a }; if (Math.random() < .5) { const t = A; A = B; B = t; } return { wz: z, L: A, R: B, used: false }; }
  if (r < .4)      { A = { k: 'add', v: a }; B = { k: 'add', v: -rint(3, 6 + lv) }; }
  else if (r < .52) { A = { k: 'mul', v: 2 }; B = { k: 'add', v: a + 4 }; }
  else if (r < .63){ A = { k: 'wpn' };       B = { k: 'add', v: a }; }
  else if (r < .73) { A = { k: 'rate' };      B = { k: 'dmg' }; }
  else if (r < .8) { A = { k: 'add', v: a }; B = { k: 'add', v: rint(2, 4 + lv) }; }
  else             { A = { k: 'mul', v: 3 }; B = { k: 'add', v: -rint(5, 9 + lv) }; }
  if (Math.random() < .5) { const t = A; A = B; B = t; }
  return { wz: z, L: A, R: B, used: false };
}
const INDUSTRIAL = new Set([1, 3, 4, 7]);   // Scrapyard, Reactor Ring, Foundry, Server Vault: maintenance droids
function spawnWave(en, z, lv, p, wv, hpm) {
  let n = Math.round(5 + Math.min(lv, 30) * 1.0 + p * 5);
  const swarm = wv % 3 === 0;
  if (swarm) n = Math.round(n * 1.6);
  const pat = swarm ? 'scatter' : ['scatter', 'line', 'wedge', 'columns', 'pincer'][(wv + lv) % 5];   // waves arrive in different formations
  for (let i = 0; i < n; i++) {
    const t = !swarm && lv >= 2 && Math.random() < .18 ? 'gunner' : INDUSTRIAL.has((lv - 1) % 10) && Math.random() < .3 ? 't400' : 'grunt', f = n > 1 ? i / (n - 1) : .5;
    let x = rnd(-.82, .82), dz = rnd(0, 120);
    if (pat === 'line') { x = -.8 + 1.6 * f; dz = rnd(0, 18); }                                            // a wall of machines: gaps are tight
    else if (pat === 'wedge') { x = (f - .5) * 1.6; dz = Math.abs(f - .5) * 150 + rnd(0, 14); }             // a V pointing at you
    else if (pat === 'columns') { const c = i % 3; x = -.55 + c * .55 + rnd(-.05, .05); dz = Math.floor(i / 3) * 26 + rnd(0, 8); }   // three lanes of marching files
    else if (pat === 'pincer') { x = (i % 2 ? 1 : -1) * rnd(.5, .85); dz = rnd(0, 90); }                    // squeezes from both flanks, leaving the middle open
    if (t === 'gunner') dz += 60;
    if (t === 't400') dz += rnd(0, 40);                                                                           // gunners hang back behind the line
    en.push(mk(t, z + dz, clamp(x, -.85, .85), hpm));
  }
  if (lv >= 2 && wv % 3 === 1) { const c = lv >= 6 ? 2 : 1; for (let i = 0; i < c; i++) en.push(mk('aerostat', z + 220 + i * 40, rnd(-.6, .6), hpm)); }
  if (lv >= 3 && wv % 4 === 1) { const cx0 = rnd(-.55, .55); for (let i = 0; i < 5; i++) en.push(mk('drone', z + 170 + rnd(0, 70), clamp(cx0 + (i - 2) * .12, -.85, .85), hpm, { sc: .55 })); }   // a drone swarm
  if (lv >= 4 && wv % 3 === 2 && !swarm) en.push(mk('t700', z + 100 + rnd(0, 60), rnd(-.6, .6), hpm));
  if (lv >= 4 && wv % 5 === 3) en.push(mk('minelayer', z + 215, rnd(-.4, .4), hpm, { sc: .9 }));
  if (lv >= 6 && wv % 7 === 3) en.push(mk('t1000', z + 130, rnd(-.5, .5), hpm));   // never more than one T-1000 at a time
  if (wv % 4 === 0) en.push(mk('heavy', z + 150, rnd(-.4, .4), hpm));
  if (lv >= 5 && wv % 5 === 2) en.push(mk('gunship', z + 260, rnd(-.4, .4), hpm));
  if (lv >= 3 && wv % 4 === 2) { const c = lv >= 8 ? 2 : 1; for (let i = 0; i < c; i++) en.push(mk('behemoth', z + 200 + i * 45, rnd(-.5, .5), hpm)); }   // the T-1
  if (lv >= 3 && wv % 5 === 0) en.push(mk('tank', z + 190, rnd(-.4, .4), hpm, { sc: 1.7 }));
}
function addHazards(haz, z, lv) {
  // unexploded ordnance: shoot it from range or steer around (the only ground hazard: no radiation or slag pits)
  const xs = [-.72, -.2, .32, .78].sort(() => Math.random() - .5).slice(0, rint(2, 3));
  for (const x of xs) haz.push({ k: 'uxo', x: x + rnd(-.06, .06), hw: .09, wz: z + rnd(-20, 20), len: 30, tick: 0, dead: false });
}
// ---- terrain obstacles: concrete barriers, rubble, tank traps, live cables and collapsing overpasses. Every one leaves a way through.
function addObstacles(obs, gates, en, L, lv) {
  const gap = () => rnd(-.55, .55), side = () => (Math.random() < .5 ? -1 : 1);
  const pool = ['jersey', 'rubble']; if (lv >= 2) pool.push('trap', 'cable', 'truck', 'sandbag'); if (lv >= 3) pool.push('overpass');
  let over = 0;
  for (const g of gates) {   // one candidate slot in the stretch behind each gate, clear of every gate approach
    const z = g.wz + rnd(280, 400);
    const clear = z < L - 560 && !gates.some(h => z > h.wz - 170 && z < h.wz + 270);
    if (clear && Math.random() < Math.min(.9, .55 + .08 * lv)) {
      const k = pool[Math.floor(Math.random() * pool.length)];
      if (k === 'jersey' || k === 'trap') { // a broken line of blocks with one gap
        const g = gap(), hw = k === 'jersey' ? .1 : .085;
        for (let x = -.85; x <= .85; x += hw * 2.2) if (Math.abs(x - g) > .3) obs.push({ k, x, hw, wz: z + rnd(-5, 5), len: k === 'jersey' ? 28 : 24, hp: k === 'jersey' ? 120 : 260, dead: false });
      } else if (k === 'truck' || k === 'sandbag') {   // abandoned cover: it soaks enemy fire until it breaks
        const hp = k === 'truck' ? 380 : 240; obs.push({ k, x: rnd(-.65, .65), hw: k === 'truck' ? .17 : .22, wz: z, len: k === 'truck' ? 44 : 30, hp, max: hp, dead: false, hit: 0, sd: Math.random() * 99 });
      } else if (k === 'rubble') {
        obs.push({ k, x: rnd(-.6, .6), hw: rnd(.28, .45), wz: z, len: 90, hp: 80, dead: false, sd: Math.random() * 99 });
      } else if (k === 'cable') {
        const hw = rnd(.4, .6); obs.push({ k, x: side() * (.9 - hw), hw, wz: z, len: 6, hp: 1e9, dead: false, sd: Math.random() * 99 });
      } else if (k === 'overpass' && over < 2) {
        over++; obs.push({ k, x: 0, hw: 1.1, wz: z, len: 60, hp: 1e9, dead: false, st: 0, t: 0, open: 0 });
      }
    }
  }
}
const BOSS_KINDS = ['heavy', 'harvester', 'tank', 'gunship', 'ogre', 'centurion'];
const tierOf = lv => Math.floor(lv / 10);   // threat tier: +1 every ten sectors, starting at sector 10, with no upper limit
const tierMul = lv => 1 + .1 * tierOf(lv);   // enemy health multiplier: +10% per tier, applied on top of everything that sizes a machine (including the firepower-based sizing of endos, big machines and bosses)
const hpScale = lv => lv <= 30 ? 1 + .2 * (lv - 1) : 6.8 + .06 * (lv - 30);   // enemy health grows steadily to sector 30, then gently: the squad keeps up
const LS = (div, cap) => Math.min(cap, Math.floor(G.lv / div));   // per-hit damage growth with the sector, capped so a late hit never wipes a squad
function genLevel(lv) {
  const L = 2800 + 260 * Math.min(lv, 30), hpm = hpScale(lv) * tierMul(lv);
  const gates = [], en = [];
  let z = 480, k = 0, wv = 0;
  while (z < L - 420) {
    if (k % 2 === 0) { gates.push(makeGate(z, lv)); z += 260; }
    else { wv++; spawnWave(en, z + 120, lv, z / L, wv, hpm); z += 330; }
    k++;
  }
  const GCLEAR_BEFORE = 130, GCLEAR_AFTER = 230;   // nothing stands in the approach to a gate or just beyond it, so the squad can always pick a side and pass
  for (const g of gates) for (const e of en) {
    if (e.wz > g.wz - GCLEAR_BEFORE && e.wz < g.wz + GCLEAR_AFTER) e.wz = e.wz < g.wz ? g.wz - GCLEAR_BEFORE - (g.wz - e.wz) * .1 : g.wz + GCLEAR_AFTER + (e.wz - g.wz) * .12;
  }
  const kind = BOSS_KINDS[(lv - 1) % BOSS_KINDS.length];
  const mul = { centurion: 1.7, heavy: 1, harvester: 2.0, tank: 1.7, gunship: 1.3, behemoth: 1.5, ogre: 1.6 }[kind];
  const hp = (2500 + lv * 800) * mul;
  en.push(mk(kind, L, 0, 1, { boss: true, armor: .25, hp, max: hp, sc: kind === 'centurion' ? 2.5 : kind === 'ogre' ? 2.1 : kind === 'tank' ? 2.3 : kind === 'harvester' ? 2.8 : kind === 'behemoth' ? 1.7 : 1.5, name: ET[kind].name }));
  const haz = [];
  for (const g of gates) if (Math.random() < Math.min(.85, .3 + .08 * lv)) addHazards(haz, g.wz + 170, lv);
  const pups = [];   // reprogrammed-unit power-up crates: one early, a second on later sectors
  const pg = (frac) => gates.reduce((b, g) => Math.abs(g.wz + 95 - L * frac) < Math.abs(b.wz + 95 - L * frac) ? g : b, gates[0]);
  pups.push({ k: 'guard', x: rnd(-.55, .55), wz: pg(.3).wz + 95 });
  if (lv >= 3) pups.push({ k: 'guard', x: rnd(-.55, .55), wz: pg(.7).wz + 95 });
  if (lv >= 2) pups.push({ k: 'supply', x: rnd(-.55, .55), wz: pg(.22).wz + 95 });
  pups.push({ k: 'supply', x: rnd(-.55, .55), wz: pg(.5).wz + 95 });   // tactical-item supply crates: one mid-sector, another late on from sector 3
  if (lv >= 3) pups.push({ k: 'supply', x: rnd(-.55, .55), wz: pg(.85).wz + 95 });
  if (lv >= 6) pups.push({ k: 'supply', x: rnd(-.55, .55), wz: pg(.68).wz + 95 });
  const obs = []; addObstacles(obs, gates, en, L, lv);
  return { L, gates, en, haz, pups, obs };
}

// ---------------------------------------------------------------- state
let state = 'menu', G = null, bgDist = 0, last = 0, T = 0;
const keys = {};
const hash = n => { n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n ^= n >>> 16; return (n >>> 0) / 4294967296; };
function makeCity(minW, maxW, minH, maxH, winP) { // ruined skyline layer: columns with broken/chewed tops, lit windows, spires
  const out = []; let x = 0;
  while (x < W * 2.2) {
    const w = rnd(minW, maxW), h = rnd(minH, maxH), cols = Math.ceil(w / 5), hs = [];
    const brk = Math.random() < .6 ? rint(0, cols - 1) : -1, slope = rnd(-.6, .6);
    for (let i = 0; i < cols; i++) {
      let d = 0;
      if (brk >= 0 && i >= brk) { d = (i - brk) * Math.abs(slope) * 6; if (i > brk + 1 && Math.random() < .3) d += rnd(4, 16); }
      if (Math.random() < .14) d += rnd(3, 11);
      hs.push(Math.max(10, h - d));
    }
    const lit = [];
    for (let r = 14; r < h - 8; r += 9) for (let q = 3; q < w - 3; q += 7) if (Math.random() < winP * 1.5) lit.push([q, r, Math.random() < .25 ? 1 : 0, Math.random()]);
    out.push({ x, w, h, cols, hs, lit, spire: Math.random() < .25 ? rnd(8, 24) : 0 });
    x += w + rnd(-5, 9);
  }
  return { b: out, w: x };
}
let CITY = [makeCity(26, 70, 80, 160, .01), makeCity(22, 60, 60, 125, .035), makeCity(18, 52, 40, 95, .07)];
function makeRidge(minH, maxH, step) { // distant mountains or hills: a jagged skyline of ridges
  const pts = []; let y = rnd(minH, maxH), x = 0;
  while (x < W * 2.4) { y = clamp(y + rnd(-1, 1) * (maxH - minH) * .38, minH, maxH); pts.push([x, y]); x += rnd(step * .5, step * 1.5); }
  return { p: pts, w: x };
}
let RIDGE = makeRidge(30, 120, 22);
function buildScenery(look) { // every sector gets its own skyline: dense city, sparse ruins, mountains, or both
  const m = look.cityMode, dens = look.dens;
  CITY = [makeCity(26, 70, 80 * dens, 160 * dens, .01), makeCity(22, 60, 60 * dens, 125 * dens, .035), makeCity(18, 52, 40 * dens, 95 * dens, .07)];
  if (m === 'sparse') for (const L of CITY) L.b = L.b.filter((b, i) => i % 3 === 0);
  RIDGE = makeRidge(look.tod === 'dark' ? 40 : 30, 60 + 90 * look.sx, 18 + 20 * look.sx);
  try { for (const L of CITY) L.ov = bakeCityOverlay(L, 280); RIDGE.ov = bakeRidgeOverlay(RIDGE, look.biome === 'winter'); } catch (e) { for (const L of CITY) L.ov = null; RIDGE.ov = null; }
}
let decor = [], decorNext = 0, wallNext = 0;

function startLevel(lv, opt) {
  try { unlockAudio(); } catch (e) {}   // starting a sector is a gesture: a suspended context is woken here
  lv = Math.max(1, Math.min(999, Math.floor(lv) || 1));
  const lvl = genLevel(lv);
  const fails = opt && opt.endless ? 0 : save.fails[lv] || 0;
  const assist = Math.max(.7, 1 - .1 * fails);
  for (const e of lvl.en) { e.hp *= assist; e.max *= assist; }
  G = {
    lv, L: lvl.L, gates: lvl.gates, en: lvl.en, assist,
    dist: 0, spd: 0, px: 0, tx: 0,
    n: 6 + SQUAD_K * save.up.squad, tier: save.up.weapon, rateG: 1, dmgG: 1,
    fcd: .3, bullets: [], bolts: [], parts: [], texts: [],
    look: lookFor(lv), form: save.form, scrap: 0, kills: 0, item: { k: QM[U('cache')][0], n: QM[U('cache')][1] }, shield: 2 * U('plate'), reinT: 0, c4: [], flares: [], fallout: [], nukes: [], uplinks: [], beam: null, shake: 0, flash: 0, hurtFlash: 0,
    guard: null, gx: 0, pups: [], pupPlan: lvl.pups.map(p => ({ k: p.k, x: p.x, wz: p.wz, done: false })),
    cls: Object.fromEntries(CLS.map(k => [k, 0])), sig: 7, scr: [], haz: lvl.haz, obs: lvl.obs, slow: 1, env: ENVS[SECT[(lv - 1) % SECT.length]] || null, dk: 0, rn: 0, storm: 0, rockets: [], strikes: [], lt: [], warn: null, mz: 0, rcd: 2, peak: 6 + SQUAD_K * save.up.squad,
    ts: 1, t: 0, later: [], deaths: [], waves: [], alert: null, over: false, won: false, endT: 0, paused: false,
  };
  for (const k of save.loadout) { if (!CLASS[k] || !save.unlocked[k]) continue; const c0 = classStart(); G.cls[k] = c0; G.n += c0; G.peak += c0; }
  if (opt && opt.endless) { // survival: the squad, its specialists and its item carry from sector to sector
    G.endless = { sectors: opt.sectors || 0, kills: opt.kills || 0, scrap: opt.scrap || 0, lost: opt.lost || 0 };
    if (opt.carry) { const c = opt.carry; G.peak = Math.max(G.peak, c.peak); G.cls = Object.assign(G.cls, c.cls); G.n = Math.min(G.peak, c.n + 2 + Math.ceil(c.peak * .12)); G.item = c.item; G.form = c.form || G.form; trimClasses(); }
  }   // each picked class starts with a few soldiers, on top of the squad
  buildScenery(G.look); G.tp = todPal(G.look, 0); G.wx = wxAt(G.look, 0);
  decor = []; decorNext = 0; wallNext = 0;
  state = 'play'; ovHide(); musicStop(); ambStart();
  sfx.win();
}

// ---------------------------------------------------------------- effects
const PART_CAP = 420;
function pushPart(p) { // one entry point for every particle: past the cap the oldest slots are recycled, so a chain of explosions can never grow the array (or the frame time) without bound
  const a = G.parts;
  if (a.length < PART_CAP) a.push(p); else { G.pi = ((G.pi || 0) + 1) % PART_CAP; a[G.pi] = p; }
}
function addParts(x, y, n, col, spd, life, g) {
  if (!G) return;
  for (let i = 0; i < n; i++) {
    const a = rnd(0, 6.283), v = rnd(.2, 1) * spd;
    pushPart({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - spd * .3, life: rnd(.5, 1) * life, max: life, col, r: rnd(1.5, 3.5), g: g || 300 });
  }
}
function addText(x, y, txt, col, sz) { if (G.texts.length > 40) G.texts.shift(); G.texts.push({ x, y, txt, col: col || '#fff', life: 1, sz }); }
function squadPos() { const q = P(G.px, G.adv || 0); return q; }
function gateWait(e) { const g = gateBefore(e); return !!g && G.dist < g.wz - 380; }   // still frozen behind a gate
function gateBefore(e) { let best = null; for (const g of G.gates) if (!g.used && g.wz < e.wz && g.wz > G.dist - 5 && (!best || g.wz > best.wz)) best = g; return best; }
function clAt(ci) { let c = ci; for (const k of CLS) { if (c < G.cls[k]) return k; c -= G.cls[k]; } return null; }   // which class the ci-th special soldier belongs to
function slotOf(i, shown) { // where the i-th soldier stands: x offset in lane units, z offset in world px
  const f = (G && G.form) || 'free';
  if (f === 'v') { const r = Math.ceil(i / 2), sd = i % 2 ? 1 : -1; return { ox: i === 0 ? 0 : sd * r * .02 + sd * .01, oz: -r * 2.4 + 20 }; }
  if (f === 'col') return { ox: (i % 4 - 1.5) * .03, oz: -Math.floor(i / 4) * 5 + 22 };
  if (f === 'wall') return { ox: (i % 10 - 4.5) * .06, oz: -Math.floor(i / 10) * 5 + 8 };
  const r = Math.sqrt(i + .5); return { ox: r * Math.cos(i * 2.39996) * .052, oz: r * Math.sin(i * 2.39996) * 4.6 };
}
function frontZ() { const n = Math.min(G.n, 40); let z = -1e9; for (let i = 0; i < n; i++) z = Math.max(z, slotOf(i, n).oz); return (n ? z : 0) + 7; }
function cycleForm() { if (!G || G.over || G.paused) return; const i = (FORM_ORDER.indexOf(G.form) + 1) % FORM_ORDER.length; G.form = FORM_ORDER[i]; save.form = G.form; persist(); const q = squadPos(); addText(q.x, q.y - 100, FORMS[G.form].name + ' FORMATION', '#cfe8ff'); sfx.tick(); }
function squadHalf() { return (.04 * Math.sqrt(Math.min(G.n, 40)) + .035) * formK().half; }
const demoK = () => (G && G.cls.demo > 0 ? 1.35 : 1);   // demolitions: splash damage and blast radius

const BUFF = { rapid: { name: 'OVERDRIVE', col: '#ffb03a', desc: 'fire rate x1.8 for 7 s' }, shield: { name: 'ARMOUR PLATING', col: '#8fd0ff', desc: 'blocks the next 4 hits' } };
// ---- radio chatter: short spoken barks from the squad (browser speech synthesis), rate-limited, switchable in Settings
const BK = {};
const BARKS = { t700: 'Heavy endo, armoured!', t1000: 'Liquid metal! Plasma only!', drone: 'Drones! Swarm inbound!', minelayer: 'Minelayer! Watch your step!', centurion: 'Centurion! Quad walker!', tank: 'HK tank! Take cover!', gunship: 'Hunter killer overhead!', behemoth: 'T-1 on the road!', harvester: 'Harvester! Scatter!', heavy: 'Heavy walker, dead ahead!', aerostat: 'Aerostat, watch the sky!', ogre: 'It is huge! Everything we have!' };
function bark(key, txt, gap) {
  if (save.chat === false || save.mute || typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return;
  const n = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  if (n - (BK.last || -1e9) < 3200 || n - (BK[key] === undefined ? -1e9 : BK[key]) < (gap || 14000)) return;
  BK.last = n; BK[key] = n;
  try {   // frantic, a little shouted, over a bed of radio static: key-up click, hiss and crackle while the voice runs, key-down click after
    const say = txt + (Math.random() < .35 && /!/.test(txt) ? ' ' + txt.split('!')[0] + '!' : '');
    const u = new SpeechSynthesisUtterance(say); u.rate = 1.32 + Math.random() * .2; u.pitch = .8 + Math.random() * .3; u.volume = clamp(save.vol === undefined ? 1 : save.vol, 0, 1);
    let on = false; const start = () => { if (!on) { on = true; radioBed(true); } }, stop = () => { if (on) { on = false; radioBed(false); } };
    u.onstart = start; u.onend = stop; u.onerror = stop;
    sfx.squelch(); setTimeout(start, 120); setTimeout(stop, 700 + say.length * 85);   // (timers are the fallback where start / end events never arrive)
    speechSynthesis.speak(u);
  } catch (e) {}
}
let BED = null;
function radioBed(on) { // white-noise hiss with random crackle under a radio voice
  const a = audio(); if (!a) return;
  if (!on) { if (BED) { try { BED.g.gain.setTargetAtTime(.0001, a.currentTime, .03); BED.s.stop(a.currentTime + .2); } catch (e) {} clearInterval(BED.t); BED = null; sfx.squelchEnd(); } return; }
  if (BED) return;
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = NB; s.loop = true; f.type = 'bandpass'; f.frequency.value = 2100; f.Q.value = .6; g.gain.value = .075 * clamp(save.vol === undefined ? 1 : save.vol, 0, 1) * 1.5;
  s.connect(f); f.connect(g); g.connect(OUT); s.start();
  BED = { s, g, t: setInterval(() => { if (Math.random() < .6) nz(0, .012 + Math.random() * .02, { f0: 1500 + Math.random() * 3000, q: 2, g: .22 }); }, 90) };
}
function activateBuff(k) {
  const q = squadPos(), B = BUFF[k];
  if (k === 'rapid') G.od = 7; else G.shield = 4;
  addText(q.x, q.y - 100, B.name, B.col); G.flash = Math.max(G.flash, .2); sfx.gate(); buzz(60);
  addParts(q.x, q.y - 30, 24, B.col, 240, .6); addLight(q.x, q.y - 40, 120, k === 'rapid' ? 'rgba(255,170,60,' : 'rgba(120,200,255,', .4);
}
// ---- tactical items: one slot, picked up from crates (dropped by big machines or left on the road), used with a tap on the slot, a double tap or Space
const ITEMS = {
  pulse:  { name: 'PULSE GRENADES',     g: 'PG', col: '#6ff3ff', n: 4, w: 4, desc: 'stuns machines nearby' },
  c4:     { name: 'C4 PACKS',           g: 'C4', col: '#ffb03a', n: 4, w: 3, desc: 'sticks to a machine; use again to detonate' },
  flare:  { name: 'SIGNAL FLARE',       g: 'SF', col: '#ff5a4a', n: 1, w: 3, desc: 'calls a 105mm barrage' },
  spike:  { name: 'REPROGRAMMING SPIKE', g: 'RS', col: '#8fe8a0', n: 1, w: 3, desc: 'turns an endoskeleton to your side' },
  cannon: { name: 'M-25 PLASMA CANNON', g: 'M25', col: '#c86bff', n: 1, w: 2, desc: 'piercing beam down the lane' },
  nuke:   { name: 'M-38 MINI-NUKE',     g: 'M38', col: '#ffe24a', n: 1, w: 1, desc: 'fired at the thickest group ahead; wipes out everything near the impact' },
};
const ipow = () => 1 + .3 * save.up.emp;
function rollItem(lv) {
  const ks = Object.keys(ITEMS).filter(k => k !== 'nuke' || lv >= 4); let r = Math.random() * ks.reduce((a, k) => a + ITEMS[k].w, 0);
  for (const k of ks) { r -= ITEMS[k].w; if (r <= 0) return k; }
  return ks[0];
}
function takeNanite() { const q = squadPos(), k = Math.max(3, Math.ceil(G.peak * .35)); G.n = Math.min(G.peak, G.n + k); addText(q.x, q.y - 100, '+' + k + ' NANITE REPAIR', '#6dffb5'); addParts(q.x, q.y - 30, 24, '#6dffb5', 200, .7); addLight(q.x, q.y - 40, 130, 'rgba(110,255,180,', .4); G.flash = Math.max(G.flash, .15); sfx.gate(); buzz(30); }
function takeItem(k) {
  const d = ITEMS[k], q = squadPos();
  if (G.item && G.item.k === k) G.item.n = Math.min(Math.max(d.n, 2) * 2, G.item.n + d.n); else G.item = { k, n: d.n };
  addText(q.x, q.y - 100, d.name, d.col); addText(q.x, q.y - 118, d.desc, '#cfd8e0'); G.flash = Math.max(G.flash, .15); sfx.gate(); buzz(40);
  addParts(q.x, q.y - 30, 18, d.col, 220, .6); addLight(q.x, q.y - 40, 110, 'rgba(255,255,255,', .3);
}
function dropCrate(e) { // big machines sometimes drop a supply crate where they fall
  const p = .4 * (1 + .08 * save.up.emp) * (1 + Math.min(.5, .15 * G.cls.tech));
  if (G.pups.length < 3 && e.wz - G.dist > 30 && Math.random() < p) G.pups.push({ k: G.n < G.peak * .5 && Math.random() < .4 ? 'nanite' : Math.random() < .5 ? (Math.random() < .55 ? 'rapid' : 'shield') : rollItem(G.lv), x: clamp(e.x, -.8, .8), wz: e.wz });
}
function activateGuard() {
  const mx = Math.round((5 + 1.2 * G.lv) * (1 + .25 * save.up.guard)), q = squadPos();
  if (G.guard && !G.guard.dead) { G.guard.hp = G.guard.max = Math.max(G.guard.max, mx); addText(q.x, q.y - 100, 'UNIT REPAIRED', '#6ff3ff'); }
  else { G.guard = { hp: mx, max: mx, dead: false }; G.gx = G.px; addText(q.x, q.y - 100, 'REPROGRAMMED UNIT ONLINE', '#6ff3ff'); }
  G.flash = Math.max(G.flash, .35); G.shake = Math.max(G.shake, 4); sfx.gate(); sfx.win();
  const gq = P(G.gx, GZ); addParts(gq.x, gq.y - 40 * gq.s, 26, '#6ff3ff', 240, .6); addSparks(gq.x, gq.y - 40 * gq.s, 12, gq.y, true); addLight(gq.x, gq.y - 40 * gq.s, 120 * gq.s + 30, 'rgba(110,230,255,', .4);
}
function destroyGuard(why) {
  const g = G.guard; if (!g || g.dead) return;
  const q = P(G.gx, GZ);
  g.dead = true; g.hp = 0;
  addParts(q.x, q.y - 40 * q.s, 36, '#9aa4ae', 280, .8); addParts(q.x, q.y - 40 * q.s, 22, '#ff9a2a', 300, .6); addSparks(q.x, q.y - 40 * q.s, 22, q.y, true);
  addLight(q.x, q.y - 40 * q.s, 130 * q.s + 30, 'rgba(255,160,70,', .4); G.shake = Math.max(G.shake, 10); G.flash = Math.max(G.flash, .3); sfx.boom();
  addText(q.x, q.y - 120 * q.s, why || 'UNIT TERMINATED', '#ff5a5a');
}
function hurtGuard(amt) {
  const g = G.guard; if (!g || g.dead) return;
  const q = P(G.gx, GZ), dmg = amt * 1.5;
  g.hp -= dmg; addSparks(q.x, q.y - 40 * q.s, 6, q.y, false); sfx.ping(); G.shake = Math.max(G.shake, 2);
  addText(q.x, q.y - 95 * q.s, '-' + Math.ceil(dmg), '#6ff3ff');
  if (g.hp <= 0) destroyGuard();
}
function trimClasses() {
  let tot = clsTotal();
  while (tot > G.n && tot > 0) { const ks = CLS.filter(k => G.cls[k] > 0); G.cls[ks[rint(0, ks.length - 1)]]--; tot--; }
}
function addSparks(x, y, n, gy, big) { // bouncing orange/yellow sparks: metal on metal
  const cols = ['#ffb02e', '#ffe08a', '#ff7a1a', '#fff3b0'];
  for (let i = 0; i < n; i++) {
    const an = -Math.PI / 2 + rnd(-1.2, 1.2), v = rnd(110, 300) * (big ? 1.35 : 1);
    pushPart({ x, y, vx: Math.cos(an) * v, vy: Math.sin(an) * v, life: rnd(.22, .42), max: .42, col: cols[i % 4], r: 2, g: 760, st: 1, by: gy });
  }
}
function addLight(x, y, r, col, life, ground) { if (G.lt.length < 36) G.lt.push({ x, y, r, col, life, max: life, gr: !!ground }); }

function hurt(amt, bx, quiet) {
  if (G.over) return;
  if (G.shield > 0 && !quiet) { G.shield--; const q0 = squadPos(); addText(q0.x, q0.y - 80, 'BLOCKED', '#8fd0ff'); addSparks(q0.x + (bx || 0), q0.y - 40, 8, q0.y, false); sfx.ping(); buzz(25); return; }   // armour plating soaks a hit
  G.n -= amt; trimClasses(); if (amt >= 3) bark('down', 'Man down!', 9000); else if (G.n > 0 && G.n <= G.peak * .25 && G.peak >= 8) bark('low', 'We are being overrun!', 25000); if (!quiet) buzz(amt >= 3 ? [110, 40, 110] : Math.min(220, 70 + amt * 30)); G.shake = Math.max(G.shake, quiet ? 2 : 6); G.hurtFlash = quiet ? .1 : .25; sfx.hurt();
  const q = squadPos();
  addParts(q.x + (bx || 0), q.y - 30, quiet ? 4 : 8, '#ff5a2a', 160, .5);
  addText(q.x, q.y - 80, '-' + amt, '#ff5a5a');
  checkLost();
}
function checkLost() { // once per sector the reserves arrive instead of the squad being wiped out
  if (G.n > 0 || G.over) return;
  if (!G.wind) { G.wind = true; G.n = Math.max(5, Math.ceil(G.peak * .25)); G.shield = Math.max(G.shield || 0, 3); const q = squadPos(); addText(q.x, q.y - 120, 'SECOND WIND: RESERVES ARRIVE', '#6dffb5'); addParts(q.x, q.y - 30, 30, '#6dffb5', 260, .8); addLight(q.x, q.y - 40, 160, 'rgba(110,255,180,', .5); G.flash = Math.max(G.flash, .4); G.shake = Math.max(G.shake, 8); sfx.gate(); bark('wind', 'Reserves! We are still in this!', 20000); return; }
  G.n = 0; G.over = true; G.endT = 1.2; sfx.lose();
}

const bigFoe = e => { const d = ET[e.t]; return !!(d.block || d.fly || d.tracked) && !d.swarm; };
const bossShielded = e => !!e.boss && G.en.some(o => !o.dead && !o.boss && o.wz < e.wz && bigFoe(o));   // the boss cannot be hurt while a large machine still stands in front of it
const armorOf = e => (e.armor !== undefined ? e.armor : (ET[e.t].armor || 0));
// ---- boss subsystems: shoot the left or right of the hull for the turret / launcher, use explosives for the tracks
const BPARTS = {
  tank: [{ k: 'L', name: 'LEFT TURRET' }, { k: 'R', name: 'SHOULDER LAUNCHER' }, { k: 'T', name: 'TRACK PODS' }],
  ogre: [{ k: 'L', name: 'LEFT TURRET' }, { k: 'R', name: 'SHOULDER LAUNCHER' }, { k: 'T', name: 'TRACK PODS' }],
  centurion: [{ k: 'L', name: 'LEFT GATLING' }, { k: 'R', name: 'MORTAR POD' }, { k: 'T', name: 'LEG ACTUATORS' }],
  harvester: [{ k: 'L', name: 'GRAPPLE ARM' }, { k: 'R', name: 'SHOULDER CANNON' }, { k: 'T', name: 'LEG ACTUATORS' }],
};
function partFor(e, o) {
  let k = null;
  if (o.explosive) k = 'T'; else if (o.bx !== undefined) { const r = (o.bx - e.x) / (ET[e.t].hw * e.sc); k = r < -.4 ? 'L' : r > .4 ? 'R' : null; }
  return k ? e.cp.find(p => p.k === k && !p.dead) || null : null;
}
function breakPart(e, cp) {
  cp.dead = true; cp.fr = 0; e['no' + cp.k] = true; e.hp -= e.max * .03;
  const sd = cp.k === 'L' ? -1 : cp.k === 'R' ? 1 : 0, q = P(e.x + sd * ET[e.t].hw * e.sc * .6, e.wz - G.dist), y = q.y - (cp.k === 'T' ? 14 : (HITH[e.t] || 60) * .8) * q.s * e.sc;
  addParts(q.x, y, 30, '#ff9a2a', 300, .7); addParts(q.x, y, 18, '#2c3036', 220, 1, 90); addSparks(q.x, y, 22, q.y, true); addLight(q.x, y, 110 * q.s + 30, 'rgba(255,170,70,', .5);
  addText(q.x, y - 24, cp.name + ' DESTROYED', '#ffb04a'); G.shake = Math.max(G.shake, 10); G.flash = Math.max(G.flash, .2); sfx.boom();
}
function dismember(e) { // endoskeletons lose an arm, then their legs, as they are shot up
  if (e.hp <= 0 || e.crawl || e.revived || (e.t !== 'grunt' && e.t !== 'gunner')) return;
  const f = e.hp / e.max, q = P(e.x, e.wz - G.dist), hy = q.y - 34 * q.s * e.sc;
  if (!e.armOff && f < .66) {
    e.armOff = true; addSparks(q.x, hy, 12, q.y, true);
    if (G.parts.length < 380) pushPart({ x: q.x + 6 * q.s, y: hy, vx: rnd(-70, 70), vy: -90, life: .9, max: .9, col: '#9aa4ae', r: 3.4, g: 300, by: q.y });
    if (e.t === 'gunner') addText(q.x, hy - 20, 'WEAPON ARM GONE', '#ffa05a');
  }
  if (!e.legOff && f < .33) {
    e.legOff = true; e.revived = true; e.crawl = true; e.t = 'runner'; e.flash = .12;
    addSparks(q.x, q.y - 22 * q.s, 10, q.y, true); addParts(q.x, q.y - 20 * q.s, 8, '#9aa4ae', 160, .5); addText(q.x, q.y - 70 * q.s, 'LEGS GONE', '#ff7a4a');
  }
}
let SURE_BLAST = false;   // grenade splash: endoskeletons killed by it always come back as crawlers
function hurtEnemy(e, dmg, o) { // front plating soaks fire first; flanking (squad well off to one side) bypasses it
  o = o || {};
  if (bossShielded(e)) return 'plate';   // shots glance off until the pre-boss is destroyed
  if (U('breaker') && (bigFoe(e) || e.boss)) dmg *= 1 + .06 * U('breaker');   // not part of the firepower that bosses are sized to
  const chrome = e.t === 't1000' && e.form === 'chrome', ballistic = chrome && !o.plasma && !o.explosive;
  if (chrome) dmg *= o.plasma ? 1.5 : o.explosive ? .6 : .05;   // chrome form soaks bullets; plasma and blasts get through
  if (e.cp) { const cp = partFor(e, o); if (cp) { cp.fr -= dmg / (e.max * .12); cp.hit = .15; if (cp.fr <= 0) breakPart(e, cp); dmg *= .5; } }   // a subsystem soaks the hit first; half of it still reaches the hull
  const raw = dmg * (o.ignoreArmor ? 1 : 1 - armorOf(e)); if (bigFoe(e) || e.boss) e.dmgAcc = (e.dmgAcc || 0) + raw; const flank = Math.abs(G.px - e.x) > .32;
  e.plateHit = 0; if (o.explosive) { e.blast = true; if (SURE_BLAST) e.sure = true; }
  if (e.plate > 0 && !flank) {
    e.plate -= raw * (o.plateMul || 1);
    if (e.plate <= 0) {
      e.plate = 0; const q = P(e.x, e.wz - G.dist);
      addSparks(q.x, q.y - (HITH[e.t] || 60) * q.s * e.sc, 18, q.y, true); addText(q.x, q.y - (HITH[e.t] || 60) * q.s * e.sc - 20, 'PLATING BREACHED', '#6ff3ff'); G.shake = Math.max(G.shake, 5); sfx.boom();
    }
    return 'plate';
  }
  e.hp -= raw; dismember(e); return ballistic ? 'plate' : 'hp';
}

function spawnScrap(x, wz, sc) {
  const n = clamp(Math.round(sc / 4), 1, 7), v = sc / n;
  for (let i = 0; i < n; i++) G.scr.push({ x: clamp(x + rnd(-.14, .14), -.9, .9), wz: wz + rnd(-10, 10), v, sp: rnd(0, 6) });
}

function kill(e) {
  if (e.dead) return;
  if (!e.revived && (e.t === 'grunt' || e.t === 'gunner') && e.blast && (e.sure || Math.random() < .75)) { // only a blast (rocket, grenade, air strike, crashing flyer) takes the legs off: it keeps coming as a slow crawler
    e.revived = true; const q0 = P(e.x, e.wz - G.dist);
    e.t = 'runner'; e.hp = e.max = Math.max(ET.runner.hp * hpScale(G.lv) * 2.2, (e.max || 0) * .3); e.flash = .12; e.crawl = true;
    addSparks(q0.x, q0.y - 22 * q0.s, 10, q0.y, true); addParts(q0.x, q0.y - 20 * q0.s, 8, '#9aa4ae', 160, .5);
    addText(q0.x, q0.y - 70 * q0.s, 'CRAWLING!', '#ff7a4a'); sfx.hit();
    return;
  }
  e.dead = true; G.kills++; if (!e.boss && bigFoe(e) && !e.crashed) dropCrate(e);
  if (!e.boss && G.deaths.length < 28) { const dd = ET[e.t], veh = (dd.block || dd.fly || dd.tracked) && !dd.swarm && e.t !== 'heavy' && !e.crashed; G.deaths.push({ e, t: 0, k: 0, big: false, bursts: [], kind: veh ? 'veh' : 'walk' }); }   // vehicles and flyers blow up; walkers go out in a small burst
  const d = ET[e.t], rel = e.wz - G.dist, q = P(e.x, rel);
  if (d.fuel && !G.over) { // the fuel cells go up: it takes neighbours with it, and the squad if it is close
    const fd = 55 + 8 * G.lv; explodeAt(e.x, e.wz, fd, null);
    if (rel < 70 && rel > -20 && Math.abs(e.x - G.px) < .25 + squadHalf() * .5) { hurt(1, (e.x - G.px) * LANE); addText(squadPos().x, squadPos().y - 100, 'FUEL BLAST', '#ff9a4a'); }
  }
  const big = d.block ? 1 : 0;
  const sc = Math.round(d.scrap * (1 + .1 * (G.lv - 1)) * 1.2);
  if (e.boss) G.scrap += sc; else spawnScrap(e.x, e.wz, sc);
  addParts(q.x, q.y - 30 * q.s, big ? 40 : 10, '#9aa4ae', big ? 260 : 150, .7);
  addParts(q.x, q.y - 30 * q.s, big ? 30 : 6, '#ff9a2a', big ? 300 : 160, .5, 0);
  addSparks(q.x, q.y - (HITH[e.t] || 40) * q.s * e.sc, big ? 24 : 8, q.y, true);
  if (e.cap) { G.n = Math.min(999, G.n + e.cap); addText(squadPos().x, squadPos().y - 95, '+' + e.cap + ' RESCUED', '#6dffb5'); e.cap = 0; }
  if (big) { G.shake = Math.max(G.shake, e.boss ? 16 : 9); G.flash = Math.max(G.flash, .4); sfx.boom(); addLight(q.x, q.y - 40 * q.s, 120 * q.s + 30, 'rgba(255,150,60,', .4); }
  else sfx.hit();
  if (e.boss && !(G.over && !G.won)) {   // (a squad that was already wiped out does not win just because a round was still in flight)
    G.deaths.push({ e, t: 0, k: 0, big: false, bursts: [], kind: 'boss' });   // the boss goes out in a chain of explosions and then a fireball
    G.bolts.length = 0; G.over = true; G.won = true; G.sweep = true; G.adv = 0; G.endT = 99; G.sweepT = 0; sfx.boom();   // camera holds; the squad walks on to collect the scrap
  }
}

const EMP_SPEED = 780, PULSE_RANGE = 680, NUKE_SPEED = 1500, NUKE_RANGE = 340;   // shockwaves travel outward at these world px per second; the M-38's blast reaches 340 px from where the warhead lands (about two sections of enemies)
const BIPED = new Set(['grunt', 'gunner', 'runner', 't700', 't400']);   // the endoskeletons: pulse grenades hold these for longer
const waveSpeed = w => (w.kind === 'nuke' ? NUKE_SPEED : EMP_SPEED);
function launchWave(kind, range, x, z) { G.waves.push({ t: 0, x: x === undefined ? G.px : x, z: z === undefined ? G.dist : z, hit: new Set(), kind, range }); }
function nukeBlast(x, z) { // the warhead lands: a flash, a shockwave from the impact point and fallout around it. The squad is never in the blast.
  const R = NUKE_RANGE * demoK(); G.flash = 1; G.shake = 22; sfx.emp(); sfx.boom(); launchWave('nuke', R, x, z); addText(W / 2, 330, 'M-38 DETONATION', ITEMS.nuke.col); buzz([200, 60, 200]);
  for (const o of G.obs) { if (o.dead) continue; if (o.k === 'overpass') { if (Math.abs(o.wz - z) < R + 200) collapseStart(o); } else if (Math.abs(o.wz - z) < R && Math.abs(o.x - x) < R / LANE + o.hw) obsBlast(o.x, o.wz, 1e4); }
  for (let i = 0; i < 5; i++) G.fallout.push({ x: clamp(x + rnd(-.2, .2), -.8, .8), wz: z + (i - 2) * 85, r: (.26 + rnd(0, .08)) * demoK(), t: 14 + rnd(0, 3), t0: 17, sd: Math.random() * 99 });
  const q = P(x, z - G.dist); addParts(q.x, q.y - 40 * q.s, 40, '#ffe9a0', 340, .9); addLight(q.x, q.y - 40 * q.s, 260 * q.s + 60, 'rgba(255,240,180,', .7, true);
}
function useItem() { // fire whatever the tactical slot holds; returns whether it did anything
  if (!G || G.over || G.paused || state !== 'play') return false;
  const it = G.item; if (!it) return false;
  const r = USE[it.k](); if (!r) { const q = squadPos(); addText(q.x, q.y - 100, 'NO TARGET', '#ff9a5a'); return false; }
  if (r !== 'free') it.n--;
  if (it.n <= 0) G.item = null;
  return true;
}
function fireEMP() { return useItem(); }
function empHit(e) { // what a pulse grenade does to one machine
  if (bossShielded(e)) { e.flash = .15; return false; }   // the pulse does nothing to a shielded boss
  const d = (30 + G.lv * 6) * ipow();
  if (!ET[e.t].fly) e.hp -= (e.boss ? e.max * .04 + d : d) * (1 - armorOf(e));
  e.flash = .2;
  const q = P(e.x, e.wz - G.dist); addSparks(q.x, q.y - (HITH[e.t] || 40) * q.s * e.sc, 10, q.y, true); addLight(q.x, q.y - 30 * q.s, 70 * q.s * e.sc + 20, 'rgba(110,210,255,', .3);
  if (e.hp > 0 || ET[e.t].fly) { e.stun = BIPED.has(e.t) ? 10 : 6; e.stunT = G.t; { const dd = ET[e.t], rl = e.wz - G.dist; e.stunRel = (dd.hold && !dd.block && rl <= dd.hold + 60) ? rl : undefined; } if (ET[e.t].fly && e.crash === undefined && !e.crashed) e.crash = 0; }
  if (e.hp <= 0) kill(e);
}
function nukeHit(e) { // the warhead's shockwave: every machine is vaporised, bosses lose their plating
  if (bossShielded(e)) { e.flash = .15; return false; }   // (false: try again next frame, once the machine in front has been destroyed)
  const d = ET[e.t], q = P(e.x, e.wz - G.dist);
  addSparks(q.x, q.y - (HITH[e.t] || 40) * q.s * e.sc, 14, q.y, true); addParts(q.x, q.y - 30 * q.s, 14, '#ffe9a0', 280, .6); addLight(q.x, q.y - 30 * q.s, 110 * q.s * e.sc + 30, 'rgba(255,240,180,', .4);
  e.flash = .3;
  if (e.boss) { if (e.plate > 0) e.plate *= .2; e.hp -= e.max * (e.plateMax ? .2 : .4); }
  else e.hp = 0;   // airborne machines are brought down with the rest
  if (e.hp <= 0) kill(e);
}
function empStep(dt) {
  for (const w of G.waves) {
    w.t += dt; const r = Math.min(waveSpeed(w) * w.t, w.range), hitFn = w.kind === 'nuke' ? nukeHit : empHit;
    for (const e of G.en.slice()) {
      if (e.dead || w.hit.has(e)) continue;
      if (Math.hypot((e.x - w.x) * LANE, e.wz - w.z) <= r) { w.hit.add(e); if (hitFn(e) === false) w.hit.delete(e); }
    }
    G.bolts = G.bolts.filter(b => Math.hypot((b.x - w.x) * LANE, G.dist + b.rz - w.z) > r);   // enemy fire is swept away as the ring passes
  }
  if (G.waves.length) G.waves = G.waves.filter(w => waveSpeed(w) * w.t < w.range + 80);
  // fallout from a warhead: it burns machines that stand in it (never the squad)
  for (const f of G.fallout) {
    f.t -= dt; if (f.t <= 0) continue;
    for (const e of G.en) if (!e.dead && !e.boss && Math.abs(e.x - f.x) < f.r && Math.abs(e.wz - f.wz) < 70) { hurtEnemy(e, (14 + 2 * G.lv) * dt, { ignoreArmor: true }); if (e.hp <= 0) kill(e); }
  }
  if (G.fallout.length) G.fallout = G.fallout.filter(f => f.t > 0);
  // C4: a pack flies to its machine, sticks, and goes off on a fuse unless the player sets it off first
  for (const c of G.c4) {
    if (c.dead) continue;
    if (c.e.dead) { c.dead = true; explodeAt(c.e.x, c.e.wz, 60, null); continue; }
    if (!c.stuck) { c.ft += dt / .4; if (c.ft >= 1) { c.stuck = true; sfx.ping(); } }
    else { c.fuse -= dt; if (c.fuse <= 0) c4Blow(c); }
  }
  if (G.c4.length) G.c4 = G.c4.filter(c => !c.dead);
  if (G.beam) { G.beam.t -= dt; if (G.beam.t <= 0) G.beam = null; }
  for (const n of G.nukes) { n.wz += 900 * dt; n.x += (n.tx - n.x) * Math.min(1, dt * 2.5); if (n.wz >= n.tz) { n.dead = true; nukeBlast(n.tx, n.tz); } else if (G.parts.length < 400 && Math.random() < .8) { const q = P(n.x, n.wz - G.dist); pushPart({ x: q.x + rnd(-2, 2), y: q.y - 36 * q.s, vx: rnd(-8, 8), vy: rnd(-6, 6), life: .6, max: .6, col: Math.random() < .5 ? '#d0d6dc' : '#ffb02e', r: 3, g: -10 }); } }
  if (G.nukes.length) G.nukes = G.nukes.filter(n => !n.dead);
  for (const u of G.uplinks) u.t -= dt;
  if (G.uplinks.length) G.uplinks = G.uplinks.filter(u => u.t > 0);
  for (const f of G.flares) f.life -= dt;
  if (G.flares.length) G.flares = G.flares.filter(f => f.life > 0);
}
function c4Blow(c) {
  if (c.dead) return; c.dead = true; const e = c.e;
  explodeAt(e.x, e.wz, 40, null); obsBlast(e.x, e.wz, 300);
  const dmg = ((340 + 50 * G.lv) * ipow() + e.max * (e.boss ? .12 : .35)) * demoK();
  hurtEnemy(e, dmg, { ignoreArmor: true, plateMul: 2, explosive: true }); e.flash = .3;
  const q = P(e.x, e.wz - G.dist); addText(q.x, q.y - (HITH[e.t] || 60) * q.s * e.sc - 30, 'C4', '#ffb03a'); G.flash = Math.max(G.flash, .25); G.shake = Math.max(G.shake, 10);
  if (e.hp <= 0) kill(e);
}
const USE = {
  pulse() { bark('u_pulse', 'Pulse out!', 8000); G.flash = .3; G.shake = 8; sfx.emp(); launchWave('pulse', PULSE_RANGE); addText(W / 2, 330, 'PULSE GRENADE', ITEMS.pulse.col); return true; },
  nuke() { // the warhead is fired down the road at the thickest knot of machines (never nearer than 400 px), and goes off where it lands
    bark('u_nuke', 'Get down! Warhead!', 8000);
    let bx = G.px, bz = G.dist + 520, bn = -1;
    for (const e of G.en) { if (e.dead) continue; const rel = e.wz - G.dist; if (rel < 380 || rel > 760) continue; let n = 0; for (const o of G.en) if (!o.dead && Math.hypot((o.x - e.x) * LANE, o.wz - e.wz) < NUKE_RANGE) n += (bigFoe(o) ? 3 : 1) + (o.boss ? 5 : 0); if (n > bn) { bn = n; bx = e.x; bz = e.wz; } }
    G.nukes.push({ x: G.px, wz: G.dist + 10, tx: clamp(bx, -.85, .85), tz: Math.max(bz, G.dist + 400) });
    sfx.rocket(); addText(W / 2, 330, 'M-38 AWAY', ITEMS.nuke.col); G.shake = Math.max(G.shake, 8);
    return true;
  },
  c4() {
    const armed = G.c4.filter(c => c.stuck && !c.dead);
    if (armed.length) { armed.forEach(c4Blow); return 'free'; }   // a second press sets off the packs already in place
    let tg = null, best = 1e9;
    for (const e of G.en) { if (e.dead) continue; const rel = e.wz - G.dist, big = bigFoe(e) && !ET[e.t].fly; if (rel < 30 || rel > 700) continue; const sc = rel + (big ? 0 : 400) + (ET[e.t].fly ? 800 : 0); if (sc < best) { best = sc; tg = e; } }
    if (!tg) return false;
    G.c4.push({ e: tg, ft: 0, stuck: false, fuse: 3.2, dead: false }); sfx.hit(); return true;
  },
  cannon() {
    bark('u_cannon', 'Clear the lane!', 8000);
    G.beam = { t: .75, max: .75, x: G.px }; G.flash = Math.max(G.flash, .5); G.shake = 14; sfx.cannon(); buzz([120, 40, 120]);
    addText(W / 2, 330, 'M-25 PLASMA CANNON', ITEMS.cannon.col);
    const dm = (500 + 60 * G.lv) * ipow();
    for (const e of G.en.slice().sort((a, b) => a.wz - b.wz)) {   // nearest first, so a machine in front is gone before the boss behind it is hit
      if (e.dead || e.wz - G.dist < 0 || Math.abs(e.x - G.px) > ET[e.t].hw * e.sc * .6 + .16) continue;
      if (e.boss) hurtEnemy(e, dm + e.max * .22, { ignoreArmor: true, plateMul: 1.5, plasma: true }); else e.hp = 0;   // nothing but a boss survives the beam
      e.flash = .3;
      const q = P(e.x, e.wz - G.dist); addSparks(q.x, q.y - (HITH[e.t] || 40) * q.s * e.sc, 16, q.y, true); addParts(q.x, q.y - 30 * q.s, 10, '#d9a0ff', 260, .5);
      if (e.hp <= 0) kill(e);
    }
    G.bolts = G.bolts.filter(b => Math.abs(b.x - G.px) > .2);
    for (const o of G.obs) if (!o.dead && Math.abs(o.x - G.px) < .2 + o.hw) obsBlast(o.x, o.wz, 900); for (const o of G.obs) if (o.k === 'overpass' && o.wz - G.dist < 900) collapseStart(o);
    return true;
  },
  spike() {
    bark('u_spike', 'Reprogramming!', 8000);
    let tg = null, best = 1e9;
    for (const e of G.en) { if (e.dead || e.boss || (e.t !== 'grunt' && e.t !== 'gunner' && e.t !== 't700')) continue; const rel = e.wz - G.dist; if (rel < 40 || rel > 560 || rel >= best) continue; best = rel; tg = e; }
    if (!tg) return false;
    const q = P(tg.x, tg.wz - G.dist), s0 = squadPos();
    tg.dead = true; G.kills++;   // the endoskeleton is taken over, not destroyed: no scrap, no wreck
    addSparks(q.x, q.y - 50 * q.s, 20, q.y, true); addParts(q.x, q.y - 50 * q.s, 14, '#8fe8a0', 200, .6); addLight(q.x, q.y - 50 * q.s, 90, 'rgba(140,255,170,', .4);
    for (let i = 1; i < 6; i++) addParts(s0.x + (q.x - s0.x) * i / 6, s0.y - 30 + (q.y - 50 * q.s - s0.y + 30) * i / 6, 2, '#8fe8a0', 40, .35, 0);   // the dart's trail
    activateGuard(); sfx.gate();
    return true;
  },
  flare() {
    bark('u_flare', 'Danger close! Artillery inbound!', 8000);
    let bx = 0, bz = G.dist + 450, bn = -1;
    for (const e of G.en) { if (e.dead) continue; const rel = e.wz - G.dist; if (rel < 160 || rel > 800) continue; let n = 0; for (const o of G.en) if (!o.dead && Math.abs(o.x - e.x) < .5 && Math.abs(o.wz - e.wz) < 105) n += bigFoe(o) ? 3 : 1; if (n > bn) { bn = n; bx = e.x; bz = e.wz; } }
    const f = { x: clamp(bx, -.7, .7), wz: bz, life: 5.4, t0: 5.4 }; G.flares.push(f);
    const dmg = (90 + 11 * G.lv) * ipow();
    for (let i = 0; i < 28; i++) G.later.push({ t: 1.7 + i * .1, f: () => explodeAt(clamp(f.x + rnd(-.55, .55), -.9, .9), f.wz + rnd(-120, 120), dmg, null) });
    addText(W / 2, 330, 'ARTILLERY INBOUND', ITEMS.flare.col); sfx.siren();
    return true;
  },
};
function collapseStart(o) {
  if (o.st !== 0) return; bark('over', 'The overpass is coming down!', 20000); o.st = 1; o.t = 1.5; o.open = Math.floor(Math.random() * 3);
  addText(W / 2, 300, 'OVERPASS COLLAPSING', '#ff9a4a'); sfx.hurt(); G.shake = Math.max(G.shake, 6);
}
function obsBlast(x, wz, dmg) { // explosions chew through barriers and rubble, and bring a weakened overpass down
  for (const o of G.obs) {
    if (o.dead) continue;
    if (o.k === 'overpass') { if (Math.abs(o.wz - wz) < 240) collapseStart(o); continue; }
    if (o.k === 'cable' || Math.abs(o.x - x) > .32 + o.hw || Math.abs(o.wz - wz) > 60 + o.len * .5) continue;
    o.hp -= dmg;
    if (o.hp <= 0) { o.dead = true; const q = P(o.x, o.wz - G.dist); addParts(q.x, q.y - 12 * q.s, 18, '#8a8f96', 220, .7, 120); addParts(q.x, q.y - 12 * q.s, 8, '#6b5a48', 160, .6, 120); sfx.hit(); }
  }
}
function obsStep(dt) {
  G.slow = 1; const sh = squadHalf();
  for (const o of G.obs) {
    if (o.dead) continue;
    const rel = o.wz - G.dist, k = o.k;
    if (o.hit > 0) o.hit -= dt;
    if (k === 'jersey' || k === 'slab' || k === 'truck' || k === 'sandbag') { // solid: the squad is slowed and shouldered to one side
      if (rel < 26 && rel > -o.len - 12 && Math.abs(G.px - o.x) < o.hw + sh * .55 && !G.over) { G.slow = Math.min(G.slow, .3); G.px = clamp(G.px + (G.px >= o.x ? 1 : -1) * 1.1 * dt, -.9, .9); }
    } else if (k === 'rubble') {
      if (Math.abs(rel) < o.len * .5 + 10 && Math.abs(G.px - o.x) < o.hw + sh * .55 && !G.over) G.slow = Math.min(G.slow, .6);
    } else if (k === 'trap') { // heavy tracked machines cannot cross a hedgehog line; infantry and endoskeletons squeeze through
      for (const e of G.en) {
        if (e.dead || !ET[e.t].tracked) continue;
        if (Math.abs(e.x - o.x) < o.hw + ET[e.t].hw * e.sc * .5 + .03 && e.wz < o.wz + o.len * .5 + 14 && e.wz > o.wz - 24) e.wz = o.wz + o.len * .5 + 14;
      }
    } else if (k === 'cable') { // a live cable: one jolt for whoever crosses it, a short stun for machines
      if (!o.sq && rel <= 0 && rel > -40) {
        o.sq = true;
        if (!G.over && Math.abs(G.px - o.x) < o.hw + sh * .5) { hurt(1, 0, true); G.hurtFlash = .2; sfx.arc(); const q = squadPos(); addSparks(q.x, q.y - 20, 14, q.y, true); addText(q.x, q.y - 100, 'LIVE CABLE', '#9fd8ff'); }
      }
      for (const e of G.en) {
        if (e.dead || ET[e.t].fly || (e.zap && e.zap.has(o))) continue;
        if (e.wz <= o.wz + 8 && e.wz > o.wz - 60 && Math.abs(e.x - o.x) < o.hw + ET[e.t].hw * e.sc * .5) {
          (e.zap = e.zap || new Set()).add(o); if (!bossShielded(e)) { e.stun = Math.max(e.stun || 0, 2.5); e.stunT = G.t; e.stunRel = undefined; }
          const q = P(e.x, e.wz - G.dist); addSparks(q.x, q.y - 40 * q.s, 12, q.y, true); sfx.arc();
        }
      }
    } else if (k === 'overpass' && o.st === 1) {
      o.t -= dt; const q = P(o.x, rel); if (Math.random() < dt * 30) addParts(q.x + rnd(-200, 200) * q.s, q.y - 200 * q.s, 1, '#9a8f84', 60, .8, 200);
      if (o.t <= 0) {
        o.st = 2; G.shake = Math.max(G.shake, 16); sfx.boom(); G.flash = Math.max(G.flash, .2);
        for (let i = 0; i < 3; i++) {
          if (i === o.open) continue;
          const lx = (i - 1) * .6; G.obs.push({ k: 'slab', x: lx, hw: .3, wz: o.wz, len: 40, hp: 220, dead: false, fall: 0, sd: Math.random() * 99 });
          if (!G.over && Math.abs(o.wz - G.dist) < 50 && Math.abs(G.px - lx) < .3 + sh * .4) { hurt(2, 0); addText(squadPos().x, squadPos().y - 100, 'CRUSHED', '#ff5a5a'); }
          for (const e of G.en.slice()) if (!e.dead && Math.abs(e.x - lx) < .3 && Math.abs(e.wz - o.wz) < 50 && !e.boss) { hurtEnemy(e, 400 * (1 + .1 * G.lv), { ignoreArmor: true, explosive: true }); if (e.hp <= 0) kill(e); }
          const q2 = P(lx, rel); addParts(q2.x, q2.y - 10 * q2.s, 20, '#9a8f84', 260, .9, 160);
        }
      }
    }
    if (k === 'slab' && o.fall < 1) o.fall = Math.min(1, o.fall + dt * 4);
  }
  G.obs = G.obs.filter(o => !o.dead && o.wz - G.dist > -120);
}
function drawEmpWave(w) { // the ring on the ground, in perspective, with a faint trailing echo
  const r = waveSpeed(w) * w.t, fade = clamp(1 - r / (w.range + 80), 0, 1), nk = w.kind === 'nuke';
  cx.save(); cx.globalCompositeOperation = 'lighter'; cx.lineCap = 'round'; cx.lineJoin = 'round';
  for (const [k, al, wd] of [[1, 1, 1], [.93, .4, .6], [.85, .18, .4]]) {
    const rr = r * k; if (rr < 4) continue;
    for (const [lw, col] of [[(nk ? 26 : 11) * wd, nk ? `rgba(255,170,50,${.4 * al * fade})` : `rgba(60,170,255,${.34 * al * fade})`], [(nk ? 7 : 3.2) * wd, nk ? `rgba(255,250,220,${.95 * al * fade})` : `rgba(220,248,255,${.95 * al * fade})`]]) {
      cx.strokeStyle = col; cx.beginPath(); let pen = false;
      for (let i = 0; i <= 120; i++) {
        const an = i / 120 * Math.PI * 2, rel = w.z + Math.sin(an) * rr - G.dist;
        if (rel < -60) { pen = false; continue; }
        const q = P(w.x + Math.cos(an) * rr / LANE, rel); cx.lineWidth = Math.max(1, lw * q.s);
        if (!pen) { cx.moveTo(q.x, q.y); pen = true; } else cx.lineTo(q.x, q.y);
      }
      cx.stroke();
    }
  }
  cx.restore();
}

// ---------------------------------------------------------------- update
function gateGood(o) { return o.k === 'add' ? o.v >= 0 : true; }
function applyGateOpt(o, bonus) {
  const q = squadPos(), yy = q.y - 90 - (bonus ? 22 : 0);
  if (o.k === 'add') {
    const v = Math.floor(o.v);
    if (v >= 0) { const gv = Math.round(v * (1 + GATE_K * U('gate'))); G.n = Math.min(999, G.n + gv); G.peak = Math.max(G.peak, G.n); sfx.gate(); addText(q.x, yy, '+' + gv, '#6fb5ff'); }
    else { const pen = Math.round(v * (1 - GATE_K * U('gate'))) - Math.floor(G.n * .1 * (1 - GATE_K * U('gate'))); G.n += pen; trimClasses(); buzz([100, 40, 100]); sfx.bad(); addText(q.x, yy, String(pen), '#ff5a5a'); G.shake = 5; checkLost(); }
  } else if (o.k === 'mul') {
    G.n = Math.min(999, Math.round(G.n * o.v * (1 + GATE_K * .6 * U('gate')))); G.peak = Math.max(G.peak, G.n); sfx.gate(); addText(q.x, yy, '×' + o.v, '#4dffa0');
  } else if (o.k === 'wpn') {
    if (G.tier < 5) { G.tier++; addText(q.x, yy, WEAPONS[G.tier].name.toUpperCase(), '#ffd24a'); }
    else { G.n = Math.min(999, G.n + 8); G.peak = Math.max(G.peak, G.n); addText(q.x, yy, '+8', '#6fb5ff'); }
    sfx.gate();
  } else if (o.k === 'rate') { G.rateG *= 1.15; sfx.gate(); addText(q.x, yy, 'FIRE RATE UP', '#c58aff'); }
  else if (o.k === 'dmg') { G.dmgG += .15; sfx.gate(); addText(q.x, yy, 'DAMAGE UP', '#c58aff'); }
  else if (o.k === 'cls') { G.n = Math.min(999, G.n + o.v + 3); G.peak = Math.max(G.peak, G.n); G.cls[o.c] += o.v; sfx.gate(); addText(q.x, yy, '+' + o.v + ' ' + CLASS[o.c].name, CLASS[o.c].col); }
  addParts(q.x, q.y - 40, 14, '#fff', 200, .5);
}
function applyGate(g) {
  if (g.applied) return; g.applied = true;   // one crossing, one outcome: however wide the squad is, a gate only ever fires once
  const side = g.px < 0 ? 'L' : 'R', other = side === 'L' ? 'R' : 'L';
  applyGateOpt(g[side]);
  if (G.cls.tech > 0 && Math.abs(g.px) < .05 * G.cls.tech && gateGood(g[other])) applyGateOpt(g[other], true); // tech operatives widen gate collection
}

const upMul = () => (1 + DMG_K * U('dmg')) * (1 + RATE_K * U('rate')) * (1 + CRIT_K * 1.5 * U('crit'));
const sizeDps = () => squadDps() / Math.pow(upMul(), SIZE_DISCOUNT);   // machines are sized to the squad's firepower, but only 40% of what the Damage / Fire Rate / Marksmanship upgrades add: those upgrades really shorten fights
function squadDps() {
  const w = WEAPONS[G.tier];
  const base = w.dmg * (1 + DMG_K * save.up.dmg) * G.dmgG, total = base * (1 + Math.min(G.n, 60) * .35 + Math.max(0, G.n - 60) * .1);
  const extra = Math.min(4, G.cls.mark) * 2.6 * base + Math.min(18, 3 * G.cls.shot) * .55 * base * Math.max(1, Math.min(2.5, 1 + G.n / 40)) * .6;   // marksman rounds + shotgun pellets (bosses hold at pellet range, so ~60%)
  const rate = (1 + RATE_K * save.up.rate) * G.rateG * (1 + Math.min(.3, .05 * G.cls.officer));
  const strike = G.cls.signal > 0 ? 90 * (1 + DMG_K * save.up.dmg) * G.dmgG * (1 + .25 * Math.min(4, G.cls.signal)) / Math.max(7, 16 - 2 * G.cls.signal) : 0;   // air strike dps on one target
  const gr = G.cls.gren > 0 ? Math.min(4, G.cls.gren) * 55 * (1 + DMG_K * save.up.dmg) * G.dmgG * rate / 1.7 : 0, sn = G.cls.sniper > 0 ? Math.min(4, G.cls.sniper) * base * 3.2 * rate / 1.5 : 0;
  return ((total + extra) / (w.int / rate) + strike + gr + sn) * (1 + CRIT_K * 1.5 * U('crit'));
}

function aimTarget(x0, zo, cone, pick) { // a machine ahead of a shooter, inside a diagonal cone (default wide; the squad uses a narrow one so steering still matters)
  const c = [];
  for (const e of G.en) {
    if (e.dead) continue;
    const rel = e.wz - G.dist - zo;
    if (rel < 40 || rel > 750 || Math.abs(e.x - x0) > (cone || .8)) continue;
    c.push({ e, d: rel + Math.abs(e.x - x0) * 300 });
  }
  if (!c.length) return null;
  c.sort((a, b) => a.d - b.d);
  if (!pick) return c[0].e;
  const r = Math.random(), k = c.length === 1 ? 0 : c.length === 2 ? (r < .65 ? 0 : 1) : (r < .5 ? 0 : r < .8 ? 1 : 2);   // each fighter makes his own call: usually the closest threat, often the next one
  return c[k].e;
}
function pushShot(b, src, zo) { // every fighter fires on his own clock: each round leaves at a random moment within the fire interval, riding along with the squad until then
  b.src = src; b.zo = zo; b.rx = b.x - G[src]; b.d = rnd(0, (G.fiv || .2) * .95); b.wz = b.pz = G.dist + zo; if (b.rng) b.sz = b.wz;
  G.bullets.push(b);
}
function volley() {
  const w = WEAPONS[G.tier], B = clamp(1 + Math.floor(G.n / 7), 1, 8);
  const total = w.dmg * (1 + DMG_K * save.up.dmg) * G.dmgG * (1 + Math.min(G.n, 60) * .35 + Math.max(0, G.n - 60) * .1);
  const each = total / B;
  const shown = Math.min(G.n, 40);
  for (let i = 0; i < B; i++) {
    const k = Math.floor(Math.random() * shown), sl = slotOf(k, shown), ox = sl.ox, zo = sl.oz + 7;   // a random fighter of the formation takes this shot, from his own spot (rounds leave from where he stands, not from the squad's centre)
    const x = clamp(G.px + ox + rnd(-w.spread, w.spread), -.95, .95);
    pushShot({ x, dmg: each * (Math.random() < CRIT_K * U('crit') ? 2.5 : 1), w, hit: [], vx: 0, tg: aimTarget(x, zo, SQUAD_CONE * formK().cone, true) }, 'px', zo);   // soldiers lean their shots toward a machine just off their line, but still have to be steered at the rest
  }
  const base = w.dmg * (1 + DMG_K * save.up.dmg) * G.dmgG;
  const fz = frontZ();   // specialists fire from the front rank
  if (G.cls.shot > 0) { // shotgunners: a spread of short-range pellets, brutal up close
    const np = Math.min(18, 3 * G.cls.shot), pw = { name: 'pellet', pierce: false, splash: 0, col: '#ffd27a', spread: 0 };
    for (let i = 0; i < np; i++) pushShot({ x: G.px + rnd(-.2, .2), rng: 300, dmg: base * .55 * Math.max(1, Math.min(2.5, 1 + G.n / 40)), w: pw, hit: [] }, 'px', fz);
  }
  if (G.cls.mark > 0) { // marksmen: armour-piercing rounds that go through everything in line
    const nm = Math.min(4, G.cls.mark), mw = { name: 'sniper', pierce: true, splash: 0, col: '#b9a8ff', spread: 0 };
    for (let i = 0; i < nm; i++) pushShot({ x: G.px + (i - (nm - 1) / 2) * .05, dmg: base * 2.6, w: mw, pen: true, hit: [] }, 'px', fz);
  }
  if (G.guard && !G.guard.dead) { // the reprogrammed unit picks its own target and shoots diagonally at it
    const tg = aimTarget(G.gx, GZ);
    for (let i = 0; i < 2; i++) pushShot({ x: G.gx + (i ? .03 : -.03), dmg: each, w, hit: [], tg, vx: 0 }, 'gx', GZ + 8);
    G.gflash = .12;
  }
  G.muzzle = .05; G.mz = 1; buzz(4, true);
  if (G.cls.shot > 0) sfx.shotgun();
  if (G.cls.mark > 0) sfx.sniper();
}

function explodeAt(x, wz, dmg, main) {
  const dk = demoK(); dmg *= dk;
  const rel = wz - G.dist, q = P(x, rel);
  addParts(q.x, q.y - 28 * q.s, 26, '#ff9a2a', 300, .6); addParts(q.x, q.y - 28 * q.s, 14, '#3a3f48', 220, .9, 120);
  addSparks(q.x, q.y - 28 * q.s, 10, q.y, true);
  addLight(q.x, q.y - 20 * q.s, 90 * q.s + 20, 'rgba(255,150,50,', .35, true);
  G.shake = Math.max(G.shake, 5); sfx.boom();
  for (const o of G.en.slice()) {
    if (o.dead) continue;
    if (Math.abs(o.x - x) > (.3 + ET[o.t].hw * o.sc * .5) * dk || Math.abs(o.wz - wz) > 60 * dk) continue;
    hurtEnemy(o, o === main ? dmg : dmg * .6, { ignoreArmor: true, plateMul: 1.5, explosive: true });
    if (o.hp <= 0) kill(o);
  }
  for (const h of G.haz) if (!h.dead && (h.k === 'uxo' || h.k === 'mine') && Math.abs(h.x - x) < .3 && Math.abs(h.wz - wz) < 60) detonateHaz(h, false);
  obsBlast(x, wz, dmg);
}
function detonateHaz(h, hitsSquad) {
  if (h.dead) return;
  h.dead = true;
  explodeAt(h.x, h.wz, 90, null);
  if (hitsSquad && !G.over) hurt(2 + LS(4, 6), 0);
}
function uplink() { // orbital uplink: strikes the nearest machines for a share of their health (so it keeps up with sector tiers)
  const lv = U('orbital'), n = 2 + Math.floor(lv / 5), pct = .01 + .0015 * lv;
  const t = G.en.filter(e => !e.dead && e.wz - G.dist > 80 && e.wz - G.dist < 750 && !bossShielded(e)).sort((a, b) => a.wz - b.wz).slice(0, n);
  if (!t.length) return false;
  t.forEach((e, i) => G.later.push({ t: i * .14, f: () => { if (e.dead) return; hurtEnemy(e, e.max * pct * (e.boss ? .5 : 1) + 60 * lv, { ignoreArmor: true, plateMul: 1, explosive: true }); G.uplinks.push({ x: e.x, wz: e.wz, t: .4 }); const q = P(e.x, e.wz - G.dist); addSparks(q.x, q.y - 40 * q.s, 12, q.y, true); addParts(q.x, q.y - 30 * q.s, 10, '#bff', 220, .5); sfx.boom(); if (e.hp <= 0) kill(e); } }));
  addText(W / 2, 330, 'ORBITAL UPLINK', '#9ff'); G.shake = Math.max(G.shake, 3); sfx.siren();
  return true;
}
function drawUplink(u) { const q = P(u.x, u.wz - G.dist), a = clamp(u.t / .4, 0, 1), w = 22 * q.s + 4; cx.save(); cx.globalCompositeOperation = 'lighter'; cx.fillStyle = `rgba(120,230,255,${.5 * a})`; cx.fillRect(q.x - w, 0, w * 2, q.y); cx.fillStyle = `rgba(235,252,255,${.95 * a})`; cx.fillRect(q.x - w * .35, 0, w * .7, q.y); cx.restore(); }
function airStrike() { // signaller: bombs the nearest machines ahead
  const t = G.en.filter(e => !e.dead && e.wz - G.dist > 80 && e.wz - G.dist < 750).sort((a, b) => a.wz - b.wz).slice(0, 2 + Math.min(4, G.cls.signal));
  if (!t.length) return false;
  const dmg = 90 * (1 + DMG_K * save.up.dmg) * G.dmgG * (1 + .25 * Math.min(4, G.cls.signal));
  t.forEach((e, i) => G.later.push({ t: i * .16, f: () => { if (!e.dead) explodeAt(e.x, e.wz, dmg, e); } }));   // game-time timers: they pause with the game and die with the run
  addText(W / 2, 330, 'AIR STRIKE', CLASS.signal.col); G.shake = Math.max(G.shake, 4); sfx.siren();
  return true;
}
function fireRockets() {
  const hn = Math.min(4, G.cls.heavy);
  if (!hn) return false;
  let tgt = null, best = 1e9;
  for (const e of G.en) {
    if (e.dead) continue;
    const rel = e.wz - G.dist;
    if (rel < 40 || rel > 850) continue;
    if (!(ET[e.t].block || ET[e.t].fly || armorOf(e) > 0 || e.boss)) continue;
    if (rel < best) { best = rel; tgt = e; }
  }
  if (!tgt) return false;
  const dmg = 80 * (1 + DMG_K * save.up.dmg) * G.dmgG;
  for (let i = 0; i < hn; i++) G.rockets.push({ x: G.px + (i - (hn - 1) / 2) * .08, wz: G.dist + 12, pz: G.dist + 12, dmg, tgt, delay: i * .12 });
  sfx.rocket();
  return true;
}

function fireGrenades() { // grenadiers lob 40mm rounds at the nearest endoskeletons
  const gn = Math.min(4, G.cls.gren); let n = 0;
  const c = G.en.filter(e => !e.dead && e.wz - G.dist > 50 && e.wz - G.dist < 700 && !ET[e.t].fly).sort((a, b) => ((BIPED.has(a.t) ? 0 : 400) + a.wz) - ((BIPED.has(b.t) ? 0 : 400) + b.wz));
  if (!c.length) return false;
  const dmg = 55 * (1 + DMG_K * save.up.dmg) * G.dmgG;
  for (let i = 0; i < gn; i++) { const tgt = c[Math.min(c.length - 1, i % Math.min(3, c.length))]; G.rockets.push({ x: G.px + (i - (gn - 1) / 2) * .06, wz: G.dist + 12, pz: G.dist + 12, dmg, tgt, delay: i * .14, gren: true }); n++; }
  sfx.thump(); return n > 0;
}
function fireSnipers() { // scout snipers: a thermal-scoped round at the weak point of the biggest machine in range
  const sn = Math.min(4, G.cls.sniper); let tg = null, bs = -1;
  for (const e of G.en) { if (e.dead || bossShielded(e)) continue; const rel = e.wz - G.dist; if (rel < 60 || rel > 900 || Math.abs(e.x - G.px) > .9) continue; const sc = (e.boss ? 3 : bigFoe(e) ? 2 : ET[e.t].armor ? 1 : 0) * 1000 - rel; if (sc > bs) { bs = sc; tg = e; } }
  G.snTg = tg; if (!tg) return false;
  const base = WEAPONS[G.tier].dmg * (1 + DMG_K * save.up.dmg) * G.dmgG, w = { name: 'sniper', pierce: false, splash: 0, col: '#ff9ad0', spread: 0 };
  for (let i = 0; i < sn; i++) pushShot({ x: G.px + (i - (sn - 1) / 2) * .04, dmg: base * 3.2, w, pen: true, crit: 2.5, hit: [], tg, vx: 0 }, 'px', frontZ());
  sfx.sniper(); return true;
}
function harvestGrab(e) {
  const q = squadPos();
  if (Math.abs(G.px - e.tx) < .17 + squadHalf() * .5 && G.n > 1) {
    const k = Math.min(G.n - 1, clamp(Math.round(G.n * .25), 2, 8));
    G.n -= k; trimClasses(); e.cap += k; buzz([140, 50, 140]); G.shake = Math.max(G.shake, 8); G.hurtFlash = .2; sfx.hurt();
    addParts(q.x, q.y - 30, 12, '#2c7be5', 180, .5); addText(q.x, q.y - 95, '-' + k + ' CAPTURED', '#ff9a5a');
  } else addText(q.x, q.y - 95, 'DODGED', '#6dffb5');
}

function enemyShoot(e, sideSign) { // bolts leave the weapon's muzzle (not the middle of the sprite), with a flash
  const d = ET[e.t], rel = e.wz - G.dist;
  if (rel < 20) return;
  const gOn = G.guard && !G.guard.dead && rel > GZ + 25, aimX = gOn ? G.gx : G.px, m = MUZ[e.t] || { ox: 0, h: 30 };
  const cnt = d.burst ? 1 : Math.max(1, (d.volley || 1) + (e.enr ? 2 : 0) - (e.noL ? 1 : 0)), tt = (rel - (gOn ? GZ : 0)) / 170;
  let dmg = d.dmg + (e.boss || d.block ? LS(3, 6) : 0);
  if (e.boss) dmg = Math.max(1, Math.round(G.n * .015 + dmg * .45));   // boss hits scale with the size of your squad, but never wipe it in a few volleys
  for (let i = 0; i < cnt; i++) {
    const mg = !!d.mg, off = mg ? (i - (cnt - 1) / 2) * .06 + rnd(-.03, .03) : (i - (cnt - 1) / 2) * (cnt > 1 ? Math.min(.22, .56 / (cnt - 1)) : 0) + (d.burst ? rnd(-.16, .16) : 0);   // minigun bursts stay tight and trail one another   // fan never wider than ~.56, so there is always a gap to dodge into
    let sd = m.alt ? (sideSign || (i % 2 ? 1 : -1)) : (m.fwd ? (e.face || 1) : 1), mox = m.ox, mh = m.h;
    if (e.vm) { mox = e.vm[0] * (e.vf || 1); mh = e.vm[1] + (e.lf || 0); sd = 1; }   // flying machines: the muzzle rides on the hover height   // muzzle position supplied with the sprite view
    const ox = mox * sd * e.sc / LANE, h0 = mh * e.sc, bx = e.x + ox;
    const rz = rel + (mg ? i * 16 : 0);   // minigun rounds follow each other down the lane
    let ax = aimX + off;
    if (G.cls.hack > 0 && Math.random() < Math.min(.4, .15 + .04 * (G.cls.hack - 1))) { ax = aimX + (Math.random() < .5 ? -1 : 1) * rnd(.4, .7); if (Math.random() < .25) { const sq = squadPos(); addText(sq.x + rnd(-40, 40), sq.y - 110, 'JAMMED', '#4dffb0'); } }   // the hacker has corrupted this round's targeting
    G.bolts.push({ rz, rz0: rz, h0, big: !mg && !!(d.volley || d.block), mg, x: bx, vx: (ax - bx) / tt, dmg });
    const q = P(bx, rel), my = q.y - h0 * q.s;   // muzzle flash right at the barrel
    addParts(q.x, my, 5, mg ? '#ffd27a' : '#e0c8ff', 110, .16, 0); addLight(q.x, my, (d.block ? 38 : 24) * q.s + 7, mg ? 'rgba(255,190,90,' : 'rgba(190,140,255,', .12, false);
    pushPart({ x: q.x, y: my, vx: 0, vy: 0, life: .09, max: .09, fl: mg ? '255,210,120' : '200,160,255', r: Math.max(5, 12 * q.s * e.sc), g: 0, sd: Math.random() * 99 });
  }
  e.muz = .12; if (d.mg) sfx.mg(); else sfx.zap(!!(d.volley || d.block));
}

function mortarRound(e) { // the Centurion's side pods: shells land around the squad, one lane always left open
  const open = Math.floor(Math.random() * 3);
  for (let i = 0; i < 3; i++) { if (i === open) continue; G.strikes.push({ x: clamp(G.px + (i - 1) * .36 + rnd(-.06, .06), -.88, .88), rz: rnd(6, 60), t: 1.8, max: 1.8, dmg: 2 + LS(4, 6), r: .16, fire: 0, storm: 1 }); }
}
function strikeRound(e) { // sky hunter paints the ground: weave through the gap while it is still shooting
  const gx = clamp(G.px + rnd(-.5, .5), -.6, .6);
  for (let x = -.84; x <= .86; x += .28) {
    if (Math.abs(x - gx) < .38) continue;   // a wide safe corridor to weave into
    G.strikes.push({ x, rz: rnd(4, 34), t: 1.35, max: 1.35, dmg: 2 + LS(3, 7), r: .14, fire: 0 });
  }
}

function update(dt) {
  G.t += dt;
  if (G.pn === undefined) G.pn = G.n; if (G.n < G.pn) G.lostN = (G.lostN || 0) + (G.pn - G.n); G.pn = G.n;   // soldiers lost this run (drives the star rating)
  for (const L of G.later) { L.t -= dt; if (L.t <= 0) { L.done = true; if (!G.over) L.f(); } }
  if (G.later.length) G.later = G.later.filter(L => !L.done);
  // input
  const dir = (keys.ArrowRight || keys.d || keys.D ? 1 : 0) - (keys.ArrowLeft || keys.a || keys.A ? 1 : 0);
  if (dir && !G.over) G.tx = clamp(G.tx + dir * dt * 1.4, -.88, .88);
  if (G.sweep) G.tx = 0;   // victory march: the squad glides to the centre of the lane and runs straight up it
  G.px += (G.tx - G.px) * Math.min(1, dt * (G.sweep ? 3.5 : 12));
  G.gx += (G.px - G.gx) * Math.min(1, dt * 6);
  if (G.guard && !G.guard.dead) { G.guard.hp -= dt * .4; if (G.guard.hp <= 0) destroyGuard('UNIT POWER LOST'); }   // the reprogramming is temporary   // the unit leads from the front, a touch behind your steering

  // world slows near tracked hunters (player input and fire stay full speed)
  const nearTank = G.en.some(e => (e.t === 'tank' || e.t === 'behemoth' || e.t === 'ogre') && !e.dead && e.wz - G.dist < 520 && e.wz - G.dist > -50 && !gateWait(e));
  G.ts += ((nearTank ? .6 : 1) - G.ts) * Math.min(1, dt * 3);
  const dw = dt * G.ts;
  // scroll
  let blocked = false;
  for (const e of G.en) {
    const d = ET[e.t];
    if (!e.dead && (d.block || e.boss) && e.wz - G.dist < d.hold + 60) {
      if (G.gates.some(g => !g.used && g.wz > G.dist - 5 && g.wz < e.wz)) continue;   // never pin the squad short of a gate: reach it first, then hold
      blocked = true; break;
    }
  }
  if (G.over) blocked = true;
  const target = blocked ? 0 : 90 * G.ts * (G.slow || 1);
  G.spd += (target - G.spd) * Math.min(1, dt * 6);
  G.dist += G.spd * dt;

  // decor
  while (decorNext < G.dist + 1500) {
    const side = Math.random() < .5 ? -1 : 1, r = Math.random();
    let t, x, sc = rnd(.8, 1.3);
    if (r < .5) { x = side * rnd(1.15, 2.3); t = [0, 0, 1, 2, 3, 4, 5, 6, 7, 9, 11, 12, 13, 14, 15, 16][rint(0, 15)]; }
    else { x = rnd(-.95, .95); t = [8, 9, 2, 7, 0, 5, 11, 12, 15, 16, 14][rint(0, 10)]; sc *= (t === 8 || t === 16) ? 1 : .55; }
    decor.push({ wz: decorNext, x, t, s: sc, id: Math.random() * 10, f: Math.random() < .5 ? -1 : 1 });
    decorNext += rnd(16, 40);
  }
  while (wallNext < G.dist + 1700) {
    const side = Math.random() < .5 ? -1 : 1;
    decor.push({ wz: wallNext, x: side * rnd(1.9, 2.9), t: 10, s: rnd(.9, 1.4), id: Math.random() * 10, f: -side });
    wallNext += rnd(90, 170);
  }
  decor = decor.filter(d => d.wz - G.dist > -150);

  // fire
  if (!G.over) {
    G.fcd -= dt;
    const last = G.n > 0 && G.peak >= 12 && G.n <= G.peak * .25 ? 1.2 : 1;   // last stand: a battered squad fights harder
    const iv = G.fiv = WEAPONS[G.tier].int / ((1 + RATE_K * save.up.rate) * G.rateG * (1 + Math.min(.3, .05 * G.cls.officer)) * (G.od > 0 ? 1.8 : 1) * (G.rn > .5 ? .9 : 1) * last);
    G.od = Math.max(0, (G.od || 0) - dt);
    let guard = 0;
    while (G.fcd <= 0 && guard++ < 5) { volley(); G.fcd += iv; }
    if (U('overdrive') > 0) { G.odT = (G.odT === undefined ? 12 : G.odT) - dt; if (G.odT <= 0 && !(G.od > 0)) { G.od = 3 + .4 * U('overdrive'); G.odT = Math.max(10, 45 - 2 * U('overdrive')); const q = squadPos(); addText(q.x, q.y - 110, 'OVERDRIVE CELLS', '#ffb03a'); sfx.gate(); } }
    if (U('orbital') > 0) { G.orbT = (G.orbT === undefined ? 6 : G.orbT) - dt; if (G.orbT <= 0) G.orbT = uplink() ? Math.max(4, 14 - .5 * U('orbital')) : 1.5; }
    if (G.cls.signal > 0) { G.sig -= dt; if (G.sig <= 0) G.sig = airStrike() ? Math.max(7, 16 - 2 * G.cls.signal) : 1.5; }
    G.rcd -= dt;
    if (G.cls.gren > 0) { G.gcd = (G.gcd || 0) - dt; if (G.gcd <= 0) G.gcd = fireGrenades() ? 1.7 / ((1 + RATE_K * save.up.rate) * G.rateG) : .4; }
    if (G.cls.sniper > 0) { G.scd = (G.scd || 0) - dt; if (G.scd <= 0) G.scd = fireSnipers() ? 1.5 / ((1 + RATE_K * save.up.rate) * G.rateG) : .4; } else G.snTg = null;
    if (G.rcd <= 0 && G.cls.heavy > 0) G.rcd = fireRockets() ? 2.4 / ((1 + RATE_K * save.up.rate) * G.rateG) : .4;
  }
  G.gflash = Math.max(0, (G.gflash || 0) - dt);
  G.muzzle = Math.max(0, (G.muzzle || 0) - dt);
  G.mz = Math.max(0, G.mz - dt * 7);

  // bullets
  for (const b of G.bullets) {
    if (b.d > 0) { b.d -= dt; if (b.d <= 0 && b.src === 'px' && !b.rng && !b.pen) sfx.shot(G.tier); b.x = G[b.src] + b.rx; b.wz = b.pz = G.dist + b.zo; if (b.sz !== undefined) b.sz = b.wz; continue; }   // still waiting for his turn to fire
    b.pz = b.wz; b.wz += 1100 * dt;
    if (b.tg) { if (!b.tg.dead && b.tg.wz > b.wz + 20) b.vx = clamp((b.tg.x - b.x) / ((b.tg.wz - b.wz) / 1100), -2.2, 2.2); }   // aimed rounds home in on their target
    if (b.vx) b.x += b.vx * dt;
    if (b.wz - G.dist > 1000 || (b.rng && b.wz - b.sz > b.rng)) { b.dead = true; continue; }
    for (const g of G.gates) {
      if (g.used || g.wz < b.pz - 8 || g.wz > b.wz + 8) continue;
      const o = b.x < 0 ? g.L : g.R;
      if (Math.abs(b.x) > 1.02) continue;
      if (o.k === 'add') { o.v = Math.min(40, o.v + .25); }
      b.dead = true; sfx.tick();
      const q = P(b.x, g.wz - G.dist); addParts(q.x, q.y - 40 * q.s, 2, '#9cf', 120, .25);
      break;
    }
    if (b.dead) continue;
    for (const h of G.haz) { // shoot unexploded ordnance from range
      if (h.dead || (h.k !== 'uxo' && h.k !== 'mine') || h.wz < b.pz - 10 || h.wz > b.wz + 10 || Math.abs(h.x - b.x) > h.hw + .03) continue;
      b.dead = true; detonateHaz(h, false); break;
    }
    if (b.dead) continue;
    for (const e of G.en) {
      if (e.dead || b.hit.indexOf(e) >= 0) continue;
      if (e.wz + 10 < b.pz || e.wz - 10 > b.wz) continue;
      if (Math.abs(e.x - b.x) > ET[e.t].hw * e.sc + .025) continue;
      b.hit.push(e);
      const crit = b.crit && (e.boss || bigFoe(e)) ? b.crit : 1, res = hurtEnemy(e, b.dmg * crit, { ignoreArmor: !!b.pen, bx: b.x, plasma: !!b.w.plasma }), rel = e.wz - G.dist, q = P(b.x, rel), hy = q.y - (HITH[e.t] || 40) * q.s * e.sc;
      addSparks(q.x, hy, res === 'plate' ? 7 : 4, q.y - 2, res === 'plate'); sfx.impact(res, G.tier, b.w.name);
      if (crit > 1 && res !== 'plate') { addText(q.x, hy - 30, 'CRITICAL', '#ff9ad0'); addSparks(q.x, hy, 10, q.y - 2, true); }
      if (G.lt.length < 20) addLight(q.x, hy, 24, 'rgba(255,170,60,', .07);
      if (b.w.splash) {
        for (const o of G.en) {
          if (o === e || o.dead || Math.abs(o.x - e.x) > b.w.splash * demoK() || Math.abs(o.wz - e.wz) > 50 * demoK()) continue;
          hurtEnemy(o, b.dmg * .5 * demoK()); if (o.hp <= 0) kill(o);
        }
        addParts(q.x, hy, 8, '#6dffb5', 180, .3);
      }
      if (e.hp <= 0) kill(e);
      if (!b.w.pierce) { b.dead = true; break; }
    }
  }
  G.bullets = G.bullets.filter(b => !b.dead);

  // rockets from ordnance gunners
  for (const r of G.rockets) {
    if (r.delay > 0) { r.delay -= dt; continue; }
    r.pz = r.wz; r.wz += (r.gren ? 430 : 520) * dt;
    if (r.tgt && !r.tgt.dead) r.x += clamp(r.tgt.x - r.x, -1, 1) * dt * 1.4;
    const rq = P(r.x, r.wz - G.dist);
    if (G.parts.length < 400) pushPart({ x: rq.x + rnd(-1, 1), y: rq.y - 30 * rq.s, vx: rnd(-10, 10), vy: rnd(-10, 10), life: .5, max: .5, col: Math.random() < .5 ? '#5a626e' : '#ffb02e', r: 2.4, g: -10 });
    if (r.wz - G.dist > 900) { r.dead = true; continue; }
    { const gt = G.gates.find(g => !g.used && g.wz >= r.pz && g.wz <= r.wz + 4); if (gt) { r.dead = true; const gq = P(r.x, gt.wz - G.dist); addParts(gq.x, gq.y - 40 * gq.s, 6, '#ffb040', 160, .3); continue; } }   // gates stop rockets too
    for (const e of G.en) {
      if (e.dead || e.wz + 12 < r.pz || e.wz - 12 > r.wz || Math.abs(e.x - r.x) > ET[e.t].hw * e.sc + .08) continue;
      r.dead = true; SURE_BLAST = !!r.gren; explodeAt(r.x, e.wz, r.dmg, e); SURE_BLAST = false; break;
    }
  }
  G.rockets = G.rockets.filter(r => !r.dead);

  // gates crossing
  for (const g of G.gates) {
    if (!g.used && g.wz - G.dist <= 0) { g.used = true; g.px = G.px; applyGate(g); }
  }

  // enemies
  for (const e of G.en) {
    if (e.dead) continue;
    const d = ET[e.t], rel = e.wz - G.dist;
    e.flash = Math.max(0, e.flash - dw); e.muz = Math.max(0, e.muz - dw);
    if (e.dmgAcc > 0 && (e.dmgT = (e.dmgT === undefined ? .3 : e.dmgT) - dw) <= 0) { e.dmgT = .35; const qd = P(e.x, rel), v = e.dmgAcc; e.dmgAcc = 0; addText(qd.x + rnd(-14, 14), qd.y - (e.sh0 || 90) * qd.s * e.sc - 10, '-' + (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v)), e.plate > 0 ? '#6ff3ff' : '#ffe6a0', 13); }   // aggregated damage readout on big machines
    { const fd = e.x - G.px; if (Math.abs(fd) > .07) e.face = fd > 0 ? -1 : 1; else if (!e.face) e.face = 1; }
    if (e.plateMax) { e.plateHit = (e.plateHit || 0) + dw; if (e.plate > 0 && e.plate < e.plateMax && e.plateHit > 1.5) e.plate = Math.min(e.plateMax, e.plate + e.plateMax * .06 * dw); }
    if (!e.scaled && rel < 450 && (d.block || d.fly || e.boss) && !d.swarm) { // big enemies size themselves to current firepower
      e.scaled = true;
      if (e.boss) { // boss health is sized from your actual damage output: the fight lasts ~25s + 3s per sector whatever your power level
        const base = e.hp; e.base0 = base;   // total (health + plating) takes roughly T seconds of accurate fire
        const fr = e.max > 0 ? clamp(e.hp / e.max, 0, 1) : 1; e.hp = e.max = bossSize(e, d, base); e.hp *= fr;   // keep whatever damage it already has
      } else { const k = clamp(Math.pow(sizeDps() / 150, .7), .4, 6) * (d.soft || 1) * tierMul(G.lv); e.hp *= k; e.max *= k; }
      if (e.boss) e.str = clamp(1 + G.n / 160, 1, 1.8);   // and hit harder / fire faster / call more reinforcements against a big squad
      if (d.plate) { const pf = e.plateMax ? e.plate / e.plateMax : 1; e.plateMax = e.max * d.plate; e.plate = e.plateMax * pf; }
      if (e.boss) { bark('boss', 'Boss contact! Hit it with everything!', 60000); G.warn = { t: 2.6, name: e.name || d.name || 'BOSS' }; G.shake = Math.max(G.shake, 14); G.flash = Math.max(G.flash, .35); sfx.siren(); }
    }
    if (e.boss && e.scaled && !G.over) { // keep tracking your firepower: if the squad or weapon grows later (late multiplier gates, upgrades) the boss grows with it, never shrinks
      const tgt = bossSize(e, d, e.base0 || e.max);
      if (tgt > e.max * 1.02) {
        const f = e.hp / e.max; e.max = tgt; e.hp = f * tgt;
        if (e.plateMax) { const pf = e.plate / e.plateMax; e.plateMax = tgt * d.plate; e.plate = pf * e.plateMax; }
      } else if (tgt < e.max * .92) { // the squad has shrunk: the boss eases down with it (5% a second, same fraction of health left) so it never becomes unkillable
        const nm = Math.max(tgt, e.max * (1 - .05 * dt)), f = e.hp / e.max; e.max = nm; e.hp = f * nm;
        if (e.plateMax) { const pf = e.plate / e.plateMax; e.plateMax = nm * d.plate; e.plate = pf * e.plateMax; }
      }
      e.str = Math.max(e.str || 1, clamp(1 + G.n / 160, 1, 1.8));
    }
    if (e.boss && BPARTS[e.t] && !e.cp && e.scaled) e.cp = BPARTS[e.t].map(p => ({ k: p.k, name: p.name, fr: 1, dead: false, hit: 0 }));
    if (e.cp) for (const p of e.cp) if (p.hit > 0) p.hit -= dt;
    if (e.boss) { const f = e.hp / e.max; e.gl = f < .25 ? 2 : f < .5 ? 1 : 0; if (e.gl && e.bx !== undefined && Math.random() < dw * (e.gl === 2 ? 2.4 : 1)) e.bx = clamp(e.bx + rnd(-.07, .07), -.8, .8); }   // a badly damaged boss glitches: twitching steering, slower, fewer shots
    const gate = gateBefore(e);   // the nearest unused gate between the squad and this enemy
    if (gate && G.dist < gate.wz - 380) continue;   // machines stay put until the squad is nearly at the gate in front of them
    if (!e.active) { if (rel < 900) { e.active = true; toughen(e); if (e.t === 'grunt' || e.t === 'gunner') bark('t800', 'T-800 incoming!', 40000); else if (BARKS[e.t] && !bigFoe(e)) bark('b_' + e.t, BARKS[e.t], 25000); if (!e.boss && bigFoe(e) && G.t - (G.lastAlert || -9) > 3.5) { G.lastAlert = G.t; G.alert = { t: 2.4, txt: (ET[e.t].name || '').toUpperCase() + ' INCOMING', fly: !!ET[e.t].fly }; if (BARKS[e.t]) bark('b_' + e.t, BARKS[e.t], 20000); } } else continue; }
    if (e.t === 'gunner' && e.hp < e.max * .6 && Math.random() < dw * 5) { const q1 = P(e.x, rel); pushPart({ x: q1.x + rnd(-3, 3), y: q1.y - 48 * q1.s, vx: rnd(-8, 8), vy: -28, life: .8, max: .8, col: '#2a2f38', r: 3, g: -18 }); }
    if (e.crash !== undefined || e.rise !== undefined) { // an EMP'd flyer drops out of the sky and blows up on impact
      if (e.crash !== undefined) {
        e.crash += dt; const q2 = P(e.x, rel), hgt = (e.t === 'gunship' ? 120 : 22) * q2.s * e.sc * (1 - clamp(e.crash / .8, 0, 1));
        if (G.parts.length < 380) { addParts(q2.x, q2.y - hgt, 2, '#ff8a2a', 120, .5, 60); addParts(q2.x, q2.y - hgt, 2, '#2a2d33', 90, .9, -30); if (Math.random() < .5) addSparks(q2.x, q2.y - hgt, 3, q2.y, false); }
        if (e.crash >= .8 && !e.crashed) {
          e.crashed = true; const q3 = P(e.x, rel), sd = 50 + 8 * G.lv;
          addParts(q3.x, q3.y - 10 * q3.s, 50, '#ff9a2a', 420, 1, 200); addParts(q3.x, q3.y - 10 * q3.s, 40, '#30343b', 280, 1.4, 80); addSparks(q3.x, q3.y - 10 * q3.s, 40, q3.y, true);
          addLight(q3.x, q3.y - 20 * q3.s, 130 * q3.s + 40, 'rgba(255,150,50,', .7, true); G.shake = Math.max(G.shake, e.boss ? 18 : 12); G.flash = Math.max(G.flash, .35); sfx.boom();
          explodeAt(e.x, e.wz, sd, null);
          if (e.boss) { e.hp -= e.max * .3; if (e.hp <= 0) e.hp = 1; } else { e.hp = 0; kill(e); }
          if (e.dead) continue;
        }
      } else { e.rise += dt / .8; if (e.rise >= 1) e.rise = undefined; }
    }
    if (e.stun > 0) { // offline: no movement, no weapons, no melee (grounded flyers wait out the stun, then lift off again)
      e.stun -= dt; if (e.stun <= 0 && e.crashed && e.boss) { e.crash = undefined; e.crashed = false; e.rise = 0; }
      if (e.stunRel !== undefined) e.wz = G.dist + e.stunRel;   // units that hold station against the squad stay put relative to it while the world scrolls
      continue;
    }
    if (e.t === 't1000') { // the shape-shifter alternates between a fast blade stance and slow bullet-proof chrome
      e.ft = (e.ft === undefined ? 2.5 : e.ft) - dw; if (!e.form) e.form = 'blade';
      if (e.ft <= 0) { e.form = e.form === 'blade' ? 'chrome' : 'blade'; e.ft = e.form === 'chrome' ? 5 : 4; const qm = P(e.x, rel); addSparks(qm.x, qm.y - 40 * qm.s, 16, qm.y, true); addLight(qm.x, qm.y - 40 * qm.s, 70 * qm.s + 20, 'rgba(220,235,255,', .35); addText(qm.x, qm.y - 90 * qm.s, e.form === 'chrome' ? 'CHROME: BULLETS WON\'T WORK' : 'BLADE', '#dbe8ff'); sfx.ping(); }
    }
    // movement: Endos never run - they advance at a slow, deliberate pace
    let rolling = false;   // tracked vehicles may only change lane while they are actually driving forward
    if (d.hold && rel <= d.hold) {
      if (!d.block) e.wz = G.dist + d.hold;
    } else { e.wz -= d.spd * dw * (e.t === 't1000' && e.form === 'chrome' ? .45 : 1) * (e.noT ? .5 : 1) * (e.gl === 2 ? .55 : e.gl === 1 ? .8 : 1) * (e.armOff && !d.shoot ? .8 : 1); rolling = true; }
    if (d.fly && rel <= d.hold + 50) { e.fph = (e.fph || 0) + dw; e.wz += (G.dist + d.hold + 45 * Math.sin(e.fph * .8 + e.id) - e.wz) * Math.min(1, dw * 4); }   // flyers ease into their hover bob instead of snapping to it   // own clock: it freezes with the machine and resumes exactly where it stopped
    if (gate && e.wz < gate.wz + 40) { e.wz = gate.wz + 40; rolling = false; }   // and never come through a gate before the squad has
    if (d.weave) {   // predictable slow weave
      if (e.bx === undefined) e.bx = e.x;
      if (!d.tracked) { e.wph = (e.wph || 0) + dw; e.x = clamp(e.bx + d.weave * (e.noT ? .5 : 1) * Math.sin(e.wph * .7 + e.id), -.88, .88); }
      else if (rolling) { e.wph = (e.wph || 0) + dw; e.x = clamp(e.bx + d.weave * (e.noT ? .5 : 1) * Math.sin(e.wph * .7 + e.id), -.88, .88); }   // tracks: no sidestepping when stopped, they can only turn on the spot (the sprite turns to face the squad)
    }
    else e.x += clamp(G.px - e.x, -1, 1) * dw * d.chase;
    e.x = clamp(e.x, -.9, .9);
    // melee
    if (!d.hold && !G.over && G.guard && !G.guard.dead && rel <= GZ + 6 && rel > GZ - 12 && Math.abs(e.x - G.gx) < d.hw + .13) { // melee machines slam into the unit first
      hurtGuard(1 + LS(5, 5)); e.dead = true; const gq = P(e.x, rel); addParts(gq.x, gq.y - 30 * gq.s, 8, '#9aa4ae', 160, .5); continue;
    }
    if (d.stab && rel <= 8 && !G.over && Math.abs(e.x - G.px) < d.hw + squadHalf() * .9) { // blades: it cuts into the squad and is thrown back by the rush, then comes again
      hurt(2 + LS(6, 5), (e.x - G.px) * LANE); e.wz = G.dist + 130; e.stun = Math.max(e.stun || 0, .7); e.stunT = G.t; e.stunRel = undefined; const qs = P(e.x, 0); addSparks(qs.x, qs.y - 40, 14, qs.y, true); continue;
    }
    if (!d.hold && rel <= 6 && !G.over) {
      if (Math.abs(e.x - G.px) < d.hw + squadHalf() * .9) { hurt(1 + LS(5, 5), (e.x - G.px) * LANE); e.dead = true; addParts(P(e.x, 0).x, P(e.x, 0).y - 30, 8, '#9aa4ae', 160, .5); continue; }
    }
    if (rel < -60) { e.dead = true; continue; }
    if (d.mines && !G.over && rel < 700 && rel > 120) { // minelayer: active proximity mines creep toward the squad
      e.mnc = (e.mnc === undefined ? 1.2 : e.mnc) - dw;
      if (e.mnc <= 0 && G.haz.filter(h => h.k === 'mine' && !h.dead).length < 6) { e.mnc = d.mines * rnd(.8, 1.3); G.haz.push({ k: 'mine', x: clamp(e.x + rnd(-.1, .1), -.85, .85), hw: .1, wz: e.wz - 30, len: 24, arm: .9, tick: 0, dead: false }); sfx.ping(); }
    }
    // harvester grab: aim (tracks you) -> lock (marker freezes) -> slam -> recover
    if (d.grab && !e.noL && rel <= d.hold + 80 && !G.over) {
      let want = 0;
      if (e.gs === 'idle') { e.gcd -= dw; if (e.gcd <= 0) { e.gs = 'aim'; e.gt = 1.2; e.tx = G.px; } }
      else if (e.gs === 'aim') { want = .55; e.tx += (G.px - e.tx) * Math.min(1, dw * 5); e.gt -= dw; if (e.gt <= 0) { e.gs = 'lock'; e.gt = .6; } }
      else if (e.gs === 'lock') { want = .75; e.gt -= dw; if (e.gt <= 0) { e.gs = 'slam'; e.gt = .25; harvestGrab(e); } }
      else if (e.gs === 'slam') { want = 1; e.gt -= dw; if (e.gt <= 0) { e.gs = 'recover'; e.gt = .9; } }
      else if (e.gs === 'recover') { e.gt -= dw; if (e.gt <= 0) { e.gs = 'idle'; e.gcd = e.enr ? 3.2 : 5; } }
      e.ext += (want - e.ext) * Math.min(1, dw * 8);
    }
    // shooting
    if (d.shoot && !gate && rel <= (d.hold || 400) + 80 && rel > 20 && !G.over) {   // nothing fires across an uncollected gate
      if (d.burst && e.burst > 0) {
        e.bcd -= dw;
        if (e.bcd <= 0) { e.bcd = .11; e.burst--; e.side = -(e.side || 1); enemyShoot(e, e.side); }
      } else {
        e.fcd -= dw;
        if (e.fcd <= 0) { e.fcd = d.shoot * rnd(.9, 1.2) * (e.enr ? .6 : 1) / (e.str ? 1 + (e.str - 1) * .5 : 1) * (e.armOff ? 1.9 : 1) * (e.noR ? 1.25 : 1) * (e.gl === 2 ? 1.7 : e.gl === 1 ? 1.25 : 1); if (d.burst) { e.burst = e.enr ? 10 : 7; e.bcd = 0; } else enemyShoot(e); }
      }
    }
    // boss: enrage at half health, periodic reinforcements, sky hunter air strikes
    if (e.boss && !G.over) {
      if (!e.enr && e.hp < e.max * .5) { e.enr = true; G.shake = 12; G.flash = .5; sfx.boom(); addText(P(e.x, rel).x, 130, 'ENRAGED', '#ff5a5a'); }
      if (rel < 600) {
        e.sum -= dw;
        if (e.sum <= 0) {
          e.sum = (e.enr ? 6 : 9) / (e.str ? 1 + (e.str - 1) * .4 : 1);
          const cnt = Math.min(8, (e.t === 'ogre' ? 3 : 2) + Math.floor(G.n / 80));
          for (let i = 0; i < cnt; i++) { const m = mk('grunt', e.wz - 20 - i * 10, clamp(e.x + rnd(-.5, .5), -.8, .8), hpScale(G.lv) * G.assist); m.active = true; m.tough = true; m.hp = m.max = Math.max(m.max, sizeDps() * .05 * G.assist * tierMul(G.lv)); G.en.push(m); }   // a boss's reinforcements are fodder, not a wall that soaks the squad's whole output
        }
        if (d.mortar && !e.noR) { e.mrt = (e.mrt === undefined ? 4 : e.mrt) - dw; if (e.mrt <= 0) { e.mrt = e.enr ? 4.5 : 7; mortarRound(e); addText(W / 2, 150, 'MORTARS!', '#ff9a3a'); sfx.siren(); } }
        if ((e.t === 'ogre' || e.t === 'harvester') && e.enr && !e.noR) { // enraged ground bosses call down a barrage: weave through the gap while the markers burn
          if (e.sk2 === undefined) e.sk2 = 3; e.sk2 -= dw;
          if (e.sk2 <= 0) { strikeRound(e); e.sk2 = e.hp < e.max * .25 ? 5.5 : 8; addText(W / 2, 150, 'BARRAGE!', '#ff5a5a'); G.shake = Math.max(G.shake, 4); sfx.siren(); }
        }
        if (e.t === 'gunship') {
          if (e.sk === undefined) e.sk = 4;
          if (e.striking > 0) { e.skr -= dw; if (e.skr <= 0) { strikeRound(e); e.striking--; e.skr = 1.5; if (e.striking === 0) e.sk = e.enr ? 7 : 11; } }
          else { e.sk -= dw; if (e.sk <= 0) { e.striking = 3; e.skr = 0; addText(W / 2, 150, 'AIR STRIKE!', '#ff5a5a'); } }
        }
      }
    }
  }
  G.en = G.en.filter(e => !e.dead);
  for (const Dh of G.deaths) deathStep(Dh, dt);
  empStep(dt); obsStep(dt); envStep(dt); weatherStep(dt);
  if (G.item && G.item.k === 'c4' && !G.over && G.en.some(e => !e.dead && bigFoe(e) && !ET[e.t].fly && e.wz - G.dist > 100 && e.wz - G.dist < 600)) bark('c4', 'Drop the C4!', 25000);
  if (G.deaths.length) G.deaths = G.deaths.filter(Dh => Dh.t < (Dh.tb || 0) + 3.2 * (Dh.ts || 1) + .1);

  // hazards on the ground: unexploded ordnance
  for (const h of G.haz) {
    const rel = h.wz - G.dist;
    if (h.dead || rel < -h.len || G.over) continue;
    const over = Math.abs(G.px - h.x) < h.hw + squadHalf() * .55;
    if (h.k === 'mine') { // creeps toward the squad, arms, then goes off on proximity (shoot it, or step aside)
      h.wz -= 26 * dt; h.x += clamp(G.px - h.x, -1, 1) * dt * .22; h.arm -= dt;
      if (h.arm <= 0 && Math.abs(h.wz - G.dist) < 16 && Math.abs(G.px - h.x) < h.hw + squadHalf() * .5) detonateHaz(h, true);
      continue;
    }
    if (h.k === 'uxo') { if (Math.abs(rel) < 14 && over) detonateHaz(h, true); continue; }
  }
  G.haz = G.haz.filter(h => !h.dead && h.wz - G.dist > -120);

  if (G.n > 0 && G.n < G.peak && U('rein') > 0 && !G.over) { // field reinforcements: reserves rejoin on a timer
    G.reinT += dt; const per = 22 - 1.8 * U('rein');
    if (G.reinT >= per) { G.reinT = 0; const k = 1 + Math.floor(G.peak * .01 * U('rein') / 4); G.n = Math.min(G.peak, G.n + k); const q = squadPos(); addText(q.x + rnd(-30, 30), q.y - 100, '+' + k + ' REINFORCED', '#9ad0ff'); }
  }
  // field medic: when the squad is nearly gone a nanite repair kit drops ahead of it
  if (G.cls.medic > 0 && !G.over) {
    G.kitCd = (G.kitCd || 0) - dt;
    if (G.kitCd <= 0 && G.n <= G.peak * .3 && !G.pups.some(p => p.k === 'nanite')) { G.pups.push({ k: 'nanite', x: clamp(G.px + rnd(-.35, .35), -.8, .8), wz: G.dist + 240 }); G.kitCd = 24; addText(W / 2, 300, 'NANITE KIT DROPPED', '#6dffb5'); sfx.gate(); }
  }
  // power-up crates: only one is ever on the road, and none while a unit is active
  for (const pl of G.pupPlan) {
    if (pl.done) continue;
    const rel = pl.wz - G.dist;
    if (rel < 250) { pl.done = true; continue; }
    if (pl.k === 'supply') { if (rel < 1300) { G.pups.push({ k: rollItem(G.lv), x: pl.x, wz: pl.wz }); pl.done = true; } continue; }
    if (rel < 1300 && !G.pups.some(p => p.k === 'guard') && (!G.guard || G.guard.dead)) { G.pups.push({ k: 'guard', x: pl.x, wz: pl.wz }); pl.done = true; }
  }
  // steer the squad onto a crate to bring the reprogrammed unit online
  for (const pu of G.pups) {
    const rel = pu.wz - G.dist;
    if (rel <= 22 && rel > -26 && Math.abs(pu.x - G.px) < .3 + squadHalf() * .45 + .04 * G.cls.tech && !G.over) { pu.got = true; if (pu.k === 'guard') activateGuard(); else if (pu.k === 'nanite') takeNanite(); else if (ITEMS[pu.k]) takeItem(pu.k); else activateBuff(pu.k); }
    if (rel < -30) pu.got = true;
  }
  G.pups = G.pups.filter(pu => !pu.got);

  // end-of-sector sweep: camera stays put, squad marches up the lane steering through the scrap
  if (G.sweep) {
    const blast = G.deaths.some(Dh => Dh.kind === 'boss' && Dh.t < 3.6);   // the squad holds position until the explosion has burned out
    if (!blast) G.sweepT += dt;
    const ahead = G.scr.filter(c => c.wz - G.dist - G.adv > -10).sort((a, b) => a.wz - b.wz)[0];
    if (blast) { /* wait: the squad only glides to the centre */ }
    else if (ahead) { const tgt = (ahead.wz - G.dist) - G.adv; G.adv += (Math.abs(G.px) > .12 ? 40 : tgt > 60 ? 150 : 70) * dt; }   // wait for the glide to the centre, then straight on
    else if (G.sweepT > .6) { G.sweep = false; G.endT = 1.2; }
    if (G.sweepT > 14 || G.adv > 1100) { G.sweep = false; G.endT = .8; }
  }
  const ADV = G.adv || 0;
  // scrap chunks: the squad vacuums them up as it runs past
  const tw = .04 * G.cls.tech, fp = formK().pick;
  for (const c of G.scr) {
    const rel = c.wz - G.dist - ADV, dx = G.px - c.x;
    if (rel < 140 && Math.abs(dx) < (G.sweep ? 1.4 : .5 + tw)) {   // during the victory march the whole lane's scrap is pulled in
      c.x += clamp(dx, -1, 1) * dt * 1.4; c.wz -= 60 * dt; }
    if (rel <= 25 && rel > -20 && Math.abs(c.x - G.px) < (G.sweep ? 1.4 : (.28 + squadHalf() * .3 + tw) * fp) && (!G.over || G.won)) {
      c.got = true; G.scrap += Math.round(c.v * (G.rn > .5 ? 1.3 : 1)); sfx.clink(); const q = squadPos();
      addText(q.x + rnd(-14, 14), q.y - 60, '+' + Math.round(c.v), '#ffd24a'); addParts(q.x + dx * LANE * .2, q.y - 20, 4, '#ffd24a', 120, .3);
      if (G.cls.medic > 0 && G.guard && !G.guard.dead && G.guard.hp < G.guard.max && Math.random() < Math.min(.5, .12 * G.cls.medic)) { G.guard.hp = Math.min(G.guard.max, G.guard.hp + 2); const gq = P(G.gx, GZ); addText(gq.x, gq.y - 100 * gq.s, '+REPAIR', '#6ff3ff'); }
      if (G.cls.medic > 0 && G.n < G.peak && Math.random() < Math.min(.5, .1 * G.cls.medic)) { G.n++; addText(q.x, q.y - 100, '+1 REVIVED', '#6dffb5'); sfx.gate(); }
    }
    if (rel < -20) c.got = true;
  }
  G.scr = G.scr.filter(c => !c.got);

  // sky hunter strikes
  for (const st of G.strikes) {
    if (!st.fire) {
      st.t -= dt;
      if (st.t <= 0) {
        st.fire = .3; G.shake = Math.max(G.shake, 7); sfx.boom(); obsBlast(st.x, G.dist + st.rz, 60);
        if (G.guard && !G.guard.dead && Math.abs(G.gx - st.x) < st.r + .08) hurtGuard(st.dmg);
        if (!G.over && Math.abs(G.px - st.x) < st.r + squadHalf() * .5) hurt(st.dmg, (st.x - G.px) * LANE);
      }
    } else { st.fire -= dt; if (st.fire <= 0) st.dead = true; }
  }
  G.strikes = G.strikes.filter(st => !st.dead);

  // enemy bolts
  for (const b of G.bolts) {
    b.rz -= 170 * dw; b.x += b.vx * dw;
    for (const g of G.gates) { const gr = g.wz - G.dist; if (!g.used && gr > 0 && b.rz <= gr && b.rz + 170 * dw > gr) { b.dead = true; const q = P(b.x, gr); addParts(q.x, q.y - 40 * q.s, 3, '#9cf', 120, .25); break; } }   // gates stop enemy fire
    if (b.dead) continue;
    for (const o of G.obs) { // trucks and sandbags soak enemy fire while they last
      if (o.dead || (o.k !== 'truck' && o.k !== 'sandbag')) continue;
      const orz = o.wz - G.dist;
      if (orz > 2 && b.rz <= orz && b.rz + 170 * dw > orz && Math.abs(b.x - o.x) < o.hw + .05) {
        b.dead = true; o.hp -= b.dmg * 30 * (b.big ? 2 : 1); o.hit = .15; const q = P(b.x, orz); addSparks(q.x, q.y - 14 * q.s, 6, q.y, true); sfx.ping();
        if (o.hp <= 0) { o.dead = true; if (o.k === 'truck') explodeAt(o.x, o.wz, 50, null); else { addParts(q.x, q.y - 10 * q.s, 14, '#b8a070', 200, .7, 160); sfx.hit(); } }
        break;
      }
    }
    if (b.dead) continue;
    if (G.guard && !G.guard.dead && !b.passed && b.rz <= GZ) { b.passed = true; if (Math.abs(b.x - G.gx) < .14) { b.dead = true; hurtGuard(b.dmg); continue; } }   // the unit soaks the shot
    if (b.rz <= 0) {
      b.dead = true;
      if (Math.abs(b.x - G.px) < squadHalf() + .1) hurt(b.dmg, (b.x - G.px) * LANE);
    }
  }
  G.bolts = G.bolts.filter(b => !b.dead);

  // dust kicked up by the squad's boots and by big machines' feet and tracks
  if (G.spd > 10 && !G.over && save.fx !== 'low' && G.parts.length < 330 && Math.random() < .5) { const q = squadPos(), hw = squadHalf() * LANE; pushPart({ x: q.x + rnd(-hw, hw), y: q.y + rnd(-4, 6), vx: rnd(-12, 12), vy: rnd(-16, -6), life: .7, max: .7, col: '#6a7488', r: rnd(2, 4.5), g: -4 }); }
  if (save.fx !== 'low' && G.parts.length < 330) for (const e of G.en) { if (e.dead || e.stun > 0 || !(e.t === 'heavy' || e.t === 'tank' || e.t === 'behemoth' || e.t === 'ogre' || e.t === 'harvester') || e.wz - G.dist > 700 || e.wz - G.dist < 20 || Math.random() > .14) continue; const q = P(e.x, e.wz - G.dist), w = 26 * q.s * e.sc; pushPart({ x: q.x + rnd(-w, w), y: q.y + rnd(-2, 3), vx: rnd(-10, 10), vy: rnd(-12, -4), life: .8, max: .8, col: '#556072', r: rnd(2, 5) * Math.max(.6, q.s * 2), g: -3 }); }
  // fx
  for (const p of G.parts) {
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt;
    if (p.by !== undefined && p.y > p.by && p.vy > 0) { p.y = p.by; p.vy *= -.42; p.vx *= .7; }   // sparks bounce off the ground
  }
  G.parts = G.parts.filter(p => p.life > 0);
  for (const l of G.lt) l.life -= dt;
  G.lt = G.lt.filter(l => l.life > 0);
  for (const t of G.texts) { t.life -= dt * .9; t.y -= 40 * dt; }
  G.texts = G.texts.filter(t => t.life > 0);
  if (G.warn) { G.warn.t -= dt; if (G.warn.t <= 0) G.warn = null; }
  if (G.alert) { G.alert.t -= dt; if (G.alert.t <= 0) G.alert = null; }
  G.dcd = (G.dcd === undefined ? rnd(4, 9) : G.dcd) - dt; if (G.dcd <= 0) { G.dcd = rnd(7, 16); sfx.distant(); if (!AMB) ambStart(); }   // distant artillery now and then (and start the ambience if the audio only unlocked after the sector began)
  G.shake = Math.max(0, G.shake - dt * 30);
  G.flash = Math.max(0, G.flash - dt * 2);
  G.hurtFlash = Math.max(0, G.hurtFlash - dt);

  if (G.over && !G.sweep) { G.endT -= dt; if (G.endT <= 0) endRun(); }
}

function endRun() {
  state = 'end'; ambStop();
  const win = G.won;
  if (G.endless) { if (win) { endlessAdvance(); return; } endlessOver(); return; }
  if (!G.banked) { // pay out once, however many times the Armory is opened from this screen
    G.banked = true;
    const lostN = G.lostN || 0, peak = Math.max(1, G.peak || G.n || 1);
    G.stars = !win ? 0 : lostN <= peak * .15 ? 3 : lostN <= peak * .6 ? 2 : 1;   // how much of the squad you kept
    G.bonus = win ? Math.round((100 + 20 * G.lv) * (1 + .25 * (G.stars - 1))) : 0;
    if (win) { save.fails[G.lv] = 0; if (G.lv >= save.best) save.best = G.lv + 1; if ((save.stars[G.lv] || 0) < G.stars) save.stars[G.lv] = G.stars; }
    else save.fails[G.lv] = (save.fails[G.lv] || 0) + 1;
    save.scrap += G.scrap + G.bonus; persist();
  }
  const next = Math.min(G.lv + 1, save.best), st = '\u2605'.repeat(G.stars) + '\u2606'.repeat(3 - G.stars);
  ov(`<div class="panel"><h2>${win ? 'SECTOR CLEARED' : 'SQUAD LOST'}</h2>
    ${win ? `<div style="font-size:2em;color:#ffd24a;letter-spacing:.15em;margin:.1em 0">${st}</div>` : ''}
    <div class="res">Machines destroyed: ${G.kills}<br>Soldiers lost: ${G.lostN || 0}<br>Scrap: +${G.scrap}${G.bonus ? ' &nbsp;Bonus: +' + G.bonus : ''}<br>Total: ${save.scrap}
    ${!win ? '<br><small>Scrap kept. Next try: machines 10% weaker (max 30%).</small>' : '<br><small>Keep the squad alive for more stars and a bigger bonus.</small>'}</div>
    ${win ? '<button class="big" id="nx">NEXT SECTOR</button>' : '<button class="big" id="rt">RETRY</button>'}
    <button id="arm">Armory</button><button id="mn">Menu</button></div>`);
  if (win) { if (!G.sfxDone) sfx.win(); G.sfxDone = true; $('nx').onclick = () => { save.sel = next; persist(); startLevel(next); }; }
  else $('rt').onclick = () => startLevel(G.lv);
  $('arm').onclick = () => showArmory('end');
  $('mn').onclick = showMenu;
}

// ---- endless survival: sector after sector, no end but the loss of the squad; scored locally and on the shared leaderboard
const startEndless = () => { beep(300, .05); startLevel(1, { endless: true }); };
function endlessAdvance() {
  const E = G.endless, bonus = Math.round(100 + 20 * G.lv);
  startLevel(G.lv + 1, { endless: true, sectors: E.sectors + 1, kills: E.kills + G.kills, scrap: E.scrap + G.scrap + bonus, lost: E.lost + (G.lostN || 0), carry: { n: G.n, peak: G.peak, cls: Object.assign({}, G.cls), item: G.item, form: G.form } });
  addText(W / 2, 330, 'SECTOR ' + (G.lv - 1) + ' HELD', '#6dffb5'); G.sfxDone = true; sfx.win();
}
const endlessScore = E => E.sectors * 1000 + E.kills * 10 + Math.floor(E.scrap / 5);
async function netBoard(post) { // the shared leaderboard lives on the game server (tools/serve.py); offline or from a file it just reports null
  try { if (typeof fetch !== 'function') return null; const r = await fetch('api/scores', post ? { method: 'POST', body: JSON.stringify(post) } : { cache: 'no-store' }); if (!r.ok) return null; const j = await r.json(); return Array.isArray(j) ? j : null; } catch (e) { return null; }
}
function boardHtml(rows, mine) { return rows.length ? rows.slice(0, 8).map((r, i) => `<div style="display:flex;justify-content:space-between;gap:.6em;font-size:.82em;${mine && r.score === mine.s && r.name === mine.n ? 'color:#ffd24a' : ''}"><span>${i + 1}. ${String(r.name || r.n).replace(/[<>&]/g, '')}</span><span>${r.score !== undefined ? r.score : r.s} · S${r.sectors !== undefined ? r.sectors : r.sec}</span></div>`).join('') : '<small>no runs yet</small>'; }
function endlessOver() {
  const E = G.endless, tot = { sectors: E.sectors, kills: E.kills + G.kills, scrap: E.scrap + G.scrap };
  if (!G.banked) { G.banked = true; save.scrap += tot.scrap; G.eScore = endlessScore(tot); save.board.push({ n: save.name, s: G.eScore, sec: tot.sectors, k: tot.kills }); save.board.sort((a, b) => b.s - a.s); save.board = save.board.slice(0, 10); persist(); }
  const sc = G.eScore, lg = G;
  ov(`<div class="panel"><h2>SURVIVAL OVER</h2>
    <div class="res">Sectors held: ${tot.sectors}<br>Machines destroyed: ${tot.kills}<br>Scrap: +${tot.scrap}<br><b style="color:#ffd24a;font-size:1.3em">SCORE ${sc}</b></div>
    <p class="tag" style="margin:.2em 0">Your best</p><div id="lb1">${boardHtml(save.board, { s: sc, n: save.name })}</div>
    <p class="tag" style="margin:.5em 0 .2em">Shared leaderboard</p><div id="lb2"><small>checking server...</small></div>
    <input id="nm" maxlength="14" value="${save.name}" style="margin:.5em 0;text-align:center;font:inherit;padding:.4em;width:80%">
    <button id="sub">Submit score</button>
    <button class="big" id="rt">SURVIVE AGAIN</button><button id="arm">Armory</button><button id="mn">Menu</button></div>`);
  const show = j => { const el = $('lb2'); if (el && state === 'end') el.innerHTML = j ? boardHtml(j, { s: sc, n: save.name }) : '<small>server not reachable: score kept on this device</small>'; };
  netBoard().then(show);
  $('sub').onclick = () => { const nm = ($('nm').value || '').replace(/[^A-Za-z0-9 _.\-]/g, '').slice(0, 14).trim() || 'RESISTANCE'; save.name = nm; persist(); $('sub').disabled = true; netBoard({ name: nm, score: sc, sectors: tot.sectors, kills: tot.kills }).then(j => { show(j); const b = $('sub'); if (b) b.textContent = j ? 'Submitted' : 'Could not reach the server'; }); };
  $('rt').onclick = startEndless; $('arm').onclick = () => showArmory('end'); $('mn').onclick = showMenu;
}
function showBoard() {
  ov(`<div class="panel"><h2>LEADERBOARD</h2><p class="tag" style="margin:0 0 .2em">Endless Survival: your best</p><div>${boardHtml(save.board)}</div>
    <p class="tag" style="margin:.6em 0 .2em">Shared leaderboard</p><div id="lb2"><small>checking server...</small></div><button class="big" id="bk">Back</button></div>`);
  netBoard().then(j => { const el = $('lb2'); if (el && state === 'menu') el.innerHTML = j ? boardHtml(j) : '<small>server not reachable</small>'; });
  $('bk').onclick = showMenu;
}

// ---------------------------------------------------------------- UI overlays
function ov(html) { const u = $('ui'); u.innerHTML = html; u.style.display = 'flex'; }
function ovHide() { $('ui').style.display = 'none'; }

function showMenu() {
  state = 'menu'; G = null; buildScenery(lookFor(save.sel || 1)); ambStop(); musicStart();
  const lv = save.sel;
  ov(`<div class="panel"><h1>CYBER<br>NET ATTACK</h1>
    <p class="tag">Hold the line. Slay the machines.</p>
    <div class="sel"><button id="pv" ${lv <= 1 ? 'disabled' : ''}>◀</button>
      <div>SECTOR ${lv}<br><small>${SECT[(lv - 1) % SECT.length]}</small>${tierOf(lv) > 0 ? `<br><small style="color:#ff6a5a">Threat tier ${tierOf(lv)}: enemy health +${Math.round((tierMul(lv) - 1) * 100)}%</small>` : ''}<br><small style="color:#ffd24a">${'\u2605'.repeat(save.stars[lv] || 0)}${'\u2606'.repeat(3 - (save.stars[lv] || 0))}</small><br><small style="color:#ff9a7a">Boss: ${ET[BOSS_KINDS[(lv - 1) % BOSS_KINDS.length]].name}</small></div>
      <button id="nxl" ${lv >= save.best ? 'disabled' : ''}>▶</button></div>
    <button class="big" id="play">DEPLOY</button>
    <button id="sq">Squad · ${save.loadout.length ? save.loadout.map(k => CLASS[k].name).join(', ') : 'riflemen only'}</button>
    <button id="endl">Endless Survival${save.board.length ? ' · best ' + save.board[0].s : ''}</button><button id="lbd">Leaderboard</button>
    <button id="arm">Armory · ${save.scrap} scrap</button>
    <button id="set">Settings</button>
    <p class="foot">No timers. No energy. No purchases.<br>Drag to move · auto-fire · shoot gates to boost them · Space or double tap = use item</p></div>`);
  $('play').onclick = () => { beep(300, .05); startLevel(save.sel); };
  $('pv').onclick = () => { if (save.sel > 1) { save.sel--; persist(); } showMenu(); };
  $('nxl').onclick = () => { if (save.sel < save.best) { save.sel++; persist(); } showMenu(); };
  $('arm').onclick = () => showArmory('menu');
  $('sq').onclick = showSquad;
  $('endl').onclick = startEndless; $('lbd').onclick = showBoard;
  $('set').onclick = () => showSettings('menu');
}

let settingsFrom = 'menu';   // where Back returns to: the main menu or the pause screen
function showSettings(from) {
  if (from === 'menu' || from === 'pause') settingsFrom = from;
  ov(`<div class="panel"><h2>SETTINGS</h2>
    <button id="snd">Sound: ${save.mute ? 'OFF' : 'ON'}</button>
    <button id="crt">Arcade CRT: ${save.crt ? 'ON' : 'OFF'}</button>
    <button id="mus">Music: ${save.music === false ? 'OFF' : 'ON'}</button><button id="tst">Test sound</button><div class="tag" id="ast" style="margin:0">Audio: ${audioStatus()}</div>
    <label class="sl">Effects volume <input id="vol" type="range" min="0" max="100" value="${Math.round((save.vol === undefined ? 1 : save.vol) * 100)}"></label>
    <label class="sl">Music volume <input id="mvol" type="range" min="0" max="100" value="${Math.round((save.mvol === undefined ? 1 : save.mvol) * 100)}"></label>
    <button id="zm">Camera: ${ZNAMES[clamp(zoomLevel(), 0, 2)]}</button>
    <button id="fxq">Effects: ${save.fx === 'low' ? 'REDUCED (faster)' : 'FULL'}</button>
    <button id="vib">Vibration: ${save.vib === false ? 'OFF' : 'ON'}</button>
    <button id="chat">Radio chatter: ${save.chat === false ? 'OFF' : 'ON'}</button>
    <button id="rst" style="margin-top:1em;border-color:#a33">Reset progress…</button>
    <button class="big" id="bk" style="margin-top:1em">Back</button></div>`);
  $('snd').onclick = () => { save.mute = !save.mute; persist(); if (save.mute) { musicStop(); ambStop(); } else if (state === 'menu') musicStart(); else if (state === 'play') ambStart(); showSettings(); };
  $('mus').onclick = () => { save.music = save.music === false; persist(); if (save.music === false) musicStop(); else if (state === 'menu') musicStart(); showSettings(); };
  $('crt').onclick = () => { save.crt = !save.crt; persist(); applyCRT(); showSettings(); };
  $('tst').onclick = () => { unlockAudio(); sfx.shot(2); setTimeout(() => sfx.impact('plate', 2, 'x'), 160); setTimeout(() => sfx.clink(), 320); setTimeout(() => { sfx.boom(); const e = $('ast'); if (e) e.textContent = 'Audio: ' + audioStatus() + (save.mute ? ' - sound is switched OFF above' : ''); }, 480); };
  $('vol').oninput = e => { save.vol = e.target.value / 100; if (OUT) OUT.gain.value = 1.5 * save.vol; persist(); };
  $('vol').onchange = () => { unlockAudio(); sfx.shot(2); };
  $('mvol').oninput = e => { save.mvol = e.target.value / 100; if (MUS && AC) MUS.gain.setTargetAtTime(.5 * save.mvol, AC.currentTime, .05); persist(); };
  $('zm').onclick = () => { save.zoom = (clamp(zoomLevel(), 0, 2) + 1) % 3; persist(); showSettings(); };
  $('fxq').onclick = () => { save.fx = save.fx === 'low' ? 'full' : 'low'; persist(); showSettings(); };
  $('vib').onclick = () => { save.vib = save.vib === false; persist(); if (save.vib) buzz(60); showSettings(); };
  $('chat').onclick = () => { save.chat = save.chat === false; persist(); if (save.chat) bark('test', 'Radio check. Resistance, copy.', 0); showSettings(); };
  $('rst').onclick = confirmReset;
  $('bk').onclick = () => { if (settingsFrom === 'pause' && G && state === 'play') setPause(true); else showMenu(); };
}

function confirmReset() { // wipes scrap, upgrades, sectors and unlocked classes (sound and CRT settings are kept)
  ov(`<div class="panel"><h2>RESET PROGRESS?</h2>
    <div class="res">This deletes your scrap, all armory upgrades,<br>unlocked sectors and unlocked classes.<br>It cannot be undone.</div>
    <button class="big" id="yes" style="background:#8a1d1d">YES, START FRESH</button><button id="no">Cancel</button></div>`);
  $('no').onclick = showSettings;
  $('yes').onclick = () => {
    const keep = { mute: save.mute, crt: save.crt, vib: save.vib, music: save.music, vol: save.vol, mvol: save.mvol, fx: save.fx, zoom: save.zoom, chat: save.chat, form: save.form };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(keep)); } catch (e) {}
    try { location.reload(); } catch (e) {}
  };
}

function armoryBuy(k) { // raise an upgrade one level: a level you have already paid for (then downgraded) comes back free
  const u = UPS[k], l = save.up[k], paid = Math.max(save.paid[k] || 0, l);
  if (l >= u.max) return false;
  if (l >= paid) { if (save.scrap < u.cost(l)) return false; save.scrap -= u.cost(l); save.paid[k] = l + 1; }
  save.up[k] = l + 1; persist(); return true;
}
function armoryDown(k) { // lower an upgrade one level: no refund, and the level stays marked as paid
  if (save.up[k] <= 0) return false;
  save.paid[k] = Math.max(save.paid[k] || 0, save.up[k]); save.up[k]--; persist(); return true;
}
function showArmory(from) {
  let rows = '';
  for (const k of Object.keys(UPS)) {
    const u = UPS[k], l = save.up[k], paid = Math.max(save.paid[k] || 0, l), maxed = l >= u.max, free = !maxed && l < paid, c = maxed ? 0 : free ? 0 : u.cost(l);
    const extra = k === 'weapon' ? ` (${WEAPONS[l].name})` : '';
    rows += `<div style="display:flex;gap:.3em;align-items:stretch"><button class="dn" data-k="${k}" ${l <= 0 ? 'disabled' : ''} title="Downgrade (no refund)" style="width:2.2em;margin:.3em 0">−</button>
      <button class="row" data-k="${k}" ${maxed || (!free && save.scrap < c) ? 'disabled' : ''} style="flex:1">
      <span>${u.name}${extra}<br><small style="font-family:system-ui;font-weight:600;color:#9fb3c8">${u.desc}</small><br>
      <span class="pips">${u.max > 12 ? 'Level ' + l + ' / ' + u.max + (paid > l ? ' (paid ' + paid + ')' : '') : '■'.repeat(l) + '▣'.repeat(Math.max(0, paid - l)) + '□'.repeat(u.max - Math.max(paid, l))}</span></span>
      <span>${maxed ? 'MAX' : free ? 'FREE' : c + ' ⚙'}</span></button></div>`;
  }
  ov(`<div class="panel"><h2>ARMORY</h2><div class="res">Scrap: ${save.scrap}</div>${rows}
    <p class="tag" style="margin:.4em 0 0">− lowers an upgrade (no refund). Levels you already paid for come back free (▣).</p>
    <button id="bk">Back</button></div>`);
  document.querySelectorAll('.row').forEach(b => b.onclick = () => { if (armoryBuy(b.dataset.k)) { beep(600, .12, 'triangle', .06, 300); showArmory(from); } });
  document.querySelectorAll('.dn').forEach(b => b.onclick = () => { if (armoryDown(b.dataset.k)) { beep(300, .1, 'triangle', .05, -100); showArmory(from); } });
  $('bk').onclick = () => { if (from === 'end' && G) endRun(); else showMenu(); };
}

function showSquad() { // choose up to MAXPICK classes for the next sectors; unlock more with scrap
  let rows = '';
  for (const k of CLS) {
    const c = CLASS[k], un = !!save.unlocked[k], on = save.loadout.includes(k), full = save.loadout.length >= MAXPICK;
    const dis = un ? (!on && full) : save.scrap < c.cost;
    rows += `<button class="row" data-k="${k}" ${dis ? 'disabled' : ''} style="${on ? 'border-color:' + c.col : ''}">
      <span style="color:${c.col}">${c.name}<br><small style="font-family:system-ui;font-weight:600;color:#9fb3c8">${c.desc}</small></span>
      <span>${on ? '✔ PICKED' : un ? 'PICK' : c.cost + ' ⚙'}</span></button>`;
  }
  const pnm = i => { const p = save.presets[i]; return p ? (p.l.length ? p.l.map(k => CLASS[k].name.split(' ')[0]).join('+') : 'riflemen') + ' · ' + FORMS[p.f].name : 'empty'; };
  const pre = [0, 1, 2].map(i => `<div style="display:flex;gap:.4em;margin:.25em 0"><button data-ld="${i}" style="flex:1;font-size:.78em" ${save.presets[i] ? '' : 'disabled'}>LOAD ${i + 1}: ${pnm(i)}</button><button data-sv="${i}" style="font-size:.78em">SAVE</button></div>`).join('');
  ov(`<div class="panel"><h2>SQUAD</h2>
    <div class="res">Pick up to ${MAXPICK} classes (${save.loadout.length}/${MAXPICK})<br>Scrap: ${save.scrap}</div>
    <p class="tag" style="margin:0">Loadout presets (classes + formation)</p>${pre}
    <p class="tag" style="margin:0 0 .5em">Each picked class adds ${classStart()} soldiers to your squad of ${6 + SQUAD_K * save.up.squad}. Class gates add only your picks.</p>${rows}
    <button class="big" id="go">DEPLOY</button><button id="bk">Back</button></div>`);
  document.querySelectorAll('.row').forEach(b => b.onclick = () => {
    const k = b.dataset.k, c = CLASS[k];
    if (save.loadout.includes(k)) save.loadout = save.loadout.filter(x => x !== k);
    else if (save.unlocked[k]) { if (save.loadout.length < MAXPICK) save.loadout.push(k); }
    else if (save.scrap >= c.cost) { save.scrap -= c.cost; save.unlocked[k] = 1; if (save.loadout.length < MAXPICK) save.loadout.push(k); beep(600, .12, 'triangle', .06, 300); }
    persist(); showSquad();
  });
  document.querySelectorAll('[data-ld]').forEach(b => b.onclick = () => { const p = save.presets[+b.dataset.ld]; if (!p) return; save.loadout = p.l.filter(k => save.unlocked[k]).slice(0, MAXPICK); save.form = p.f; persist(); beep(500, .06); showSquad(); });
  document.querySelectorAll('[data-sv]').forEach(b => b.onclick = () => { save.presets[+b.dataset.sv] = { l: save.loadout.slice(), f: save.form }; persist(); beep(700, .06, 'triangle', .06, 400); showSquad(); });
  $('go').onclick = () => { beep(300, .05); startLevel(save.sel); };
  $('bk').onclick = showMenu;
}

function setPause(p) {
  if (!G || state !== 'play' || (G.over && !G.sweep)) return;
  G.paused = p;
  if (p) {
    ov(`<div class="panel"><h2>PAUSED</h2><button class="big" id="rs">RESUME</button><button id="pset">Settings</button><button id="qt">Quit to menu</button></div>`);
    $('rs').onclick = () => setPause(false);
    $('pset').onclick = () => showSettings('pause');   // the full settings screen; Back returns here
    $('qt').onclick = showMenu;
  } else ovHide();
}

// ---------------------------------------------------------------- input
function setTarget(e) {
  if (!G || state !== 'play' || G.paused || G.over) return;   // no steering once the boss is down (or the squad is lost)
  const r = cv.getBoundingClientRect();
  const mx = W / 2 + ((e.clientX - r.left) / r.width * W - W / 2) / camZ();   // screen x back to world x through the camera zoom
  G.tx = clamp((mx - W / 2) / LANE, -.88, .88);
}
cv.addEventListener('pointermove', setTarget);
cv.addEventListener('pointerdown', e => {
  if (!G || state !== 'play') return;
  const r = cv.getBoundingClientRect();
  const mx = (e.clientX - r.left) / r.width * W, my = (e.clientY - r.top) / r.height * H;
  if (Math.hypot(mx - (W - 26), my - 26) < 24) { setPause(!G.paused); return; }
  if (!G.paused && Math.hypot(mx - (W - 56), my - (H - 70)) < 38) { useItem(); return; }
  if (!G.paused && Math.hypot(mx - (W - 118), my - (H - 52)) < 26) { cycleForm(); return; }   // formation button   // the item slot is a button
  { const n = performance.now(), L = G.lastTap; if (L && n - L.t < 330 && Math.hypot(mx - L.x, my - L.y) < 60) { G.lastTap = null; useItem(); return; } G.lastTap = { t: n, x: mx, y: my }; }   // a quick second tap or click anywhere = EMP
  try { cv.setPointerCapture(e.pointerId); } catch (x) {}
  setTarget(e);
});
window.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (e.key === ' ' || e.key === 'e' || e.key === 'E') { useItem(); e.preventDefault(); }
  if (e.key === 'f' || e.key === 'F') cycleForm();
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { if (G) setPause(!G.paused); }
});
window.addEventListener('keyup', e => { keys[e.key] = false; });
window.addEventListener('blur', () => { for (const k of Object.keys(keys)) keys[k] = false; if (G && state === 'play' && !G.over && !G.paused) setPause(true); });   // no stuck steering keys; pause when the window loses focus
cv.addEventListener('pointercancel', () => { if (G) G.lastTap = null; });
document.addEventListener('visibilitychange', () => { if (document.hidden && G && state === 'play') setPause(true); });

// ---------------------------------------------------------------- rendering: sprites
function shadow(w) { cx.fillStyle = 'rgba(0,0,0,.35)'; cx.beginPath(); cx.ellipse(0, 0, w, w * .3, 0, 0, 7); cx.fill(); }
function line(x1, y1, x2, y2) { cx.beginPath(); cx.moveTo(x1, y1); cx.lineTo(x2, y2); cx.stroke(); }
function flare(x, y, r, rgb, seed) { // a muzzle flash: a few needle spikes thrown forward round a hot pinpoint, not a disc
  cx.save(); cx.globalCompositeOperation = 'lighter';
  const n = 5, base = (hsh(seed) - .5) * 1.2 - Math.PI / 2;
  for (let k = 0; k < n; k++) {
    const an = base + (k - (n - 1) / 2) * .62 + (hsh(seed + k * 3.1) - .5) * .35, L = r * (1.1 + 1.3 * hsh(seed + k * 7.7)) * (k === 2 ? 1.5 : 1), w = r * .22;
    const ex = x + Math.cos(an) * L, ey = y + Math.sin(an) * L, nx = -Math.sin(an) * w, ny = Math.cos(an) * w, g = cx.createLinearGradient(x, y, ex, ey);
    g.addColorStop(0, `rgba(${rgb},.95)`); g.addColorStop(1, `rgba(${rgb},0)`); cx.fillStyle = g; cx.beginPath(); cx.moveTo(x + nx, y + ny); cx.lineTo(ex, ey); cx.lineTo(x - nx, y - ny); cx.closePath(); cx.fill();
  }
  cx.fillStyle = 'rgba(255,250,230,.95)'; cx.fillRect(x - r * .16, y - r * .16, r * .32, r * .32);
  cx.restore();
}
function streak(x1, y1, x2, y2, w, rgb, a) { // a tracer bolt: a straight bar with square-cut ends that fades out toward the tail (no pointed triangle, no round cap)
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy * w / 2, ny = ux * w / 2, tw = .8;
  const g = cx.createLinearGradient(x1, y1, x2, y2); g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(.35, `rgba(${rgb},${a * .5})`); g.addColorStop(.9, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},${a})`);
  cx.fillStyle = g; cx.beginPath(); cx.moveTo(x1 + nx * tw, y1 + ny * tw); cx.lineTo(x2 + nx, y2 + ny); cx.lineTo(x2 - nx, y2 - ny); cx.lineTo(x1 - nx * tw, y1 - ny * tw); cx.closePath(); cx.fill();
}
function glow(x, y, r, col) {
  cx.fillStyle = col; cx.globalAlpha = .28; cx.beginPath(); cx.arc(x, y, r * 2.4, 0, 7); cx.fill();
  cx.globalAlpha = 1; cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.fill();
}


function limb(x1, y1, x2, y2, w, c) {
  cx.lineCap = 'round'; cx.strokeStyle = c[3]; cx.lineWidth = w + 1.4; line(x1, y1, x2, y2);
  cx.strokeStyle = c[0]; cx.lineWidth = w; line(x1, y1, x2, y2);
  cx.strokeStyle = c[1]; cx.lineWidth = w * .28; line(x1 - w * .2, y1, x2 - w * .2, y2);
}
function skull(x, y, k, c, eye, half) { // movie-accurate chrome T-800 endoskeleton skull matching artwork: polished chrome dome, specular crown highlight, cheekbone arches, nasal slot, articulated jaw & teeth, burning fiery optic lenses
  const fl = flashOff(c);
  cx.save(); cx.translate(x, y); cx.scale(k, k);
  // Outer silhouette
  cx.fillStyle = c[3]; cx.beginPath();
  cx.moveTo(-6.2, -1.4); cx.bezierCurveTo(-7.8, -8.6, -4.2, -13, 0, -13); cx.bezierCurveTo(4.2, -13, 7.8, -8.6, 6.2, -1.4);
  cx.lineTo(5.4, 1.8); cx.lineTo(4.4, 3.6); cx.lineTo(3.5, 6.8); cx.lineTo(-3.5, 6.8); cx.lineTo(-4.4, 3.6); cx.lineTo(-5.4, 1.8); cx.closePath(); cx.fill();
  // Chrome dome with glossy highlight
  cx.fillStyle = fl ? '#fff' : '#222c3a'; cx.beginPath();
  cx.moveTo(-5.5, -1.6); cx.bezierCurveTo(-7, -8.4, -3.9, -12, 0, -12); cx.bezierCurveTo(3.9, -12, 7, -8.4, 5.5, -1.6); cx.lineTo(-5.5, -1.6); cx.fill();
  if (!fl) {
    cx.fillStyle = '#a6c6e8'; cx.beginPath(); cx.ellipse(-2.8, -9, 1.4, 3, -.5, 0, 7); cx.fill();
    cx.fillStyle = '#ffffff'; cx.fillRect(-3.5, -10.8, 1.4, 1.4); // specular crown streak
    cx.fillStyle = '#3a4e64'; cx.fillRect(1.6, -10.4, 3, 1); cx.fillStyle = '#18222e'; cx.fillRect(-1.5, -9.8, 3, 3.8); // forehead plate
  }
  // Face plate & cheekbone structure
  cx.fillStyle = fl ? '#fff' : '#2f3d4f'; cx.beginPath();
  cx.moveTo(-5, -4.8); cx.lineTo(5, -4.8); cx.lineTo(4.6, 1.5); cx.lineTo(3.7, 3.4); cx.lineTo(3.1, 6.2); cx.lineTo(-3.1, 6.2); cx.lineTo(-3.7, 3.4); cx.lineTo(-4.6, 1.5); cx.closePath(); cx.fill();
  if (!fl) {
    cx.fillStyle = c[1]; cx.fillRect(-5, -.8, 2.9, 1.4); cx.fillRect(2.1, -.8, 2.9, 1.4); // bright chrome cheekbones
    cx.fillStyle = '#0f1622'; cx.fillRect(-5.2, -5.5, 10.4, 1.4); cx.fillStyle = '#415772'; cx.fillRect(-5.2, -4.5, 10.4, .8); // brow ridge
  }
  const tear = half ? half - 1 : 0;
  if (half) { // Infiltrator torn synthetic flesh
    cx.fillStyle = '#c89a7c'; cx.beginPath(); cx.moveTo(0, -12); cx.bezierCurveTo(-3.9, -12, -7, -8.4, -5.5, -1.4); cx.lineTo(-4.9, 1.5); cx.lineTo(-3.9, 3.4); cx.lineTo(-3.1, 6.2); cx.lineTo(0, 6.2);
    for (let i = 0; i <= 6; i++) { const yy = 6.2 - i * 3, xx = -tear * 5 * (.3 + hash(i * 7 + 3)) + (hash(i * 11 + 1) - .5) * 1.8; cx.lineTo(xx, yy); }
    cx.closePath(); cx.fill();
    cx.fillStyle = '#3d261a'; cx.fillRect(-5.8, -11, 5.8, 2.5);
    if (tear > .05) { cx.fillStyle = 'rgba(18,9,5,.8)'; cx.fillRect(-5.2, -8, 2.8, 3.6); cx.fillRect(-3.8, 2, 2.4, 2.8); }
    if (tear > .3) { cx.fillStyle = '#ff7a1a'; cx.fillRect(-2.6, -6.6, 1.3, 1.3); }
  }
  // Deep orbital eye sockets & burning red/cyan optics
  cx.fillStyle = c[3];
  if (!half) { cx.beginPath(); cx.ellipse(-2.9, -3.5, 2.4, 2, -.12, 0, 7); cx.fill(); } else { cx.fillStyle = '#20120b'; cx.fillRect(-4.8, -4.2, 3.2, 2.1); cx.fillStyle = c[3]; }
  cx.beginPath(); cx.ellipse(2.9, -3.5, 2.4, 2, .12, 0, 7); cx.fill();
  if (!half) { glow(-2.9, -3.5, 1.8, eye); cx.fillStyle = '#fff'; cx.fillRect(-3.3, -3.9, 1, 1); }
  glow(2.9, -3.5, 1.8, eye); cx.fillStyle = '#fff'; cx.fillRect(2.5, -3.9, 1, 1);
  // Triangular nasal slot
  cx.fillStyle = c[3]; cx.beginPath(); cx.moveTo(0, -.1); cx.lineTo(-1.3, 2.5); cx.lineTo(1.3, 2.5); cx.fill();
  // Articulated jaw & chrome teeth
  cx.fillRect(-3.2, 3.9, 6.4, 2.5); cx.fillStyle = fl ? '#fff' : '#d8e6f5'; for (let i = 0; i < 6; i++) cx.fillRect(-3 + i * 1.1, 3.9, .65, 2.5);
  cx.fillStyle = c[3]; cx.fillRect(-3.3, 3.8, 6.6, .5);
  // Side hydraulic jaw pistons
  cx.strokeStyle = c[1]; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(-3.5, 5.8); cx.lineTo(-2.4, 9.2); cx.moveTo(3.5, 5.8); cx.lineTo(2.4, 9.2); cx.stroke();
  cx.restore();
}
function flashOff(c) { return c[0] === '#fff'; }
function ribcage(x, y, k, c) { // metallic spinal ribcage with sternum pistons
  cx.save(); cx.translate(x, y); cx.scale(k, k);
  cx.fillStyle = flashOff(c) ? c[3] : '#101620'; cx.beginPath(); cx.ellipse(0, -6, 5, 9.5, 0, 0, 7); cx.fill();
  if (!flashOff(c)) { cx.globalAlpha = .35; cx.fillStyle = '#3a6290'; cx.beginPath(); cx.ellipse(0, -2, 3.2, 5.2, 0, 0, 7); cx.fill(); cx.globalAlpha = 1; }
  cx.strokeStyle = c[0]; cx.lineWidth = 1.5; cx.lineCap = 'round';
  for (let i = 0; i < 5; i++) { cx.beginPath(); cx.ellipse(0, 1 - i * 3.1, 5.2 - i * .4, 2.1, 0, .1, Math.PI - .1); cx.stroke(); }
  // Dual central sternum pistons
  cx.strokeStyle = c[4]; cx.lineWidth = .9; line(-1.2, 3, -1.2, -14); line(1.2, 3, 1.2, -14);
  cx.fillStyle = c[1]; for (let i = 0; i < 5; i++) cx.fillRect(-1, 3 - i * 3.4, 2, 1.2);
  cx.strokeStyle = c[0]; cx.lineWidth = 1.4; line(-5.6, -14, -1.4, -13); line(5.6, -14, 1.4, -13);
  cx.restore();
}



// ---------------------------------------------------------------- sprite assets (painted PNGs; procedural drawing is the fallback)
// Every unit can have up to 8 views: n (facing away up the lane), ne, e (facing screen-right), se, s (facing the camera), sw, w, nw,
// each with any number of walk frames. Missing views fall back to the nearest one (or its mirror). Single-view legacy art = 'e'.
// File naming: <name>.png (legacy 'e') or <name>_<dir>_<frame>.png.  assets/sprites/manifest.js is generated by tools/build_manifest.py.
const SPR_DEF = {
  resistance_rifleman: 56, resistance_goggles: 56, resistance_captain: 56, resistance_shotgunner: 56, resistance_signaller: 70, resistance_heavy: 58, resistance_tech: 56, resistance_medic: 56,
  t800_reprogrammed: 66, t800: 76, t800_infiltrator: 74, t800_minigun: 74, t800_crawler: 44,
  aerostat: 26, t47: 150, t1: 96, hk_tank: 100, hk_aerial: 140, harvester: 175, ogre: 165,
};
const SPR = {};
if (typeof Image !== 'undefined') {
  const MAN = window.SPRITE_MANIFEST || {}, BASE = window.ASSET_BASE || 'assets/sprites/';
  for (const n of Object.keys(SPR_DEF)) {
    const m = MAN[n], r = SPR[n] = { h: (m && m.h) || SPR_DEF[n], dirs: {}, aw: 1, any: false };
    const views = (m && m.dirs) ? m.dirs : { e: { files: [n + '.png'] } };
    for (const k of Object.keys(views)) {
      const v = views[k], files = Array.isArray(v) ? v : v.files, rec = { frames: files.map(() => ({ img: new Image(), ok: false })), muz: (v && v.muz) || null, lights: (v && v.lights) || null, vents: (v && v.vents) || null };
      rec.frames.forEach((fr, i) => { fr.img.onload = () => { fr.ok = true; r.aw = fr.img.width / fr.img.height; r.any = true; }; fr.img.src = BASE + files[i]; });
      r.dirs[k] = rec;
    }
  }
}
function tinted(fr, key, col) { // cached solid-colour silhouette of one frame (hit flash, plasma rim light)
  if (fr[key]) return fr[key];
  const c = document.createElement('canvas'); c.width = fr.img.width; c.height = fr.img.height;
  const k = c.getContext('2d'); k.drawImage(fr.img, 0, 0); k.globalCompositeOperation = 'source-in'; k.fillStyle = col; k.fillRect(0, 0, c.width, c.height);
  return (fr[key] = c);
}
function sprReady(n) { const r = SPR[n]; return !!(r && r.any); }
function sprW(n, s) { const r = SPR[n]; return r ? r.h * r.aw * s : 0; }
const DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
function pickView(r, o) { // choose the view for a heading (hx = lateral, hz = along the lane; +hz = away from the camera)
  const hd = o.head || [0, 0], key = o.dir || DIRS[Math.round((((Math.atan2(hd[0], hd[1]) * 4 / Math.PI) % 8) + 8) % 8) % 8], idx = DIRS.indexOf(key);
  const ok = k => r.dirs[k] && r.dirs[k].frames[0].ok, mir = k => DIRS[(8 - DIRS.indexOf(k)) % 8];
  for (let d = 0; d <= 4; d++) for (const sg of (d ? [1, -1] : [1])) {
    const k = DIRS[(idx + sg * d + 8) % 8];
    if (ok(k)) return { rec: r.dirs[k], key: k, flip: 1, exact: d === 0 };
    if (ok(mir(k))) return { rec: r.dirs[mir(k)], key: mir(k), flip: -1, exact: d === 0 };
  }
  return null;
}
function drawBeam(lx, ly, gx, gy, gw, al) {
  cx.save(); cx.globalCompositeOperation = 'lighter';
  const g = cx.createLinearGradient(lx, ly, gx, gy);
  g.addColorStop(0, `rgba(215,238,255,${al})`); g.addColorStop(1, `rgba(120,180,255,${al * .22})`);
  cx.fillStyle = g; cx.beginPath(); cx.moveTo(lx - 2, ly); cx.lineTo(lx + 2, ly); cx.lineTo(gx + gw, gy); cx.lineTo(gx - gw, gy); cx.closePath(); cx.fill();
  cx.fillStyle = `rgba(190,225,255,${al * .8})`; cx.beginPath(); cx.ellipse(gx, gy, gw * 1.1, gw * .28, 0, 0, 7); cx.fill();
  cx.restore();
}
function chrome(flash) { return flash ? ['#fff', '#fff', '#fff', '#fff', '#fff'] : ['#566377', '#b4c6dc', '#2c3644', '#080a0f', '#5b86b5']; }
function joint(x, y, r, c) { // dark collar, mid shaft and a tiny highlight for mechanical depth
  cx.fillStyle = c[3]; cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.fill();
  cx.fillStyle = c[2]; cx.beginPath(); cx.arc(x, y, r * .62, 0, 7); cx.fill();
  cx.fillStyle = c[1]; cx.beginPath(); cx.arc(x - r * .22, y - r * .26, r * .2, 0, 7); cx.fill();
  cx.fillStyle = c[4]; cx.beginPath(); cx.arc(x + r * .3, y + r * .3, r * .18, 0, 7); cx.fill();
}
function drawSpr(name, x, y, s, o) { // o: head[hx,hz] | dir, flip(legacy side-art facing), walk(phase), amp, lean, lift, flash, rim, shadow, alpha
  const r = SPR[name]; if (!r || !r.any) return null;
  o = o || {};
  const pv = pickView(r, o); if (!pv) return null;
  let f = pv.flip;
  if ((pv.key === 'e' || pv.key === 'w') && !pv.exact && o.flip) f = o.flip * (pv.key === 'w' ? -1 : 1);   // side-on art stands in for a missing front/back view: face the way the caller asked
  const frames = pv.rec.frames, nf = frames.length;
  let fi = 0; if (nf > 1 && o.walk !== undefined) fi = Math.floor((((o.walk / 6.2832) % 1) + 1) % 1 * nf) % nf;
  const fr = frames[fi].ok ? frames[fi] : frames[0], h = r.h * s, w = h * (fr.img.width / fr.img.height), lift = (o.lift || 0) * s;
  if (o.shadow !== false) { cx.fillStyle = 'rgba(0,0,0,.34)'; cx.beginPath(); cx.ellipse(x, y, Math.max(6, w * .34), Math.max(2, w * .09), 0, 0, 7); cx.fill(); }
  let bob = 0, rot = o.lean ? o.lean * f : 0;
  if (o.walk !== undefined && nf === 1) { const amp = o.amp === undefined ? 1 : o.amp; bob = -Math.abs(Math.sin(o.walk)) * 3 * s * amp; rot += Math.sin(o.walk) * .045 * amp; }
  cx.save(); cx.translate(x, y - lift + bob); if (rot) cx.rotate(rot); if (f < 0) cx.scale(-1, 1);
  if (o.alpha !== undefined) cx.globalAlpha = o.alpha;
  cx.drawImage(fr.img, -w * .5, -h, w, h);
  if (o.rim) { // purple plasma glow on the left of the figure
    cx.save(); cx.beginPath(); if (f > 0) cx.rect(-w * .5, -h, w * .3, h); else cx.rect(w * .2, -h, w * .3, h); cx.clip();
    cx.globalAlpha = .26; cx.drawImage(tinted(fr, 'purple', 'rgb(170,110,255)'), -w * .5, -h, w, h); cx.restore();
  }
  if (o.tint) { cx.globalAlpha = o.tint[2]; cx.drawImage(tinted(fr, o.tint[0], o.tint[1]), -w * .5, -h, w, h); cx.globalAlpha = 1; }   // placeholder look for units that share another unit's art until they have their own sheet
  if (o.flash) { cx.globalAlpha = Math.min(.9, o.flash); cx.drawImage(tinted(fr, 'white', '#ffffff'), -w * .5, -h, w, h); }
  cx.restore();
  return { key: pv.key, flip: f, frames: nf, muz: pv.rec.muz, lights: pv.rec.lights, vents: pv.rec.vents };
}




// ---- machine kit: dark titanium gunmetal with rust firelight, sharp stealth plates, continuous tracks
function MC(flash) { return flash ? ['#fff', '#fff', '#fff', '#fff', '#fff'] : ['#3b4553', '#8fa1b6', '#242c38', '#07090d', '#5b86b5']; }   // base, spec, shade, dark, rust










function lightBeams(e, q, rel, ss, spread, len, wid, alpha) { // spotlights leave the sprite's own light positions (per view, flipped with the sprite)
  if (!e.vl) return;
  for (const l of e.vl) {
    const lx = l[0] * (e.vf || 1), d = lx < 0 ? -1 : 1, gp = P(e.x + d * spread, rel - len);
    drawBeam(q.x + lx * ss, q.y - l[1] * ss, gp.x, gp.y, wid * gp.s + 5, alpha);
  }
}
const hsh = k => { const v = Math.sin(k * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };   // cheap deterministic noise 0..1
const bossT = lv => 14 + 2 * Math.min(lv, 25);   // boss fight length (nominal seconds of the squad's full output): grows to sector 25, then stays
function bossSize(e, d, base) { // boss health: sized to the squad's firepower, with a floor from the sector's base value, but never more than a bounded time-to-kill whatever the sector number
  const dps = sizeDps(), ak = Math.max(.4, 1 - armorOf(e)), pk = 1 + (d.plate || 0), byDps = dps * bossT(G.lv) * .75 / ak / pk, cap = dps * Math.min(150, 45 + 3 * G.lv) * ak / pk;   // (cap: the real time-to-kill, armour and plating included)
  return Math.min(Math.max(base * .25, byDps), Math.max(cap, byDps)) * G.assist * tierMul(G.lv);
}
function toughen(e) { // Endos are built to take a beating: when one comes within reach its armour is sized to the squad's firepower, so a pack always takes a few seconds to cut down
  const TF = { grunt: .3, gunner: .6, t700: .9, t400: .12, t1000: 1.4 };
  if (e.tough || !TF[e.t]) return; e.tough = true;
  const tm = tierMul(G.lv), f = TF[e.t], hp = Math.max(e.max, sizeDps() * f) * G.assist * tm;
  e.hp = e.max = hp;
}
function bodyPoint(e, q, ss, k) { // a spot on the boss's solid body (screen coords)
  const SP = e.sn && SPR[e.sn];
  if (e.vp && e.vp.length && SP && SP.any) { const p = e.vp[k % e.vp.length]; return [q.x + (p[0] - .5) * sprW(e.sn, ss) * (e.vf || 1), q.y - (e.lf || 0) * ss - (1 - p[1]) * SP.h * ss]; }
  return [q.x + (hsh(k * 3 + e.id) - .5) * 70 * ss, q.y - (.15 + hsh(k * 5 + e.id) * .7) * (e.sh0 || 120) * ss];
}
const DK = {   // death sequences: chained blasts, then a fireball
  boss: { nb: 17, gap: .08, tb: 1.4, ts: 1, rMin: 60, rMax: 125, rf: .7, flash: 1, shake: 30 },
  veh:  { nb: 5,  gap: .07, tb: .4,  ts: .6, rMin: 30, rMax: 70,  rf: .5, flash: .3, shake: 10 },
  walk: { nb: 0,  gap: .1,  tb: 0,   ts: .3, rMin: 14, rMax: 30,  rf: .3, flash: 0,  shake: 2 },
};
function deathStep(Dh, dt) { // chained blasts over the wreck, then the fireball; bosses go biggest, vehicles medium, walkers a small burst
  const e = Dh.e, K = DK[Dh.kind || 'boss']; Dh.t += dt; Dh.tb = K.tb; Dh.ts = K.ts;
  const rel = e.wz - G.dist, q = P(e.x, rel), ss = q.s * e.sc, hh = (e.sh0 || 120) * ss;
  while (Dh.k < K.nb && Dh.t >= Dh.k * K.gap) {
    const [x, y] = bodyPoint(e, q, ss, Dh.k * 5 + 1); Dh.k++;
    Dh.bursts.push({ x, y, r: (16 + hsh(Dh.k + e.id) * 16) * ss * (Dh.kind === 'boss' ? 1 : .8) + 6, t0: Dh.t });
    addParts(x, y, 9, '#ffb040', 240, .6, 0); addParts(x, y, 6, '#2a2d33', 140, .9, -40); addSparks(x, y, 12, q.y, true); addLight(x, y, 60 * ss + 24, 'rgba(255,170,60,', .35);
    G.shake = Math.max(G.shake, K.shake * .25 + Dh.k * .5); if (Dh.k % 2) sfx.hit(); else sfx.boom();
  }
  if (!Dh.big && Dh.t >= K.tb) {
    Dh.big = true; const cxp = q.x, cyp = q.y - hh * .45; Dh.cx = cxp; Dh.cy = cyp; Dh.R = clamp(hh * K.rf, K.rMin, K.rMax);
    const m = Dh.kind === 'boss' ? 1 : Dh.kind === 'veh' ? .5 : .18;
    G.flash = Math.max(G.flash, K.flash); G.shake = Math.max(G.shake, K.shake);
    if (Dh.kind === 'boss') { sfx.mega(); buzz([220, 60, 220, 60, 380]); } else if (Dh.kind === 'veh') sfx.boom(); else sfx.hit();
    addParts(cxp, cyp, Math.round(90 * m) + 4, '#ff9a2a', 560 * Math.max(.4, m), 1.3 * Math.max(.5, m), 220); addParts(cxp, cyp, Math.round(60 * m) + 3, '#ffe08a', 420 * Math.max(.4, m), .9, 160); addParts(cxp, cyp, Math.round(70 * m) + 3, '#30343b', 360 * Math.max(.4, m), 1.8 * Math.max(.5, m), 90); addSparks(cxp, cyp, Math.round(70 * m) + 4, q.y, true);
    addLight(cxp, cyp, Dh.R * 1.6, 'rgba(255,170,70,', 1.1 * Math.max(.4, m)); addLight(q.x, q.y, Dh.R * 2.2, 'rgba(255,120,30,', 1.4 * Math.max(.4, m), true);
  }
}
function drawBossDeath(Dh) {
  const e = Dh.e, rel = e.wz - G.dist, q = P(e.x, rel), ss = q.s * e.sc, T = Dh.t;
  if (T < Dh.tb) { // the wreck shudders, flashes and keeps burning while it blows up
    cx.save(); cx.translate(rnd(-1, 1) * (2 + 5 * T) * q.s, rnd(-1, 1) * (1 + 3 * T) * q.s); e.flash = hsh(Math.floor(T * 22) + e.id) > .8 ? .35 : 0; drawEnemy(e); cx.restore(); e.flash = 0;
  }
  cx.save(); cx.globalCompositeOperation = 'lighter';
  for (const b of Dh.bursts) { // chained blasts
    const age = T - b.t0; if (age > .55) continue; const r = b.r * (.5 + age * 2.6), a = 1 - age / .55;
    const g = cx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r); g.addColorStop(0, `rgba(255,250,220,${a})`); g.addColorStop(.35, `rgba(255,190,60,${a * .85})`); g.addColorStop(.75, `rgba(255,90,20,${a * .5})`); g.addColorStop(1, 'rgba(120,20,0,0)');
    cx.fillStyle = g; cx.beginPath(); cx.arc(b.x, b.y, r, 0, 7); cx.fill();
  }
  if (Dh.big) { // the fireball: lumpy overlapping blobs that swell, brighten and gutter, with a shockwave ring and a ground blast
    const age = (T - Dh.tb) / Dh.ts, grow = 1 - Math.pow(1 - Math.min(1, age / .9), 3), fade = clamp(1 - (age - 1.1) / 1.9, 0, 1), R = Dh.R * (.35 + .95 * grow);
    for (let i = 0; i < 9; i++) {
      const a = hsh(i * 7 + e.id) * 6.28, dd = (.15 + hsh(i * 11 + e.id) * .55) * R * grow, bx = Dh.cx + Math.cos(a) * dd, by = Dh.cy + Math.sin(a) * dd * .75 - age * 14 * ss * (i % 3), r = R * (.45 + hsh(i * 13 + e.id) * .5);
      const g = cx.createRadialGradient(bx, by, 0, bx, by, r), al = fade * (.55 + .3 * Math.sin(T * 14 + i));
      g.addColorStop(0, `rgba(255,255,235,${al})`); g.addColorStop(.22, `rgba(255,214,90,${al * .95})`); g.addColorStop(.5, `rgba(255,120,30,${al * .75})`); g.addColorStop(.8, `rgba(170,36,8,${al * .45})`); g.addColorStop(1, 'rgba(60,8,0,0)');
      cx.fillStyle = g; cx.beginPath(); cx.arc(bx, by, r, 0, 7); cx.fill();
    }
    if (age < 1.3) { cx.globalAlpha = (1 - age / 1.3) * .8; cx.strokeStyle = '#ffd9a0'; cx.lineWidth = Math.max(2, 7 * ss * (1 - age / 1.3)); cx.beginPath(); cx.ellipse(Dh.cx, Dh.cy + Dh.R * .3, Dh.R * 2.1 * grow, Dh.R * .75 * grow, 0, 0, 7); cx.stroke(); cx.globalAlpha = 1; }   // shockwave
    const gg = cx.createRadialGradient(q.x, q.y, 0, q.x, q.y, Dh.R * 1.8 * grow + 10); gg.addColorStop(0, `rgba(255,170,60,${.5 * fade})`); gg.addColorStop(1, 'rgba(255,90,10,0)');
    cx.save(); cx.translate(q.x, q.y); cx.scale(1, .32); cx.translate(-q.x, -q.y); cx.fillStyle = gg; cx.beginPath(); cx.arc(q.x, q.y, Dh.R * 1.8 * grow + 10, 0, 7); cx.fill(); cx.restore();   // scorched-ground flash
  }
  cx.restore();
  if (Dh.big) { // a black smoke column climbing out of the blast
    const age = (T - Dh.tb) / Dh.ts; cx.save();
    for (let k = 0; k < 14; k++) {
      const ph = clamp((age - k * .09) / 2.6, 0, 1); if (ph <= 0) continue;
      const x = Dh.cx + (hsh(k * 3 + e.id) - .5) * Dh.R * .7 + Math.sin(T * 1.4 + k) * 10 * ss * ph, y = Dh.cy - ph * Dh.R * 1.5 - hsh(k * 5 + e.id) * Dh.R * .3, r = (.16 + .3 * ph + hsh(k * 7 + e.id) * .12) * Dh.R;
      const tn_ = 16 + 14 * (k % 3), sg = cx.createRadialGradient(x, y, 0, x, y, r); sg.addColorStop(0, `rgba(${tn_},${tn_},${tn_ + 4},${(1 - ph) * .34})`); sg.addColorStop(.6, `rgba(${tn_},${tn_},${tn_ + 4},${(1 - ph) * .18})`); sg.addColorStop(1, `rgba(${tn_},${tn_},${tn_ + 4},0)`); cx.fillStyle = sg; cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.fill();
    }
    cx.restore();
  }
}
let FXT;   // pre-rendered flame clusters, glow and smoke puffs (built once; drawing them is a few cheap drawImage calls instead of dozens of gradients per fire)
function fxTex() {
  if (FXT !== undefined) return FXT;
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return (FXT = false);
  const mk2 = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const T2 = { flames: [], smoke: [], glow: mk2(96, 96) };
  for (let f = 0; f < 18; f++) { // ragged flame clusters, each frame a different random shape, bases fading in from nothing
    const c = mk2(84, 124), g = c.getContext('2d'), by = 118, n = 4 + (f % 2);
    for (let k = 0; k < n; k++) {
      const r1 = hsh(f * 13.1 + k * 7.3), r2 = hsh(f * 7.7 + k * 3.1), r3 = hsh(f * 3.3 + k * 5.9), fx = 42 + (k / n - .5) * 40 + (r3 - .5) * 10, fh = 56 + 52 * r1, fw = 7 + 9 * r2, lean = (r2 - .5) * 26;
      for (const [sc, col, al] of [[1, [179, 34, 10], .85], [.74, [255, 90, 18], .9], [.5, [255, 163, 31], .95], [.26, r1 > .75 ? [255, 255, 255] : [255, 226, 122], 1]]) {
        const hh = fh * sc, ww = fw * sc, lg = g.createLinearGradient(0, by, 0, by - hh);
        lg.addColorStop(0, `rgba(${col},0)`); lg.addColorStop(.28, `rgba(${col},1)`); lg.addColorStop(1, `rgba(${col},.95)`);
        g.globalAlpha = al; g.fillStyle = lg; g.beginPath(); g.moveTo(fx - ww * .55, by);
        g.lineTo(fx - ww * (.9 + r3 * .6), by - hh * .35); g.lineTo(fx - ww * .3 + lean * .3, by - hh * (.6 + r2 * .2)); g.lineTo(fx + lean, by - hh);
        g.lineTo(fx + ww * .4 + lean * .5, by - hh * (.55 + r1 * .2)); g.lineTo(fx + ww * (.8 + r2 * .6), by - hh * .3); g.lineTo(fx + ww * .55, by); g.closePath(); g.fill();
      }
    }
    T2.flames.push(c);
  }
  { const g = T2.glow.getContext('2d'), gr = g.createRadialGradient(48, 48, 0, 48, 48, 48); gr.addColorStop(0, 'rgba(255,150,40,.55)'); gr.addColorStop(.5, 'rgba(255,100,20,.2)'); gr.addColorStop(1, 'rgba(255,60,10,0)'); g.fillStyle = gr; g.fillRect(0, 0, 96, 96); }
  for (let tone = 0; tone < 3; tone++) for (let sh = 0; sh < 4; sh++) { // lumpy smoke blobs in three darknesses
    const c = mk2(72, 72), g = c.getContext('2d'), base = [66, 36, 14][tone];
    for (let m = 0; m < 5; m++) {
      const bx = 36 + (hsh(sh * 9.1 + m * 3.7) - .5) * 26, by = 36 + (hsh(sh * 5.3 + m * 6.1) - .5) * 20, r = 14 + hsh(sh * 2.9 + m * 8.3) * 12, v = base + hsh(sh * 4.4 + m) * 26;
      const gr = g.createRadialGradient(bx, by, 0, bx, by, r); gr.addColorStop(0, `rgba(${v},${v - 2},${v + 3},.95)`); gr.addColorStop(.6, `rgba(${v},${v - 2},${v + 3},.55)`); gr.addColorStop(1, `rgba(${v},${v - 2},${v + 3},0)`); g.fillStyle = gr; g.beginPath(); g.arc(bx, by, r, 0, 7); g.fill();
    }
    T2.smoke.push(c);
  }
  return (FXT = T2);
}
function fireVent(bx, by, ss, d, sd, i, T) { // ragged flame tongues, a hot glow and thrown embers: shared by burning machines, buildings, wrecks and the horizon
  const X = fxTex(); if (!X) return;
  const tick = Math.floor(T * (11 + i * 1.3) + sd), flare = Math.max(.25, .55 + .65 * Math.sin(T * 2.3 + sd) * Math.sin(T * .9 + sd * 3) + (hsh(tick * .5 + sd) > .86 ? .7 : 0)) * (.7 + .5 * d);   // each vent surges and nearly dies on its own rhythm
  cx.save(); cx.globalCompositeOperation = 'lighter';
  const gs = (30 + 34 * flare) * ss; cx.globalAlpha = Math.min(1, .5 + .25 * flare); cx.drawImage(X.glow, bx - gs, by - 8 * ss - gs, gs * 2, gs * 2);
  const u = ss * (.17 + .2 * d) * (.55 + .6 * flare), nC = 2 + (d > .6 ? 1 : 0);
  for (let k = 0; k < nC; k++) {
    const fr = X.flames[(tick * 5 + k * 7 + Math.floor(sd * 3)) % 18 + (((tick * 5 + k * 7) % 18) < 0 ? 18 : 0)], dx = (k - (nC - 1) / 2) * 9 * ss + Math.sin(T * 9 + k + sd) * 1.2 * ss, sx = u * (k === 1 ? 1.15 : .9);
    cx.globalAlpha = .62 * Math.min(1, flare + .25); cx.drawImage(fr, bx + dx - 42 * sx, by - 118 * u * (k === 1 ? 1.1 : .95) - 0, 84 * sx, 124 * u * (k === 1 ? 1.1 : .95));
  }
  cx.globalAlpha = 1;
  for (let k = 0; k < 4; k++) { // embers and sparks thrown out of the fire
    const sp = .7 + hsh(sd + k * 41) * 1.2, ph = (T * sp + hsh(sd + k * 43)) % 1, ex = bx + (hsh(sd + k * 47) - .5) * 30 * ss * (.4 + ph) + Math.sin(T * 5 + k) * 3 * ss, ey = by - ph * (30 + 70 * hsh(sd + k * 53)) * ss + ph * ph * 25 * ss;
    cx.globalAlpha = (1 - ph) * .8; cx.fillStyle = hsh(sd + k * 59) > .5 ? '#ffd45a' : '#ff7a22'; cx.fillRect(ex, ey, Math.max(1, 1.6 * ss), Math.max(1, 1.6 * ss));
  }
  cx.restore();
}
function smokeVent(bx, by, ss, d, sd, T) {
  if (save.fx === 'low') return; // lumpy dark smoke clumps that rise, swell, drift in gusts and fade
  const X = fxTex(); if (!X) return; const heavy = d > .78, tone = heavy ? 2 : d > .5 ? 1 : 0;
  const gust = (Math.sin(T * 1.3 + sd) + Math.sin(T * 2.9 + sd * 2)) * 6 * ss; cx.save();
  for (let k = 0; k < 6; k++) {
    const spd = .32 + hsh(sd + k * 11) * .55, ph = (T * spd + hsh(sd + k * 17)) % 1, r = (6 + ph * (22 + 16 * hsh(sd + k * 19) + 8 * d)) * ss;
    const px = bx + Math.sin(sd + k + ph * 6) * 8 * ss * ph + gust * ph + (hsh(sd + k * 3) - .5) * 14 * ss, py = by - ph * (50 + 55 * hsh(sd + k * 13) + 25 * d) * ss;
    cx.globalAlpha = Math.min(.55, (1 - ph * ph) * (.38 + .3 * hsh(sd + k * 23)) * Math.min(1, .7 + d)); cx.drawImage(X.smoke[tone * 4 + k % 4], px - r, py - r, r * 2, r * 2);
  }
  cx.restore();
}
function drawDamageFX(e, q, ss, sh) { // bosses smoulder, then burn, as their health drops: ragged flame tongues, flying embers, lumpy soot-black smoke and scorch marks, all flaring up at random
  const d = 1 - e.hp / e.max; if (d < .22) return;
  const h = (sh || { heavy: 150, tank: 100, gunship: 160, harvester: 200, ogre: 165 }[e.t] || 120) * ss, w = (e.sn ? sprW(e.sn, ss) : 90 * ss) * .8;
  if (!e.vents) { e.vents = []; for (let i = 0; i < 9; i++) e.vents.push({ ox: (hsh(e.id + i * 2) - .5) * .85, oy: .18 + hsh(e.id + i * 2 + 1) * .72, sd: hsh(e.id + i * 7) * 50 }); }
  const SP = e.sn && SPR[e.sn], onBody = !!(e.vp && e.vp.length && SP && SP.any);   // with sprite art, fire starts only on solid pixels of the current view (precomputed in tools/gen_vents.py)
  const vpos = i => { const v = e.vents[i]; if (onBody) { const p = e.vp[i % e.vp.length]; return [q.x + (p[0] - .5) * sprW(e.sn, ss) * (e.vf || 1), q.y - (e.lf || 0) * ss - (1 - p[1]) * SP.h * ss, v]; } return [q.x + v.ox * w, q.y - v.oy * h, v]; };
  const nS = Math.min(9, 1 + Math.floor((d - .22) * 11)), nF = d < .46 ? 0 : Math.min(7, 1 + Math.floor((d - .46) * 13)), T = G.t;
  cx.save();
  for (let i = 0; i < nS; i++) { // scorch: soot smeared round each vent
    const [bx, by, v] = vpos(i);
    cx.globalAlpha = .14 + .16 * d; cx.fillStyle = '#050505';
    for (let k = 0; k < 4; k++) { const a = hsh(v.sd + k) * 6.28, r = (5 + hsh(v.sd + k * 3) * 9) * ss; cx.beginPath(); cx.ellipse(bx + Math.cos(a) * r * .8, by + Math.sin(a) * r * .5, r * (.5 + hsh(v.sd + k * 5) * .7), r * .45, a, 0, 7); cx.fill(); }
  }
  for (let i = 0; i < nF; i++) { // a ruptured panel under each fire: a dark, glowing breach the flames come out of
    const [bx, by, v] = vpos(i), br = (4.5 + 3 * d) * ss, pulse = .6 + .4 * Math.sin(T * 6 + v.sd);
    const dg = cx.createRadialGradient(bx, by, 0, bx, by, br * 1.3); dg.addColorStop(0, 'rgba(8,5,4,.6)'); dg.addColorStop(.55, 'rgba(8,5,4,.28)'); dg.addColorStop(1, 'rgba(8,5,4,0)');   // feathered soot, no hard edge
    cx.globalAlpha = 1; cx.fillStyle = dg; cx.beginPath(); cx.ellipse(bx, by, br * 1.3, br * .6, 0, 0, 7); cx.fill();
    const hg = cx.createRadialGradient(bx, by, 0, bx, by, br * 1.1); hg.addColorStop(0, `rgba(255,170,60,${.65 * pulse})`); hg.addColorStop(.6, `rgba(220,70,10,${.3 * pulse})`); hg.addColorStop(1, 'rgba(120,20,0,0)');
    cx.globalAlpha = 1; cx.fillStyle = hg; cx.beginPath(); cx.ellipse(bx, by, br * 1.1, br * .5, 0, 0, 7); cx.fill();
  }
  for (let i = 0; i < nS; i++) { const [bx, by, v] = vpos(i); smokeVent(bx, by, ss, d, v.sd, T); }
  for (let i = 0; i < nF; i++) { const [bx, by, v] = vpos(i); fireVent(bx, by, ss, d, v.sd, i, T); }
  cx.restore();
}
function drawStun(e, q, ss, sh) { // EMP'd machine: crackling blue-white arcs jumping over the frame, flickering out of sync
  const h = (sh || { heavy: 150, tank: 100, gunship: 160, harvester: 200, ogre: 165 }[e.t] || 90) * ss, w = (e.sn ? sprW(e.sn, ss) : 60 * ss) * .8, tick = Math.floor(G.t * 24), fade = Math.min(1, e.stun / .6);
  cx.save(); cx.globalCompositeOperation = 'lighter'; cx.lineCap = 'round';
  for (let k = 0; k < 4; k++) {
    const r = i => hsh(tick * 1.3 + k * 7.7 + i + e.id); if (r(40) < .35) continue;
    let x = q.x + (r(1) - .5) * w, y = q.y - r(2) * h; cx.beginPath(); cx.moveTo(x, y);
    for (let i = 0; i < 5; i++) { x += (r(3 + i) - .5) * 18 * ss; y += (r(9 + i) - .5) * 20 * ss; cx.lineTo(x, y); }
    cx.strokeStyle = `rgba(90,200,255,${.55 * fade})`; cx.lineWidth = Math.max(1.5, 3.2 * ss); cx.stroke(); cx.strokeStyle = `rgba(235,250,255,${.9 * fade})`; cx.lineWidth = Math.max(.8, 1.2 * ss); cx.stroke();
  }
  cx.restore();
}
const EDRAW = {   // sprite, walk-cycle speed / sway, spotlight beams [spread, length, width, alpha], flyer flag
  grunt: { spr: 't800', walk: 1, amp: 1 }, gunner: { spr: 't800_minigun', walk: 1, amp: .7 }, runner: { spr: 't800_crawler', walk: .5, amp: .8 },
  harvester: { spr: 'harvester', walk: .5, amp: .35 }, behemoth: { spr: 't1', walk: 2, amp: .18, beam: [.14, 130, 16, .22] },
  gunship: { spr: 'hk_aerial', fly: 1, laser: '90,235,255' }, aerostat: { spr: 'aerostat', fly: 1 }, heavy: { spr: 't47', walk: 1, amp: .55 },
  t700: { spr: 't800_minigun', walk: 1, amp: .6, tint: ['t7', '#5a6270', .4] }, t1000: { spr: 't800_infiltrator', walk: 1.3, amp: .8 }, drone: { spr: 'aerostat', fly: 1, tint: ['dr', '#c8ffd0', .25] },
  minelayer: { spr: 'hk_tank', walk: 2.5, amp: .2, tint: ['ml', '#6a7a3a', .3] }, t400: { spr: 't800', walk: .8, amp: 1, tint: ['rs', '#9a5a22', .5] }, centurion: { spr: 't47', walk: .6, amp: .25, tint: ['ce', '#8a2a2a', .3], beam: [.16, 140, 22, .24] },
  tank: { spr: 'hk_tank', walk: 2.5, amp: .2, beam: [.12, 120, 24, .24], laser: '255,70,50' }, ogre: { spr: 'ogre', walk: .9, amp: .12, beam: [.16, 140, 22, .24] },
};
function drawLaser(e, q, ss, rgb, rel) { // a target designator: the line sharpens as the volley comes
  const m = MUZ[e.t] || { ox: 0, h: 30 }; let mx, my;
  if (e.vm) { mx = q.x + e.vm[0] * (e.vf || 1) * ss; my = q.y - (e.vm[1] + (e.lf || 0)) * ss; } else { mx = q.x + m.ox * (m.fwd ? (e.face || 1) : 1) * ss; my = q.y - m.h * ss; }
  const gOn = G.guard && !G.guard.dead && rel > GZ + 25, T = P(gOn ? G.gx : G.px, gOn ? GZ : 0), tx = T.x, ty = T.y - 30 * T.s, p = clamp(1 - e.fcd / 1.5, 0, 1), fl = .75 + .25 * Math.sin(G.t * 40);
  cx.save(); cx.globalCompositeOperation = 'lighter'; cx.lineCap = 'round';
  cx.strokeStyle = `rgba(${rgb},${(.1 + .2 * p) * fl})`; cx.lineWidth = 3 + 4 * p; cx.beginPath(); cx.moveTo(mx, my); cx.lineTo(tx, ty); cx.stroke();
  cx.strokeStyle = `rgba(${rgb},${(.35 + .6 * p) * fl})`; cx.lineWidth = 1 + 1.2 * p; cx.beginPath(); cx.moveTo(mx, my); cx.lineTo(tx, ty); cx.stroke();
  cx.fillStyle = `rgba(${rgb},${(.4 + .5 * p) * fl})`; cx.beginPath(); cx.arc(tx, ty, 3 + 5 * p, 0, 7); cx.fill();
  cx.restore();
}
function drawEnemy(e) {
  const rel = e.wz - G.dist, q = P(e.x, rel), s = q.s, a = (e.stun > 0 ? e.stunT : G.t) * 5 + e.id, fl = e.flash > 0, lk = e.crash !== undefined ? 1 - clamp(e.crash / .8, 0, 1) : e.rise !== undefined ? clamp(e.rise, 0, 1) : 1, tilt = (1 - lk) * (e.id % 2 ? .45 : -.45);
  if (e.boss && e.gl && hash((G.t * 16 | 0) + (e.id * 10 | 0)) > (e.gl === 2 ? .7 : .9)) q.x += rnd(-5, 5) * s * e.sc;   // sprite glitch
  const ss = s * e.sc, face = e.face || 1, F = fl ? .9 : 0, hd = [clamp((G.px - e.x) * 1.5, -1.2, 1.2), -1];
  const D = (name, o) => { const pv = drawSpr(name, q.x, q.y, ss, Object.assign({ head: hd }, o)); if (pv) { e.sn = name; e.vk = pv.key; e.vf = pv.flip; e.vm = pv.muz; e.vl = pv.lights; e.vp = pv.vents; e.lf = (o && o.lift) || 0; } return pv; };
  let sh = 0;   // sprite height (world px at ss=1) for bars and plating overlays
  const V = EDRAW[e.t] || {};   // per-type look (sprite, walk-cycle speed and sway, spotlight beams); art is all sprites now
  let nm = V.spr;
  if (e.t === 'gunner') nm = 1 - e.hp / e.max < .5 ? 't800_infiltrator' : 't800_minigun';   // intact until half its health is gone, then the exposed endoskeleton
  if (!nm) return;
  let lift = 0;
  if (e.t === 'gunship') lift = (120 + Math.sin(a * .35) * 3) * lk;   // a big gunship (about the length of a heavy pickup truck) hovering well overhead
  else if (e.t === 'aerostat') lift = (22 + Math.sin(G.t * 3.5 + e.id) * 3) * lk;
  else if (e.t === 'drone') lift = (14 + Math.sin(G.t * 7 + e.id) * 2) * lk;   // a drone about the size of a person's torso, hovering at chest height
  const o = { flip: face, flash: F };
  if (V.walk) { o.walk = a * V.walk; o.amp = V.amp; }
  if (V.tint) o.tint = V.tint;
  if (e.t === 't1000') { const ch = e.form === 'chrome'; nm = ch ? 't800_infiltrator' : 't800'; o.tint = ['t1k', ch ? '#e4f0ff' : '#aebccc', ch ? .6 + .15 * Math.sin(G.t * 6) : .4]; o.walk = a * (ch ? .8 : 2.2); o.amp = ch ? .5 : 1.1; o.rim = false; }   // placeholder: liquid-metal silver over the endoskeleton / T-800 art
  if (V.fly) { o.lift = lift; o.lean = tilt; }
  if (e.t === 'aerostat' || e.t === 'drone') o.shadow = false;
  if (D(nm, o)) {
    sh = SPR[nm].h + (e.t === 'gunship' ? 120 : e.t === 'aerostat' ? 22 : 0);
    if (e.t === 'aerostat') { cx.fillStyle = 'rgba(0,0,0,.22)'; cx.beginPath(); cx.ellipse(q.x, q.y, 9 * ss, 2.8 * ss, 0, 0, 7); cx.fill(); }
    if (e.t === 'harvester') drawGrabArm(e, q, ss, face, fl);
    if (V.beam) lightBeams(e, q, rel, ss, V.beam[0], V.beam[1], V.beam[2], V.beam[3]);
    if (V.laser && !(e.stun > 0) && e.fcd < 1.5 && e.fcd > 0 && rel > 20 && rel <= (ET[e.t].hold || 400) + 80 && !gateBefore(e) && !G.over) drawLaser(e, q, ss, V.laser, rel);
    if (e.t === 'gunship') { const ls = e.vl; if (ls) for (const l of ls) { const lx = l[0] * (e.vf || 1), d = lx < 0 ? -1 : 1, gp = P(e.x + d * .1, rel - 110); drawBeam(q.x + lx * ss, q.y - (l[1] + lift) * ss, gp.x, gp.y, 20 * gp.s + 6, .24); } }
  }
  if (G.snTg === e && !e.dead) { const ry = q.y - (HITH[e.t] || 40) * ss * 1.1, rr = 13 * ss + 5, pl = .6 + .4 * Math.sin(G.t * 9); cx.strokeStyle = `rgba(255,140,200,${.5 + .4 * pl})`; cx.lineWidth = Math.max(1.2, 1.6 * s); cx.beginPath(); cx.arc(q.x, ry, rr, 0, 7); cx.moveTo(q.x - rr * 1.4, ry); cx.lineTo(q.x - rr * .5, ry); cx.moveTo(q.x + rr * .5, ry); cx.lineTo(q.x + rr * 1.4, ry); cx.moveTo(q.x, ry - rr * 1.4); cx.lineTo(q.x, ry - rr * .5); cx.moveTo(q.x, ry + rr * .5); cx.lineTo(q.x, ry + rr * 1.4); cx.stroke(); }
  if (e.stun > 0 || (e.boss && e.gl && Math.sin(G.t * 3.1 + e.id * 7) + Math.sin(G.t * 7.7 + e.id) > (e.gl === 2 ? -.6 : 1.1))) drawStun(e, q, ss, sh);   // a failing boss throws blue electrical arcs
  e.sh0 = sh || { heavy: 150, tank: 100, gunship: 160, harvester: 200, ogre: 165 }[e.t] || 120;
  if ((e.boss || ET[e.t].block || ET[e.t].fly || ET[e.t].tracked) && !ET[e.t].swarm) drawDamageFX(e, q, ss, sh);   // every big machine, flyers included, smoulders then burns as it is shot up
  if (e.plateMax && e.plate > 0) { // front plating: a curved shield on the face the squad is shooting at
    const m = sh ? [sh * .58, sprW({ heavy: 't47', harvester: 'harvester', ogre: 'ogre' }[e.t] || 't47', 1) * .3, sh * .34] : ({ heavy: [85, 42, 46], harvester: [100, 36, 72] }[e.t] || [60, 30, 40]), fr = e.plate / e.plateMax, hit = (e.plateHit || 9) < .15;
    cx.strokeStyle = `rgba(120,225,255,${.12 + .12 * fr + (hit ? .55 : 0)})`; cx.lineWidth = Math.max(1.2, (hit ? 3 : 1.6) * s); cx.fillStyle = `rgba(110,210,255,${hit ? .12 : 0})`;
    cx.beginPath(); cx.ellipse(q.x, q.y - m[0] * ss, m[1] * ss, m[2] * ss, 0, 0, 7); cx.fill(); cx.stroke();
  }
  if ((ET[e.t].block || ET[e.t].fly || ET[e.t].show) && !ET[e.t].swarm && !e.boss && (e.hp < e.max || (e.plateMax && e.plate < e.plateMax))) {
    const hgt = (sh || { heavy: 150, tank: 100, aerostat: 100, gunship: 160, behemoth: 108, harvester: 200 }[e.t]) * ss + 8, w = 60 * ss, bh = 5 * Math.max(.6, s);
    cx.fillStyle = '#300'; cx.fillRect(q.x - w / 2, q.y - hgt, w, bh);
    cx.fillStyle = '#ff3b3b'; cx.fillRect(q.x - w / 2, q.y - hgt, w * Math.max(0, e.hp / e.max), bh);
    if (e.plateMax) { cx.fillStyle = '#012'; cx.fillRect(q.x - w / 2, q.y - hgt - bh - 1, w, bh * .7); cx.fillStyle = '#6ff3ff'; cx.fillRect(q.x - w / 2, q.y - hgt - bh - 1, w * Math.max(0, e.plate / e.plateMax), bh * .7); }
  }
}

function armSeg(x1, y1, x2, y2, w, flash, sd) { // an armoured arm segment: plated shell, panel seams, rivets, hazard paint, a hydraulic ram and cable run, grit over it all
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, an = Math.atan2(dy, dx), n = Math.max(2, Math.round(L / (w * 1.5)));
  cx.save(); cx.translate(x1, y1); cx.rotate(an);
  cx.fillStyle = 'rgba(0,0,0,.35)'; cx.fillRect(w * .1, w * .55, L, w * .22);   // shadow under the arm
  // hydraulic ram along the lower flank
  const ry = w * .62; cx.fillStyle = '#12161c'; cx.fillRect(L * .1, ry - w * .13, L * .62, w * .26); cx.fillStyle = flash ? '#fff' : '#c6ced6'; cx.fillRect(L * .5, ry - w * .06, L * .4, w * .12); cx.fillStyle = '#3a424c'; cx.fillRect(L * .1, ry - w * .13, L * .12, w * .26); cx.fillRect(L * .72, ry - w * .13, L * .05, w * .26);
  // shell
  const g = cx.createLinearGradient(0, -w / 2, 0, w / 2); g.addColorStop(0, flash ? '#fff' : '#a3b2c4'); g.addColorStop(.22, flash ? '#fff' : '#5a6878'); g.addColorStop(.6, flash ? '#fff' : '#2f3945'); g.addColorStop(1, flash ? '#fff' : '#12161c');
  cx.fillStyle = g; cx.beginPath(); cx.moveTo(0, -w * .45); cx.lineTo(L, -w * .5); cx.lineTo(L, w * .5); cx.lineTo(0, w * .45); cx.closePath(); cx.fill();
  for (let i = 0; i < n; i++) {   // panels
    const px = i * L / n; cx.fillStyle = 'rgba(0,0,0,.55)'; cx.fillRect(px, -w * .5, Math.max(1, w * .05), w);
    cx.fillStyle = 'rgba(255,255,255,.22)'; cx.fillRect(px + w * .06, -w * .45, L / n - w * .12, Math.max(1, w * .07));
    cx.fillStyle = flash ? '#fff' : '#9aa6b4'; for (const ry2 of [-w * .32, w * .3]) { cx.beginPath(); cx.arc(px + w * .18, ry2, Math.max(.8, w * .045), 0, 7); cx.arc(px + L / n - w * .18, ry2, Math.max(.8, w * .045), 0, 7); cx.fill(); }
    if (i === 1) { cx.save(); cx.beginPath(); cx.rect(px + w * .12, -w * .22, L / n - w * .24, w * .44); cx.clip(); for (let k2 = -6; k2 < 12; k2++) { cx.fillStyle = k2 % 2 ? 'rgba(230,185,30,.85)' : 'rgba(18,18,20,.85)'; cx.beginPath(); cx.moveTo(px + k2 * w * .2, w * .22); cx.lineTo(px + k2 * w * .2 + w * .2, w * .22); cx.lineTo(px + k2 * w * .2 + w * .42, -w * .22); cx.lineTo(px + k2 * w * .2 + w * .22, -w * .22); cx.fill(); } cx.restore(); }
  }
  gritIn(() => cx.rect(0, -w / 2, L, w), 0, -w / 2, L, w, 'metal', .55, .45);
  gritIn(() => cx.rect(0, -w / 2, L, w), 0, -w / 2, L, w, 'dirt', .25, .6);
  cx.strokeStyle = '#0c0f13'; cx.lineWidth = Math.max(1, w * .08); cx.beginPath(); cx.moveTo(L * .08, -w * .56); cx.bezierCurveTo(L * .3, -w * .9, L * .6, -w * .2, L * .92, -w * .56); cx.stroke();   // cable run
  cx.strokeStyle = 'rgba(120,200,255,.3)'; cx.lineWidth = Math.max(.6, w * .025); cx.stroke();
  cx.restore();
}
function armJoint(x, y, r, flash) { // a big ball-and-collar joint with a ring of bolts and a status light
  cx.fillStyle = '#0c0f13'; cx.beginPath(); cx.arc(x, y, r * 1.12, 0, 7); cx.fill();
  const g = cx.createRadialGradient(x - r * .3, y - r * .3, r * .1, x, y, r); g.addColorStop(0, flash ? '#fff' : '#b3bfcc'); g.addColorStop(.5, flash ? '#fff' : '#4d5967'); g.addColorStop(1, flash ? '#fff' : '#161b22'); cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.fill();
  cx.strokeStyle = 'rgba(0,0,0,.6)'; cx.lineWidth = Math.max(1, r * .12); cx.beginPath(); cx.arc(x, y, r * .62, 0, 7); cx.stroke();
  cx.fillStyle = flash ? '#fff' : '#cfd6de'; for (let i = 0; i < 6; i++) { const an = i / 6 * 6.283 + .4; cx.beginPath(); cx.arc(x + Math.cos(an) * r * .8, y + Math.sin(an) * r * .8, Math.max(.8, r * .08), 0, 7); cx.fill(); }
  const on = Math.sin(G.t * 6 + x) > -.2; cx.fillStyle = on ? '#ff3a22' : '#601208'; cx.beginPath(); cx.arc(x + r * .1, y + r * .1, Math.max(1, r * .16), 0, 7); cx.fill(); if (on) { cx.globalAlpha = .35; cx.beginPath(); cx.arc(x + r * .1, y + r * .1, r * .4, 0, 7); cx.fill(); cx.globalAlpha = 1; }
}
function armClaw(x, y, cw, open, flash, face) { // the grab: a plated palm and three two-jointed talons
  cx.fillStyle = '#0c0f13'; cx.fillRect(x - 9 * cw, y - 5 * cw, 18 * cw, 10 * cw);
  const g = cx.createLinearGradient(0, y - 5 * cw, 0, y + 5 * cw); g.addColorStop(0, flash ? '#fff' : '#8795a6'); g.addColorStop(1, flash ? '#fff' : '#242c36'); cx.fillStyle = g; cx.fillRect(x - 8 * cw, y - 4 * cw, 16 * cw, 8 * cw);
  cx.fillStyle = 'rgba(255,255,255,.2)'; cx.fillRect(x - 8 * cw, y - 4 * cw, 16 * cw, 1.4 * cw); cx.fillStyle = flash ? '#fff' : '#ff8a30'; cx.fillRect(x - 3 * cw, y - 1 * cw, 6 * cw, 1.2 * cw);   // glowing slit
  for (let i = -1; i <= 1; i++) {
    const bx = x + i * 6.5 * cw, spread = i * 11 * cw * open, jx = bx + spread * .55, jy = y + 12 * cw, tx = bx + spread * (1 + .3 * open) + i * 2 * cw, ty = y + 25 * cw + (1 - open) * 4 * cw;
    for (const [x1, y1, x2, y2, wd] of [[bx, y + 3 * cw, jx, jy, 3.6 * cw], [jx, jy, tx, ty, 2.8 * cw]]) { cx.strokeStyle = '#0c0f13'; cx.lineWidth = wd + 1.2; cx.lineCap = 'round'; line(x1, y1, x2, y2); cx.strokeStyle = flash ? '#fff' : '#7b8998'; cx.lineWidth = wd; line(x1, y1, x2, y2); cx.strokeStyle = flash ? '#fff' : '#cfd8e2'; cx.lineWidth = Math.max(.7, wd * .25); line(x1 - wd * .2, y1, x2 - wd * .2, y2); }
    cx.fillStyle = flash ? '#fff' : '#e4e9ee'; cx.beginPath(); cx.moveTo(tx - 1.6 * cw, ty - 1 * cw); cx.lineTo(tx + 1.6 * cw, ty - 1 * cw); cx.lineTo(tx + i * .6 * cw, ty + 5 * cw); cx.closePath(); cx.fill();   // talon
    cx.fillStyle = '#0c0f13'; cx.beginPath(); cx.arc(jx, jy, 2.2 * cw, 0, 7); cx.fill(); cx.fillStyle = '#aab6c4'; cx.beginPath(); cx.arc(jx - .5 * cw, jy - .5 * cw, .8 * cw, 0, 7); cx.fill();
  }
}
function drawGrabArm(e, q, ss, face, flash) { // the reaching arm over the painted harvester body
  const S = { x: q.x + face * 56 * ss, y: q.y - 132 * ss }, R = { x: S.x + face * 8 * ss, y: S.y + 74 * ss }, RE = { x: S.x + face * 18 * ss, y: S.y + 36 * ss };
  const T = P(e.tx, 0), t = { x: T.x, y: T.y - 22 }, ex = e.ext, H = { x: R.x + (t.x - R.x) * ex, y: R.y + (t.y - R.y) * ex };
  const mid = { x: (S.x + H.x) / 2 + face * 26 * ss, y: (S.y + H.y) / 2 - 12 * ss };
  const E = { x: RE.x + (mid.x - RE.x) * ex, y: RE.y + (mid.y - RE.y) * ex }, w = 12 * ss * (1 + ex * .6), sd = e.id * 7;
  armSeg(S.x, S.y, E.x, E.y, w, flash, sd); armSeg(E.x, E.y, H.x, H.y, w * .9, flash, sd + 3);
  armJoint(S.x, S.y, 6.5 * ss, flash); armJoint(E.x, E.y, 7 * ss * (1 + ex * .4), flash);
  const open = (e.gs === 'slam' || e.gs === 'recover') ? .3 : 1, cw = ss * (1 + ex * .8);
  armClaw(H.x, H.y, cw, open, flash, face);
  if (e.cap > 0 && ex < .5) { cx.font = `${Math.max(10, 18 * ss)}px ${FONT}`; cx.textAlign = 'center'; cx.lineWidth = 3; cx.strokeStyle = '#000'; cx.strokeText('x' + e.cap, H.x, H.y - 6 * ss); cx.fillStyle = '#6fb5ff'; cx.fillText('x' + e.cap, H.x, H.y - 6 * ss); }
  if (e.gs === 'aim' || e.gs === 'lock') { // ground warning marker
    const lk = e.gs === 'lock', pr = lk ? 1 : .5 + .5 * Math.sin(G.t * 14);
    cx.strokeStyle = `rgba(255,60,40,${.5 + .5 * pr})`; cx.lineWidth = lk ? 4 : 2.5;
    cx.beginPath(); cx.ellipse(T.x, T.y, 46 * T.s + 14, 14 * T.s + 5, 0, 0, 7); cx.stroke();
    if (lk) { cx.fillStyle = 'rgba(255,60,40,.18)'; cx.fill(); }
  }
}

function drawGate(g) {
  const rel = g.wz - G.dist;
  for (const side of ['L', 'R']) {
    const o = g[side];
    const xa = side === 'L' ? -1 : .03, xb = side === 'L' ? -.03 : 1;
    const A = P(xa, rel), B = P(xb, rel), h = 105 * A.s;
    let col = 'rgba(43,127,255,.55)', txt = '', sub = '';
    if (o.k === 'add') {
      const v = Math.floor(o.v);
      col = v < 0 ? 'rgba(255,59,59,.55)' : 'rgba(43,127,255,.55)';
      txt = (v >= 0 ? '+' : '') + v;
    } else if (o.k === 'mul') { col = 'rgba(43,212,122,.55)'; txt = '×' + o.v; }
    else if (o.k === 'wpn') {
      col = 'rgba(255,196,0,.55)';
      if (G.tier < 5) { txt = '▲ GUN'; sub = WEAPONS[G.tier + 1].name; } else { txt = '+8'; }
    }
    else if (o.k === 'rate') { col = 'rgba(178,102,255,.55)'; txt = 'RATE'; sub = '+15%'; }
    else if (o.k === 'dmg') { col = 'rgba(178,102,255,.55)'; txt = 'DMG'; sub = '+15%'; }
    else if (o.k === 'cls') { col = CLASS[o.c].gate; txt = '+' + o.v; sub = CLASS[o.c].name; }
    cx.fillStyle = col;
    cx.beginPath(); cx.moveTo(A.x, A.y); cx.lineTo(B.x, B.y); cx.lineTo(B.x, B.y - h); cx.lineTo(A.x, A.y - h); cx.closePath(); cx.fill();
    cx.strokeStyle = 'rgba(255,255,255,.75)'; cx.lineWidth = Math.max(1, 3 * A.s); cx.stroke();
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.font = `${Math.max(8, 44 * A.s)}px ${FONT}`;
    const mx = (A.x + B.x) / 2, my = A.y - h * .5;
    cx.lineWidth = Math.max(2, 5 * A.s); cx.strokeStyle = 'rgba(0,0,0,.7)'; cx.strokeText(txt, mx, my - (sub ? 8 * A.s : 0));
    cx.fillStyle = '#fff'; cx.fillText(txt, mx, my - (sub ? 8 * A.s : 0));
    if (sub) { cx.font = `${Math.max(6, 16 * A.s)}px ${FONT}`; cx.fillStyle = '#fff'; cx.fillText(sub, mx, my + 22 * A.s); }
  }
  // center post
  const A = P(0, rel);
  cx.fillStyle = '#ddd'; cx.fillRect(A.x - 3 * A.s, A.y - 115 * A.s, 6 * A.s, 115 * A.s);
}

function drawDecor(d) {
  const rel = d.wz - G.dist, q = P(d.x, rel), s = q.s * d.s;
  if (s < .02) return;
  cx.save(); cx.translate(q.x, q.y); cx.scale(s * (d.f || 1), s);
  switch (d.t) {
    case 12: case 0: // rubble heap with slabs and rebar (12 smoulders)
      cx.fillStyle = '#141b26'; cx.beginPath(); cx.moveTo(-36, 0); cx.lineTo(-24, -13); cx.lineTo(-8, -10); cx.lineTo(6, -25); cx.lineTo(22, -13); cx.lineTo(38, 0); cx.closePath(); cx.fill();
      cx.fillStyle = '#2c3848'; cx.beginPath(); cx.moveTo(-14, -13); cx.lineTo(8, -24); cx.lineTo(15, -17); cx.lineTo(-6, -9); cx.closePath(); cx.fill();
      cx.fillStyle = '#42536a'; cx.fillRect(-14, -14, 20, 1.6); cx.fillStyle = '#1d2632'; cx.fillRect(-28, -6, 12, 6); cx.fillRect(20, -7, 10, 7);
      cx.strokeStyle = '#6a4a38'; cx.lineWidth = 1.5; line(10, -22, 19, -42); line(15, -20, 12, -36); line(-20, -10, -26, -26);
      if (d.t === 12) { fireVent(4, -22, 1.3, .55, d.id * 2.9, 0, G.t); smokeVent(4, -22, 1.4, .45, d.id * 2.9, G.t); }
      break;
    case 1: // broken column
      cx.fillStyle = '#26303d'; cx.fillRect(-11, -66, 22, 66); cx.fillStyle = '#41516a'; cx.fillRect(-11, -66, 6, 66);
      cx.fillStyle = '#10161f'; cx.beginPath(); cx.moveTo(-11, -66); cx.lineTo(-4, -76); cx.lineTo(3, -64); cx.lineTo(11, -72); cx.lineTo(11, -66); cx.fill();
      cx.fillStyle = '#10161f'; cx.fillRect(-9, -34, 5, 9); cx.fillRect(3, -52, 6, 5);
      cx.strokeStyle = '#6a4a38'; cx.lineWidth = 1.5; line(-2, -72, -6, -90); line(5, -70, 9, -86);
      cx.fillStyle = '#141b26'; cx.fillRect(-18, -5, 36, 5);
      break;
    case 2: { // skull pile
      for (let i = 0; i < 6; i++) {
        const px = -17 + i * 7, py = -5 - (i % 2) * 7 - (i === 2 || i === 3 ? 5 : 0);
        cx.fillStyle = '#c9c3b2'; cx.beginPath(); cx.arc(px, py, 6, 0, 7); cx.fill();
        cx.fillStyle = '#8f8a7b'; cx.fillRect(px - 5, py + 1, 10, 2);
        cx.fillStyle = '#0c1118'; cx.fillRect(px - 3.6, py - 2, 2.6, 3); cx.fillRect(px + 1, py - 2, 2.6, 3); cx.fillRect(px - .6, py + 2.4, 1.4, 2);
      }
      cx.strokeStyle = '#a9a595'; cx.lineWidth = 1.6; line(-22, -3, -6, -9); line(8, -4, 24, -8); line(-12, -2, 2, -2);
      break; }
    case 3: { // burning barrel
      cx.fillStyle = '#3a2a22'; cx.fillRect(-9, -26, 18, 26); cx.fillStyle = '#18110d'; cx.fillRect(-9, -20, 18, 2.4); cx.fillRect(-9, -8, 18, 2.4);
      fireVent(0, -26, 1.5, .55, d.id * 5.3, 0, G.t); smokeVent(0, -26, 1.4, .4, d.id * 5.3, G.t);   // the same ragged fire and lumpy smoke as the burning machines
      break; }
    case 11: case 4: // car wreck (11 is still burning)
      cx.fillStyle = '#1e2631'; cx.beginPath(); cx.moveTo(-42, 0); cx.lineTo(-42, -15); cx.lineTo(-32, -19); cx.lineTo(-22, -31); cx.lineTo(14, -31); cx.lineTo(26, -19); cx.lineTo(42, -15); cx.lineTo(42, 0); cx.closePath(); cx.fill();
      cx.fillStyle = '#05080c'; cx.beginPath(); cx.moveTo(-19, -19); cx.lineTo(-13, -28); cx.lineTo(-2, -28); cx.lineTo(-2, -19); cx.closePath(); cx.fill(); cx.beginPath(); cx.moveTo(2, -19); cx.lineTo(2, -28); cx.lineTo(12, -28); cx.lineTo(21, -19); cx.closePath(); cx.fill();
      cx.fillStyle = '#4a2f24'; cx.fillRect(-40, -12, 14, 5); cx.fillRect(18, -9, 18, 4); cx.fillStyle = '#34445a'; cx.fillRect(-22, -31, 36, 1.6);
      cx.fillStyle = '#0b0f15'; cx.beginPath(); cx.arc(-26, 0, 7, Math.PI, 0); cx.fill(); cx.beginPath(); cx.arc(26, 0, 7, Math.PI, 0); cx.fill();
      if (d.t === 11) { fireVent(-6, -30, 1.6, .75, d.id * 7.1, 1, G.t); fireVent(20, -22, 1.2, .5, d.id * 3.3, 2, G.t); smokeVent(-6, -30, 1.6, .6, d.id * 7.1, G.t); }
      break;
    case 5: // twisted girder
      cx.lineCap = 'round'; cx.strokeStyle = '#1c2530'; cx.lineWidth = 6; cx.beginPath(); cx.moveTo(-22, 0); cx.lineTo(-14, -30); cx.lineTo(2, -46); cx.lineTo(16, -38); cx.lineTo(24, -62); cx.stroke();
      cx.strokeStyle = '#4a5c74'; cx.lineWidth = 1.6; cx.beginPath(); cx.moveTo(-24, 0); cx.lineTo(-16, -30); cx.lineTo(0, -46); cx.lineTo(14, -38); cx.lineTo(22, -62); cx.stroke();
      cx.strokeStyle = '#6a4a38'; cx.lineWidth = 1.3; line(-14, -30, -4, -24); line(16, -38, 8, -30);
      break;
    case 6: // tire stack
      for (let i = 0; i < 3; i++) { cx.fillStyle = '#0d1116'; cx.beginPath(); cx.ellipse(0, -5 - i * 9, 15, 6, 0, 0, 7); cx.fill(); cx.fillStyle = '#05070a'; cx.beginPath(); cx.ellipse(0, -6 - i * 9, 7, 2.5, 0, 0, 7); cx.fill(); }
      cx.fillStyle = '#26303d'; cx.fillRect(-15, -14, 2, 4);
      break;
    case 7: { // fallen machine: skull, ribs, arm, one dim red eye
      const c = chrome(false);
      ribcage(14, -2, .8, c); limb(-10, -3, -26, -6, 2.4, c); limb(-26, -6, -34, -2, 2.1, c);
      skull(-4, -8, .95, c, '#8a1818', false);
      cx.strokeStyle = '#1b222c'; cx.lineWidth = 1.4; line(2, -2, 10, -6);
      break; }
    case 16: case 8: // crater (16 glows with embers and fire)
      cx.fillStyle = '#0a1018'; cx.beginPath(); cx.ellipse(0, -2, 48, 11, 0, 0, 7); cx.fill();
      cx.strokeStyle = '#34445c'; cx.lineWidth = 2; cx.beginPath(); cx.ellipse(0, -2, 48, 11, 0, Math.PI * .95, Math.PI * 2.05); cx.stroke();
      cx.fillStyle = '#05080d'; cx.beginPath(); cx.ellipse(2, -1, 30, 6, 0, 0, 7); cx.fill();
      if (d.t === 16) { const gl = cx.createRadialGradient(0, -2, 2, 0, -2, 40); gl.addColorStop(0, `rgba(255,120,30,${.55 + .15 * Math.sin(G.t * 5 + d.id)})`); gl.addColorStop(1, 'rgba(255,60,10,0)'); cx.fillStyle = gl; cx.beginPath(); cx.ellipse(0, -2, 44, 10, 0, 0, 7); cx.fill(); fireVent(-8, -3, 1.2, .5, d.id * 4.1, 0, G.t); fireVent(14, -2, 1, .4, d.id * 6.7, 1, G.t); smokeVent(0, -3, 1.5, .5, d.id * 4.1, G.t); }
      break;
    case 9: // fallen slab
      cx.fillStyle = '#26303d'; cx.beginPath(); cx.moveTo(-30, 0); cx.lineTo(-20, -9); cx.lineTo(24, -11); cx.lineTo(34, 0); cx.closePath(); cx.fill();
      cx.fillStyle = '#3b4a5e'; cx.beginPath(); cx.moveTo(-20, -9); cx.lineTo(24, -11); cx.lineTo(22, -8); cx.lineTo(-18, -6); cx.closePath(); cx.fill();
      cx.strokeStyle = '#6a4a38'; cx.lineWidth = 1.2; line(26, -9, 34, -16);
      break;
    case 13: { // dead street lamp / pylon with a flickering light and spitting sparks
      cx.fillStyle = '#10161f'; cx.fillRect(-2.5, -96, 5, 96); cx.fillRect(-16, -5, 32, 5); cx.strokeStyle = '#10161f'; cx.lineWidth = 4; line(0, -94, 20, -100); line(20, -100, 26, -92);
      cx.fillStyle = '#1e2a3a'; cx.fillRect(-2.5, -96, 1.4, 96);
      const on = Math.sin(G.t * 13 + d.id * 9) > .4 && Math.sin(G.t * 2.3 + d.id) > -.2;
      if (on) { const lg = cx.createRadialGradient(26, -90, 1, 26, -90, 38); lg.addColorStop(0, 'rgba(190,225,255,.7)'); lg.addColorStop(1, 'rgba(120,180,255,0)'); cx.fillStyle = lg; cx.fillRect(-14, -130, 80, 80); cx.fillStyle = '#e6f2ff'; cx.fillRect(23, -93, 7, 4); }
      if (hash(d.id * 71) < .5 && Math.floor(G.t * 9 + d.id) % 5 === 0) { cx.fillStyle = '#ffd27a'; for (let k = 0; k < 4; k++) cx.fillRect(26 + (hash(d.id * 3 + k + Math.floor(G.t * 9)) - .5) * 20, -90 + hash(d.id * 5 + k + Math.floor(G.t * 9)) * 22, 1.6, 1.6); }
      break; }
    case 14: { // sandbag barricade with a rusted sign and a small fire
      for (let r = 0; r < 3; r++) for (let c = 0; c < 5 - r; c++) { cx.fillStyle = (r + c) % 2 ? '#3a3a30' : '#2f3128'; cx.beginPath(); cx.ellipse(-30 + r * 6 + c * 15, -5 - r * 9, 8.5, 5, 0, 0, 7); cx.fill(); cx.fillStyle = 'rgba(0,0,0,.35)'; cx.fillRect(-36 + r * 6 + c * 15, -4 - r * 9, 15, 1.4); }
      cx.fillStyle = '#26303d'; cx.fillRect(22, -44, 2.5, 44); cx.fillStyle = '#5a2e22'; cx.fillRect(10, -52, 26, 14); cx.fillStyle = '#c9c3b2'; cx.fillRect(14, -48, 18, 2); cx.fillRect(14, -43, 12, 2);
      if (hash(d.id * 17) < .55) { fireVent(-12, -28, 1.1, .45, d.id * 8.3, 1, G.t); smokeVent(-12, -28, 1.2, .4, d.id * 8.3, G.t); }
      break; }
    case 15: { // burnt-out machine hulk: slumped hull, skewed turret, glowing seams, fire
      cx.fillStyle = '#0a0f16'; cx.beginPath(); cx.moveTo(-44, 0); cx.lineTo(-40, -16); cx.lineTo(-20, -24); cx.lineTo(24, -22); cx.lineTo(42, -12); cx.lineTo(46, 0); cx.closePath(); cx.fill();
      cx.fillStyle = '#16202c'; cx.beginPath(); cx.moveTo(-14, -24); cx.lineTo(-6, -38); cx.lineTo(16, -36); cx.lineTo(22, -22); cx.closePath(); cx.fill(); cx.strokeStyle = '#0a0f16'; cx.lineWidth = 5; line(12, -32, 46, -42);
      cx.fillStyle = '#2a3748'; cx.fillRect(-38, -17, 74, 1.6); cx.fillStyle = '#05080d'; for (let k = 0; k < 6; k++) { cx.beginPath(); cx.arc(-36 + k * 15, -3, 5.5, 0, 7); cx.fill(); }
      const gl = .6 + .3 * Math.sin(G.t * 4 + d.id); cx.fillStyle = `rgba(255,110,30,${gl})`; cx.fillRect(-26, -15, 10, 1.6); cx.fillRect(8, -12, 14, 1.6);
      fireVent(-2, -36, 1.5, .8, d.id * 6.1, 0, G.t); smokeVent(-2, -36, 1.7, .7, d.id * 6.1, G.t); if (hash(d.id * 13) < .6) fireVent(-30, -17, 1.1, .5, d.id * 9.7, 1, G.t);
      break; }
    case 10: { // ruined building facade framing the corridor
      const w = 66 + (d.id * 13 % 40), h = 150 + (d.id * 29 % 110), seed = Math.floor(d.id * 977);
      cx.fillStyle = '#0c131c'; cx.beginPath(); cx.moveTo(-w / 2, 0); cx.lineTo(-w / 2, -h);
      for (let i = 0; i <= 6; i++) cx.lineTo(-w / 2 + i * w / 6, -h + (hash(seed + i) * 34) * (i % 2 ? 1 : .4));
      cx.lineTo(w / 2, 0); cx.closePath(); cx.fill();
      cx.fillStyle = '#1d2d42'; cx.fillRect(d.f > 0 ? -w / 2 : w / 2 - 3, -h + 12, 3, h - 12);                 // rim light on the lane-facing edge
      for (let r = 0; r < Math.floor((h - 30) / 22); r++) for (let cI = 0; cI < Math.floor(w / 18); cI++) {
        if (hash(seed + r * 11 + cI * 3) < .22) continue;
        const wx = -w / 2 + 6 + cI * 18, wy = -h + 24 + r * 22, lit = hash(seed + r * 5 + cI * 7) < .07;
        cx.fillStyle = lit ? '#e98a3c' : '#04070b'; cx.fillRect(wx, wy, 11, 13);
      }
      cx.fillStyle = '#05080d'; for (let r = 0; r < 6; r++) cx.fillRect(-w / 2, -h + 18 + r * 22, w, 2);          // floor slabs
      cx.strokeStyle = '#6a4a38'; cx.lineWidth = 1.6; line(-w / 4, -h + 8, -w / 4 - 4, -h - 16); line(w / 5, -h + 4, w / 5 + 6, -h - 12);
      if (d.id > 6) { const f = Math.sin(G.t * 12 + d.id) * 4; cx.globalAlpha = .25; cx.fillStyle = '#ff8a2a'; cx.beginPath(); cx.arc(w / 4, -h + 4, 34, 0, 7); cx.fill(); cx.globalAlpha = 1;
        cx.fillStyle = '#ff6a14'; cx.beginPath(); cx.moveTo(w / 4 - 12, -h + 8); cx.lineTo(w / 4 - 4, -h - 14 + f); cx.lineTo(w / 4 + 2, -h - 28 + f); cx.lineTo(w / 4 + 8, -h - 10 - f); cx.lineTo(w / 4 + 14, -h + 8); cx.fill(); }
      { const hb = hash(seed + 901);   // each ruin is different: sagging floors, bare rebar, an aerial, windows glowing from fires inside, and some burn from the roof
        cx.fillStyle = '#05080c'; for (let k = 0; k < 2; k++) { const fy = -h * (.25 + .5 * hash(seed + 930 + k)); cx.beginPath(); cx.moveTo(-w / 2, fy); cx.lineTo(-w / 2 + w * (.35 + .5 * hash(seed + 940 + k)), fy + 6 + 8 * hash(seed + 950 + k)); cx.lineTo(-w / 2, fy + 10); cx.fill(); }
        cx.strokeStyle = '#4a3a30'; cx.lineWidth = 1.3; for (let k = 0; k < 4; k++) { const rx = -w / 2 + w * hash(seed + 960 + k); line(rx, -h + 6, rx + (hash(seed + 970 + k) - .5) * 14, -h - 10 - 14 * hash(seed + 980 + k)); }
        if (hb < .3) { cx.strokeStyle = '#0c131c'; cx.lineWidth = 2; line(w * .18, -h, w * .22, -h - 38); line(w * .12, -h - 22, w * .3, -h - 22); }
        if (hb > .6) { const nf = 1 + Math.floor(hash(seed + 902) * 3);
          for (let i2 = 0; i2 < nf; i2++) { const fx = -w / 2 + w * (.18 + .64 * hash(seed + 910 + i2)), fy = -h * (.28 + .6 * hash(seed + 920 + i2)), sd2 = seed * .37 + i2 * 11.3;
            const gl = cx.createRadialGradient(fx, fy, 1, fx, fy, 34); gl.addColorStop(0, 'rgba(255,130,40,.55)'); gl.addColorStop(1, 'rgba(255,70,10,0)'); cx.fillStyle = gl; cx.fillRect(fx - 34, fy - 34, 68, 68);
            fireVent(fx, fy + 6, 1.7, .6 + .25 * hash(seed + 990 + i2), sd2, i2, G.t); smokeVent(fx, fy - 4, 1.9, .5, sd2, G.t); } }
        else if (hb > .3 && hb < .4) smokeVent(0, -h + 8, 2.1, .55, seed * .21, G.t); }
      break; }
  }
  cx.restore();
}

// ---------------------------------------------------------------- rendering: world

function drawHaz(h) {
  const rel = h.wz - G.dist, q = P(h.x, rel), s = q.s;
  if (h.k === 'mine') { // a plasma mine: a flat disc with a pulsing blue core, brighter once armed
    const on = h.arm <= 0, pl = .5 + .5 * Math.sin(G.t * (on ? 12 : 5) + h.x * 7);
    cx.save(); cx.translate(q.x, q.y); cx.fillStyle = 'rgba(0,0,0,.35)'; cx.beginPath(); cx.ellipse(0, 0, 13 * s * 1.3, 4 * s * 1.3, 0, 0, 7); cx.fill();
    cx.fillStyle = '#2b323b'; cx.beginPath(); cx.ellipse(0, -3 * s * 1.3, 11 * s * 1.3, 4.2 * s * 1.3, 0, 0, 7); cx.fill(); cx.fillStyle = '#4d5866'; cx.beginPath(); cx.ellipse(0, -5 * s * 1.3, 9 * s * 1.3, 3 * s * 1.3, 0, 0, 7); cx.fill();
    cx.globalCompositeOperation = 'lighter'; glow(0, -5 * s * 1.3, (on ? 2.6 : 1.6) * s * 1.3 * (.7 + .5 * pl), on ? '#7ad0ff' : '#3a6a9a'); cx.restore(); return;
  }
  if (h.k === 'uxo') {
    cx.save(); cx.translate(q.x, q.y); cx.scale(s * 1.3, s * 1.3);
    shadow(14); cx.rotate(-.3);
    cx.fillStyle = '#4b5340'; cx.fillRect(-5, -24, 10, 26); cx.fillStyle = '#2a2f26'; cx.fillRect(-5, -16, 10, 3); cx.fillStyle = '#d9b13a'; cx.fillRect(-5, -10, 10, 2);
    cx.fillStyle = '#6a7458'; cx.fillRect(-5, -24, 3, 26);
    cx.fillStyle = '#4b5340'; cx.beginPath(); cx.moveTo(-5, -24); cx.lineTo(0, -32); cx.lineTo(5, -24); cx.fill();
    cx.fillStyle = '#2a2f26'; cx.beginPath(); cx.moveTo(-5, 0); cx.lineTo(-10, 5); cx.lineTo(-5, -6); cx.fill(); cx.beginPath(); cx.moveTo(5, 0); cx.lineTo(10, 5); cx.lineTo(5, -6); cx.fill();
    cx.rotate(.3); cx.fillStyle = '#10161f'; cx.beginPath(); cx.moveTo(-14, 2); cx.lineTo(-8, -6); cx.lineTo(0, -3); cx.lineTo(9, -7); cx.lineTo(15, 2); cx.closePath(); cx.fill();
    if (Math.sin(G.t * 6 + h.x * 9) > 0) glow(0, -14, 1.8, '#ff2a2a');
    cx.restore();
    return;
  }
}

function drawPowerup(pu) {
  const rel = pu.wz - G.dist, q = P(pu.x, rel), s = q.s * 1.5, bob = Math.sin(G.t * 3 + pu.x * 4) * 2 * s;
  cx.save(); cx.globalCompositeOperation = 'lighter'; cx.fillStyle = pu.k === 'rapid' ? 'rgba(255,170,60,.16)' : pu.k === 'shield' ? 'rgba(120,200,255,.16)' : ITEMS[pu.k] ? 'rgba(255,255,255,.14)' : pu.k === 'nanite' ? 'rgba(110,255,180,.2)' : 'rgba(110,230,255,.16)'; cx.fillRect(q.x - 6 * s, 0, 12 * s, q.y); cx.fillStyle = pu.k === 'rapid' ? 'rgba(255,220,160,.22)' : 'rgba(190,245,255,.22)'; cx.fillRect(q.x - 2.4 * s, 0, 4.8 * s, q.y); cx.restore();   // beacon
  cx.fillStyle = 'rgba(0,0,0,.35)'; cx.beginPath(); cx.ellipse(q.x, q.y, 16 * s, 4 * s, 0, 0, 7); cx.fill();
  cx.save(); cx.translate(q.x, q.y - 14 * s + bob); cx.scale(s, s);
  const bc = pu.k === 'rapid' ? '#ffb03a' : pu.k === 'shield' ? '#8fd0ff' : ITEMS[pu.k] ? ITEMS[pu.k].col : pu.k === 'nanite' ? '#6dffb5' : '#6ff3ff';
  cx.fillStyle = '#0b1218'; cx.fillRect(-13, -14, 26, 24); cx.fillStyle = '#2a3a4a'; cx.fillRect(-12, -13, 24, 22); cx.fillStyle = '#4a6a86'; cx.fillRect(-12, -13, 24, 3);
  cx.strokeStyle = bc; cx.lineWidth = 1.4; cx.strokeRect(-12, -13, 24, 22);
  cx.fillStyle = bc; cx.fillRect(-12, -4, 24, 1.4); cx.fillRect(-12, 3, 24, 1.4);
  if (pu.k === 'rapid') { cx.fillStyle = '#0b1218'; cx.fillRect(-7, -12, 14, 18); cx.fillStyle = bc; cx.beginPath(); cx.moveTo(2, -11); cx.lineTo(-5, 0); cx.lineTo(0, 0); cx.lineTo(-2, 8); cx.lineTo(6, -3); cx.lineTo(1, -3); cx.closePath(); cx.fill(); }   // lightning bolt
  else if (pu.k === 'shield') { cx.fillStyle = '#0b1218'; cx.fillRect(-7, -12, 14, 18); cx.fillStyle = bc; cx.beginPath(); cx.moveTo(0, -11); cx.lineTo(6, -8); cx.lineTo(5, 0); cx.lineTo(0, 6); cx.lineTo(-5, 0); cx.lineTo(-6, -8); cx.closePath(); cx.fill(); cx.fillStyle = '#0b1218'; cx.fillRect(-1, -7, 2, 9); }   // shield
  else if (pu.k === 'nanite') { cx.fillStyle = '#0b1218'; cx.fillRect(-9, -12, 18, 18); cx.fillStyle = bc; cx.fillRect(-2, -10, 4, 14); cx.fillRect(-7, -5, 14, 4); }
  else if (ITEMS[pu.k]) { cx.fillStyle = '#0b1218'; cx.fillRect(-9, -12, 18, 18); cx.fillStyle = bc; cx.font = '9px ' + FONT; cx.textAlign = 'center'; cx.fillText(ITEMS[pu.k].g, 0, -1); }
  else { cx.fillStyle = '#0b1218'; cx.beginPath(); cx.arc(0, -3, 6, 0, 7); cx.fill(); cx.fillStyle = '#c8d6e4'; cx.beginPath(); cx.arc(0, -4, 4.6, Math.PI, 0); cx.lineTo(3.4, 0); cx.lineTo(-3.4, 0); cx.fill();   // skull icon
    cx.fillStyle = '#4dffd0'; cx.fillRect(-3, -4.6, 2, 1.6); cx.fillRect(1, -4.6, 2, 1.6); }
  cx.restore();
}
function drawC4(c) {
  const e = c.e, q0 = squadPos(), qe = P(e.x, e.wz - G.dist), hh = (HITH[e.t] || 40) * .55 * qe.s * e.sc;
  const x = c.stuck ? qe.x + 5 * qe.s * e.sc : q0.x + (qe.x - q0.x) * c.ft, y = c.stuck ? qe.y - hh : q0.y - 30 + (qe.y - hh - q0.y + 30) * c.ft - Math.sin(c.ft * Math.PI) * 50, s = Math.max(.8, qe.s * 1.2);
  cx.save(); cx.translate(x, y); cx.fillStyle = '#2a2f26'; cx.fillRect(-7 * s, -4 * s, 14 * s, 8 * s); cx.fillStyle = '#6a7458'; cx.fillRect(-7 * s, -4 * s, 14 * s, 2 * s);
  if (c.stuck && Math.sin(G.t * (6 + (3.2 - c.fuse) * 5)) > 0) { cx.fillStyle = '#ff2a2a'; cx.fillRect(-2 * s, -1 * s, 4 * s, 3 * s); glow(0, 0, 2.2 * s, '#ff2a2a'); }
  cx.restore();
}
function drawNuke(n) { // the M-38 on its way: a fat warhead with a long fire trail
  const q = P(n.x, n.wz - G.dist), s = q.s * 2.4, tr = P(n.x, n.wz - G.dist - 90);
  cx.save(); cx.globalCompositeOperation = 'lighter'; streak(tr.x, tr.y - 40 * tr.s, q.x, q.y - 40 * q.s, 9 * q.s + 3, '255,140,40', .5); streak(tr.x, tr.y - 40 * tr.s, q.x, q.y - 40 * q.s, 3.2 * q.s + 1, '255,244,200', .9); cx.restore();
  cx.save(); cx.translate(q.x, q.y - 40 * q.s); cx.fillStyle = '#9aa3ac'; cx.fillRect(-3 * s, -8 * s, 6 * s, 14 * s); cx.fillStyle = '#e8c23a'; cx.fillRect(-3 * s, -3 * s, 6 * s, 2.4 * s); cx.fillStyle = '#c0392b'; cx.beginPath(); cx.moveTo(-3 * s, -8 * s); cx.lineTo(0, -13 * s); cx.lineTo(3 * s, -8 * s); cx.fill(); cx.restore();
}
function drawBeam(b) { // the M-25 discharge: a column of violet-white plasma down the lane
  const a = clamp(b.t / b.max, 0, 1), q0 = P(b.x, 0), q1 = P(b.x, 1400), w0 = 52 * q0.s * 1.4 * (.5 + a), w1 = 52 * q1.s * 1.4 * (.5 + a);
  cx.save(); cx.globalCompositeOperation = 'lighter';
  for (const [k, col] of [[1, `rgba(150,60,255,${.4 * a})`], [.55, `rgba(205,140,255,${.6 * a})`], [.22, `rgba(255,245,255,${.95 * a})`]]) { cx.fillStyle = col; cx.beginPath(); cx.moveTo(q0.x - w0 * k, q0.y); cx.lineTo(q0.x + w0 * k, q0.y); cx.lineTo(q1.x + w1 * k, q1.y); cx.lineTo(q1.x - w1 * k, q1.y); cx.fill(); }
  cx.restore();
}
function drawFallout(f) {
  const q = P(f.x, f.wz - G.dist), rx = f.r * LANE * q.s * 1.1, ry = Math.max(4, rx * .3), fade = clamp(f.t / 3, 0, 1) * clamp((f.t0 - f.t) * 3, 0, 1), pl = .5 + .5 * Math.sin(G.t * 2.4 + f.sd);
  cx.save(); cx.globalCompositeOperation = 'lighter'; cx.fillStyle = `rgba(80,230,70,${(.12 + .08 * pl) * fade})`; cx.beginPath(); cx.ellipse(q.x, q.y, rx, ry, 0, 0, 7); cx.fill();
  cx.fillStyle = `rgba(190,255,120,${(.08 + .08 * pl) * fade})`; cx.beginPath(); cx.ellipse(q.x, q.y, rx * .55, ry * .55, 0, 0, 7); cx.fill();
  for (let i = 0; i < 4; i++) { const t = (G.t * .35 + i * .25 + hash(f.sd * 7 + i)) % 1; cx.fillStyle = `rgba(160,255,140,${(1 - t) * .5 * fade})`; cx.fillRect(q.x + (hash(f.sd * 3 + i) - .5) * rx * 1.4 - 1, q.y - t * 60 * q.s - 1, 2, 2); }
  cx.restore();
}
function drawFlare(f) { // a red signal flare burning on the road, smoke rising, and the barrage circle
  const q = P(f.x, f.wz - G.dist), s = q.s, rx = 105 * s * 1.15, ry = Math.max(5, rx * .3), fl = .7 + .3 * Math.sin(G.t * 21), a = clamp(f.life / 1, 0, 1);
  cx.save(); cx.globalAlpha = a; cx.strokeStyle = `rgba(255,70,50,${.4 + .3 * Math.sin(G.t * 6)})`; cx.lineWidth = 2; cx.beginPath(); cx.ellipse(q.x, q.y, rx * 1.12, ry * 1.12, 0, 0, 7); cx.stroke();
  cx.globalCompositeOperation = 'lighter'; glow(q.x, q.y - 4 * s, 3.6 * s * fl, '#ff3a2a'); cx.globalAlpha = a; cx.fillStyle = `rgba(255,90,60,${.08 * fl})`; cx.beginPath(); cx.ellipse(q.x, q.y, rx, ry, 0, 0, 7); cx.fill();
  cx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 6; i++) { const t = (G.t * .5 + i / 6) % 1; cx.fillStyle = `rgba(255,${90 + 60 * t | 0},${70 + 80 * t | 0},${(1 - t) * .3})`; cx.beginPath(); cx.arc(q.x + Math.sin(t * 5 + i) * 6 * s, q.y - t * 150 * s, (4 + t * 16) * s, 0, 7); cx.fill(); }
  cx.restore();
}
function gritIn(path, x, y, w, h, kind, al, sc) { // roughen a shape: clip to its outline and lay a texture over it
  const tx = getTex(kind); if (!tx || save.fx === 'low') return;
  cx.save(); cx.beginPath(); path(); cx.clip(); cx.globalAlpha = al; cx.imageSmoothingEnabled = false;
  const tw = Math.max(tx.width * sc, w / 7), th2 = Math.max(tx.height * sc, h / 7);
  for (let ox = x; ox < x + w; ox += tw) for (let oy = y; oy < y + h; oy += th2) cx.drawImage(tx, ox, oy, tw, th2);
  cx.restore();
}
const poly = (pts, qx, qy) => () => { pts.forEach((p, i) => i ? cx.lineTo(qx + p[0], qy + p[1]) : cx.moveTo(qx + p[0], qy + p[1])); cx.closePath(); };
function crackAt(x, y, len, sd, s, col) { cx.strokeStyle = col || 'rgba(12,12,16,.85)'; cx.lineWidth = Math.max(.8, s * .7); cx.beginPath(); cx.moveTo(x, y); let px = x, py = y, a = hash(sd) * 6.28; for (let i = 0; i < 6; i++) { a += (hash(sd + i * 3) - .5) * 1.4; px += Math.cos(a) * len / 6; py += Math.abs(Math.sin(a)) * len / 6 + len * .03; cx.lineTo(px, py); if (i === 2) { cx.moveTo(px, py); } } cx.stroke(); }
function drawJersey(o, q, s, w, sd) { // a battered concrete barrier: sloped base, chipped top, faded hazard paint, cracks, rebar where it is broken
  const h = 34 * s, tw = w * .56, x = q.x, y = q.y, hp = o.hp / 120, fl = o.hit > 0;
  const pts = [[-w, 0], [-w * .92, -h * .24], [-w * .64, -h * .42], [-tw, -h], [tw, -h], [w * .64, -h * .42], [w * .92, -h * .24], [w, 0]];
  cx.fillStyle = 'rgba(0,0,0,.5)'; cx.beginPath(); cx.ellipse(x, y + 2 * s, w * 1.25, 7 * s, 0, 0, 7); cx.fill();
  const g = cx.createLinearGradient(x - w, 0, x + w, 0); g.addColorStop(0, fl ? '#fff' : '#b4b7ba'); g.addColorStop(.45, fl ? '#eee' : '#8c9094'); g.addColorStop(1, fl ? '#ccc' : '#585c61');
  cx.fillStyle = g; cx.beginPath(); poly(pts, x, y)(); cx.fill();
  const gd = cx.createLinearGradient(0, y - h, 0, y); gd.addColorStop(0, 'rgba(255,255,255,.1)'); gd.addColorStop(.55, 'rgba(0,0,0,0)'); gd.addColorStop(1, 'rgba(20,12,6,.55)'); cx.fillStyle = gd; cx.beginPath(); poly(pts, x, y)(); cx.fill();
  cx.fillStyle = '#cfd2d4'; cx.beginPath(); cx.moveTo(x - tw, y - h); cx.lineTo(x + tw, y - h); cx.lineTo(x + tw * .94, y - h * .88); cx.lineTo(x - tw * .94, y - h * .88); cx.fill();   // lit top edge
  cx.strokeStyle = 'rgba(0,0,0,.45)'; cx.lineWidth = Math.max(1, s * .9); cx.beginPath(); cx.moveTo(x - w * .64, y - h * .42); cx.lineTo(x + w * .64, y - h * .42); cx.moveTo(x, y - h * .9); cx.lineTo(x + (hash(sd) - .5) * 3 * s, y); cx.stroke();   // the knee of the profile and the expansion seam
  for (const sgn of [-1, 1]) { cx.fillStyle = 'rgba(255,255,255,.18)'; cx.beginPath(); cx.moveTo(x + sgn * tw, y - h); cx.lineTo(x + sgn * w * .64, y - h * .42); cx.lineTo(x + sgn * w * .66, y - h * .38); cx.lineTo(x + sgn * tw * 1.04, y - h * .96); cx.fill(); }
  // faded safety stripes
  cx.save(); cx.beginPath(); cx.rect(x - tw * .86, y - h * .84, tw * 1.72, h * .26); cx.clip();
  for (let i = -8; i < 9; i++) { cx.fillStyle = i % 2 ? 'rgba(215,90,30,.8)' : 'rgba(225,225,220,.75)'; cx.beginPath(); cx.moveTo(x + i * tw * .22, y - h * .58); cx.lineTo(x + i * tw * .22 + tw * .22, y - h * .58); cx.lineTo(x + i * tw * .22 + tw * .22 + h * .2, y - h * .84); cx.lineTo(x + i * tw * .22 + h * .2, y - h * .84); cx.fill(); }
  cx.restore();
  gritIn(poly(pts, x, y), x - w, y - h, w * 2, h, 'dirt', .62, .6);
  gritIn(poly(pts, x, y), x - w, y - h, w * 2, h, 'ash', .25, .9);
  crackAt(x - w * .5, y - h * .28, h * .7, sd + 1, s); crackAt(x + w * .3, y - h * .8, h * .5, sd + 5, s);
  for (let i = 0; i < 3; i++) { const bx = x + (hash(sd + 20 + i) - .3) * w, by = y - h * (.3 + hash(sd + 30 + i) * .45); cx.fillStyle = 'rgba(15,15,18,.85)'; cx.beginPath(); cx.arc(bx, by, 1.5 * s, 0, 7); cx.fill(); cx.strokeStyle = 'rgba(15,15,18,.4)'; cx.lineWidth = .8; for (let k = 0; k < 4; k++) { cx.beginPath(); cx.moveTo(bx, by); cx.lineTo(bx + Math.cos(k * 1.57 + i) * 4 * s, by + Math.sin(k * 1.57 + i) * 4 * s); cx.stroke(); } }   // bullet strikes
  if (hp < .75) { // a chunk knocked out of the top corner, rebar showing
    cx.fillStyle = '#17181a'; cx.beginPath(); cx.moveTo(x + tw * .3, y - h); cx.lineTo(x + tw * .98, y - h); cx.lineTo(x + tw * .9, y - h * .72); cx.lineTo(x + tw * .62, y - h * .8); cx.lineTo(x + tw * .5, y - h * .66); cx.closePath(); cx.fill();
    cx.strokeStyle = '#8a4a26'; cx.lineWidth = Math.max(1.2, s * 1.2); cx.beginPath(); for (let i = 0; i < 3; i++) { cx.moveTo(x + tw * (.5 + i * .18), y - h * .72); cx.lineTo(x + tw * (.55 + i * .2), y - h * (1.12 + i * .06)); } cx.stroke();
  }
  const dust = cx.createRadialGradient(x, y, 1, x, y, w * 1.2); dust.addColorStop(0, 'rgba(150,125,95,.3)'); dust.addColorStop(1, 'rgba(150,125,95,0)'); cx.fillStyle = dust; cx.beginPath(); cx.ellipse(x, y, w * 1.2, 7 * s, 0, 0, 7); cx.fill();
}
function drawRubble(o, q, s, w, sd) { // a berm of broken slabs, brick, pipe and tangled rebar, shaded chunk by chunk
  const rx = w * 1.2, ry = Math.max(8, rx * .34), x = q.x, y = q.y;
  cx.fillStyle = 'rgba(0,0,0,.5)'; cx.beginPath(); cx.ellipse(x, y + 2 * s, rx * 1.12, ry * 1.1, 0, 0, 7); cx.fill();
  const chunks = []; for (let i = 0; i < 24; i++) chunks.push({ px: (hash(sd * 3 + i) - .5) * rx * 1.75, py: -hash(sd * 5 + i) * ry * 1.35, sz: (7 + hash(sd * 7 + i) * 17) * s, i });
  chunks.sort((a, b) => a.py - b.py);
  for (const c of chunks) {
    const kind = hash(sd * 9 + c.i), base = kind < .58 ? 70 + hash(sd + c.i) * 70 | 0 : 0, cx0 = x + c.px, cy0 = y + c.py;
    const col = kind < .58 ? [base, base - 3, base - 10] : kind < .8 ? [120 + hash(sd + c.i * 3) * 40 | 0, 52, 40] : [34, 32, 32];
    const pts = []; for (let k = 0; k < 6; k++) { const an = k / 6 * 6.283 + hash(sd * 11 + c.i + k) * .6, rr = c.sz * (.55 + hash(sd * 13 + c.i * 7 + k) * .6); pts.push([Math.cos(an) * rr, Math.sin(an) * rr * .62 - c.sz * .3]); }
    const pa = poly(pts, cx0, cy0);
    cx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`; cx.beginPath(); pa(); cx.fill();
    const gl = cx.createLinearGradient(cx0 - c.sz, cy0 - c.sz, cx0 + c.sz, cy0 + c.sz * .4); gl.addColorStop(0, 'rgba(255,255,255,.22)'); gl.addColorStop(.5, 'rgba(0,0,0,0)'); gl.addColorStop(1, 'rgba(0,0,0,.45)'); cx.fillStyle = gl; cx.beginPath(); pa(); cx.fill();
    gritIn(pa, cx0 - c.sz, cy0 - c.sz, c.sz * 2, c.sz * 1.6, 'dirt', .5, .5);
    cx.strokeStyle = 'rgba(0,0,0,.55)'; cx.lineWidth = Math.max(.8, s * .6); cx.beginPath(); pa(); cx.stroke();
    if (kind >= .58 && kind < .8) { cx.strokeStyle = 'rgba(30,14,10,.5)'; cx.lineWidth = .7; for (let r2 = -1; r2 <= 1; r2++) { cx.beginPath(); cx.moveTo(cx0 - c.sz * .6, cy0 + r2 * c.sz * .22 - c.sz * .3); cx.lineTo(cx0 + c.sz * .6, cy0 + r2 * c.sz * .22 - c.sz * .3); cx.stroke(); } }   // brick courses
  }
  cx.lineCap = 'round';
  for (let i = 0; i < 14; i++) { // rebar: rusty, bent, with a bright edge
    const px = x + (hash(sd * 11 + i) - .5) * rx * 1.7, py = y - hash(sd * 13 + i) * ry * .9, ex = px + (hash(sd * 15 + i) - .5) * 38 * s, ey = py - (14 + hash(sd * 19 + i) * 32) * s;
    cx.strokeStyle = '#4a2410'; cx.lineWidth = Math.max(1.6, s * 1.5); cx.beginPath(); cx.moveTo(px, py); cx.quadraticCurveTo(px + (hash(sd * 17 + i) - .5) * 22 * s, py - 14 * s, ex, ey); cx.stroke();
    cx.strokeStyle = '#a8602c'; cx.lineWidth = Math.max(.7, s * .6); cx.stroke();
  }
  cx.strokeStyle = 'rgba(30,30,34,.7)'; cx.lineWidth = Math.max(.7, s * .6); cx.beginPath(); for (let i = 0; i < 3; i++) { const px = x + (hash(sd + 80 + i) - .5) * rx, py = y - ry * (.6 + hash(sd + 90 + i) * .5); cx.moveTo(px, py); cx.bezierCurveTo(px + 14 * s, py - 24 * s, px - 18 * s, py - 30 * s, px + 8 * s, py - 44 * s); } cx.stroke();   // loose cable
  for (let i = 0; i < 14; i++) { cx.fillStyle = `rgba(${90 + hash(sd + i * 4) * 60 | 0},${86 + hash(sd + i * 4) * 50 | 0},${80 + hash(sd + i * 4) * 40 | 0},.8)`; cx.fillRect(x + (hash(sd + 200 + i) - .5) * rx * 2.1, y + hash(sd + 210 + i) * ry * .5, 1.6 * s, 1.2 * s); }
  const dust = cx.createRadialGradient(x, y - ry, 2, x, y - ry, rx); dust.addColorStop(0, 'rgba(160,140,120,.16)'); dust.addColorStop(1, 'rgba(160,140,120,0)'); cx.fillStyle = dust; cx.beginPath(); cx.ellipse(x, y - ry, rx, ry * 1.3, 0, 0, 7); cx.fill();
}
function drawTrap(o, q, s, w, sd) { // czech hedgehog: three welded steel beams, rust-streaked, gusseted and bolted
  const r = w * 1.35 + 8 * s, x = q.x, y = q.y - 2 * s, bt = Math.max(4, 11 * s);
  cx.fillStyle = 'rgba(0,0,0,.5)'; cx.beginPath(); cx.ellipse(x, q.y + 2 * s, r * 1.1, 5 * s, 0, 0, 7); cx.fill();
  for (const [a, b] of [[-1, 1], [1, 1], [0, 1.3]]) {
    const x2 = x + a * r, y2 = y - b * r * 1.4, x1 = x - a * r, L = Math.hypot(x2 - x1, y2 - y), an = Math.atan2(y2 - y, x2 - x1);
    cx.save(); cx.translate(x1, y); cx.rotate(an);
    const g = cx.createLinearGradient(0, -bt / 2, 0, bt / 2); g.addColorStop(0, '#9aa4ae'); g.addColorStop(.3, '#59616a'); g.addColorStop(1, '#1d2025'); cx.fillStyle = g; cx.fillRect(0, -bt / 2, L, bt);
    cx.fillStyle = 'rgba(0,0,0,.45)'; cx.fillRect(0, bt * .12, L, bt * .12); cx.fillStyle = 'rgba(255,255,255,.28)'; cx.fillRect(0, -bt * .42, L, Math.max(1, bt * .1));   // the I-beam's web shadow and top edge
    gritIn(() => cx.rect(0, -bt / 2, L, bt), 0, -bt / 2, L, bt, 'metal', .6, .5);
    for (let i = 0; i < 5; i++) { cx.fillStyle = `rgba(${130 + hash(sd + i) * 40 | 0},${60 + hash(sd + i) * 30 | 0},20,.55)`; cx.beginPath(); cx.ellipse(hash(sd + i * 3) * L, (hash(sd + i * 5) - .5) * bt * .6, bt * (.5 + hash(sd + i) * .8), bt * .28, 0, 0, 7); cx.fill(); }   // rust bloom
    cx.fillStyle = '#c9ced4'; for (const e2 of [bt * .5, L - bt * .5]) { cx.beginPath(); cx.arc(e2, 0, Math.max(1, bt * .12), 0, 7); cx.fill(); }
    cx.restore();
  }
  cx.fillStyle = '#3a3f46'; cx.beginPath(); cx.arc(x, y - r * .1, bt * .85, 0, 7); cx.fill(); cx.fillStyle = '#7a838c'; cx.beginPath(); cx.arc(x - bt * .2, y - r * .1 - bt * .2, bt * .3, 0, 7); cx.fill();   // the weld at the crossing
}
function drawObs(o) {
  const rel = o.wz - G.dist, q = P(o.x, rel), s = q.s * 1.75, w = o.hw * LANE * q.s * 1.35, k = o.k, sd = o.sd || o.x * 50 + o.wz;
  cx.save();
  if (k === 'jersey') { drawJersey(o, q, s, w, sd);
  } else if (k === 'rubble') { drawRubble(o, q, s, w, sd);
  } else if (k === 'trap') { drawTrap(o, q, s, w, sd);
  } else if (k === 'cable') { // Power line: heavy pylons, sagging cable with pulsing electricity
    const xa = P(o.x - o.hw, rel), xb = P(o.x + o.hw, rel), hgt = 40 * s, sag = 13 * s, live = !o.sq || rel > -60;
    for (const p of [xa, xb]) {
      cx.fillStyle = '#1e1a17'; cx.fillRect(p.x - 4 * s, p.y - hgt * 1.35, 8 * s, hgt * 1.35);
      cx.fillStyle = '#3a2d24'; cx.fillRect(p.x - 9 * s, p.y - hgt * 1.35, 18 * s, 4 * s);
      cx.fillStyle = '#7a92a8'; cx.fillRect(p.x - 7 * s, p.y - hgt * 1.2, 3 * s, 6 * s); cx.fillRect(p.x + 4 * s, p.y - hgt * 1.2, 3 * s, 6 * s);
    }
    cx.strokeStyle = '#0d0a08'; cx.lineWidth = Math.max(2, 3.2 * s); cx.beginPath(); cx.moveTo(xa.x, xa.y - hgt); cx.quadraticCurveTo(q.x, q.y - hgt + sag * 2.2, xb.x, xb.y - hgt); cx.stroke();
    if (live) {
      cx.globalCompositeOperation = 'lighter'; const n = 9, tick = Math.floor(G.t * 22);
      for (const [lw, col] of [[Math.max(3, 7 * s), 'rgba(60,140,255,.4)'], [Math.max(1.2, 2.4 * s), 'rgba(230,248,255,.98)']]) {
        cx.strokeStyle = col; cx.lineWidth = lw; cx.beginPath();
        for (let i = 0; i <= n; i++) {
          const f = i / n, x = xa.x + (xb.x - xa.x) * f, y = xa.y + (xb.y - xa.y) * f - hgt + Math.sin(f * Math.PI) * sag * 2.2 + (i % n === 0 ? 0 : (hash(tick * 9 + i + sd) - .5) * 18 * s);
          i ? cx.lineTo(x, y) : cx.moveTo(x, y);
        }
        cx.stroke();
      }
      if (hash(tick + sd) > .5) { const f = hash(tick * 3 + sd), x = xa.x + (xb.x - xa.x) * f; glow(x, xa.y - hgt + Math.sin(f * Math.PI) * sag * 2.2, 3.5 * s, '#bfe6ff'); }
    }
  } else if (k === 'truck') { // Abandoned military pickup: cab, rear bed, tires & chassis damage
    const bw = w * 1.25, bh = 32 * s, dm = 1 - o.hp / o.max, fl = o.hit > 0;
    cx.fillStyle = 'rgba(0,0,0,.45)'; cx.beginPath(); cx.ellipse(q.x, q.y + 2 * s, bw * 1.2, 6 * s, 0, 0, 7); cx.fill();
    cx.fillStyle = '#0f1113'; cx.fillRect(q.x - bw * .95, q.y - 12 * s, bw * .35, 12 * s); cx.fillRect(q.x + bw * .6, q.y - 12 * s, bw * .35, 12 * s);
    cx.fillStyle = '#22252a'; cx.fillRect(q.x - bw * 1.02, q.y - 16 * s, bw * 2.04, 6 * s);
    const gBody = cx.createLinearGradient(0, q.y - bh, 0, q.y);
    gBody.addColorStop(0, fl ? '#f0e0c8' : '#5c3e28'); gBody.addColorStop(1, fl ? '#b0a088' : '#332114');
    cx.fillStyle = gBody; cx.fillRect(q.x - bw, q.y - bh, bw * 2, bh * .82);
    cx.fillStyle = fl ? '#d8c8b0' : '#4a3320'; cx.fillRect(q.x - bw * .82, q.y - bh * 1.55, bw * 1.64, bh * .58);
    cx.fillStyle = '#0f1b24'; cx.fillRect(q.x - bw * .68, q.y - bh * 1.46, bw * 1.36, bh * .38);
    cx.fillStyle = '#e62415'; cx.fillRect(q.x - bw * .95, q.y - bh * .75, bw * .18, bh * .24); cx.fillRect(q.x + bw * .77, q.y - bh * .75, bw * .18, bh * .24);
    cx.strokeStyle = '#1a120b'; cx.lineWidth = Math.max(1, s * .9); cx.strokeRect(q.x - bw, q.y - bh * .82, bw * 2, bh * .54);
    if (dm > .35) { cx.strokeStyle = 'rgba(10,8,5,.85)'; cx.lineWidth = Math.max(1.2, s * 1.1); cx.beginPath(); cx.moveTo(q.x - bw * .5, q.y - bh * .95); cx.lineTo(q.x - bw * .18, q.y - bh * .45); cx.moveTo(q.x + bw * .45, q.y - bh * 1.25); cx.lineTo(q.x + bw * .12, q.y - bh * .65); cx.stroke(); }
    if (dm > .6 && Math.random() < .25 && G.parts.length < 380) pushPart({ x: q.x + rnd(-bw, bw) * .5, y: q.y - bh, vx: rnd(-6, 6), vy: -30, life: .8, max: .8, col: '#2a2d33', r: 3, g: -20 });
    gritIn(() => cx.rect(q.x - bw, q.y - bh * 1.55, bw * 2, bh * 1.55), q.x - bw, q.y - bh * 1.55, bw * 2, bh * 1.55, 'metal', .55, .5);
    gritIn(() => cx.rect(q.x - bw, q.y - bh * 1.55, bw * 2, bh * 1.55), q.x - bw, q.y - bh * 1.55, bw * 2, bh * 1.55, 'dirt', .3, .6);
    for (let i = 0; i < 6; i++) { cx.fillStyle = `rgba(${120 + hash(sd + i) * 40 | 0},${58 + hash(sd + i) * 24 | 0},22,.5)`; cx.beginPath(); cx.ellipse(q.x + (hash(sd + i * 3) - .5) * bw * 1.8, q.y - bh * (.15 + hash(sd + i * 5) * 1.3), bw * (.1 + hash(sd + i) * .2), bh * .07, 0, 0, 7); cx.fill(); }   // rust blooms
    { const wx0 = q.x, wy0 = q.y - bh * 1.27; cx.strokeStyle = 'rgba(210,225,235,.55)'; cx.lineWidth = Math.max(.7, s * .5); cx.beginPath(); for (let i = 0; i < 7; i++) { const an = i / 7 * 6.28 + .3; cx.moveTo(wx0, wy0); cx.lineTo(wx0 + Math.cos(an) * bw * .5, wy0 + Math.sin(an) * bh * .22); } cx.stroke(); }   // shattered rear window
    cx.fillStyle = 'rgba(0,0,0,.4)'; cx.beginPath(); cx.moveTo(q.x - bw * .98, q.y - bh * .8); cx.lineTo(q.x - bw * .6, q.y - bh * .72); cx.lineTo(q.x - bw * .66, q.y - bh * .35); cx.lineTo(q.x - bw * .97, q.y - bh * .4); cx.fill();   // a dent in the bed
    cx.fillStyle = '#b8bcc0'; cx.fillRect(q.x - bw * .12, q.y - bh * .38, bw * .24, bh * .07);   // tailgate handle
    cx.fillStyle = 'rgba(0,0,0,.45)'; cx.beginPath(); cx.ellipse(q.x - bw * .78, q.y - 5 * s, bw * .18, 6 * s, 0, 0, 7); cx.fill(); cx.fillStyle = 'rgba(70,70,76,.8)'; cx.fillRect(q.x - bw * .95, q.y - 12 * s, bw * .35, 2 * s);   // a flat tyre
  } else if (k === 'sandbag') { // Multi-layered fortified sandbag wall with canvas outline
    const rows = 4, fl = o.hit > 0, dm = 1 - o.hp / o.max, vis = Math.max(1, Math.ceil(rows * (1 - dm * .6)));
    cx.fillStyle = 'rgba(0,0,0,.4)'; cx.beginPath(); cx.ellipse(q.x, q.y + 2 * s, w * 1.25, 5 * s, 0, 0, 7); cx.fill();
    for (let r = 0; r < vis; r++) {
      const n = 6 - r, bw = (w * 2.3) / 6, y = q.y - (r + 1) * 9.5 * s;
      for (let i = 0; i < n; i++) {
        const x = q.x - (n * bw) / 2 + i * bw + bw / 2, c = 140 + (hash(sd + r * 9 + i) - .5) * 45 | 0;
        cx.fillStyle = fl ? '#fff' : `rgb(${c},${c - 30},${c - 68})`;
        cx.beginPath(); cx.ellipse(x, y + 4 * s, bw * .58, 6.2 * s, 0, 0, 7); cx.fill();
        cx.strokeStyle = 'rgba(35,24,12,.65)'; cx.lineWidth = Math.max(1, s * .7); cx.stroke();
        gritIn(() => cx.ellipse(x, y + 4 * s, bw * .58, 6.2 * s, 0, 0, 7), x - bw * .6, y - 3 * s, bw * 1.2, 14 * s, 'sand', .55, .4);
        cx.strokeStyle = 'rgba(40,28,14,.4)'; cx.lineWidth = .7; cx.beginPath(); cx.moveTo(x - bw * .5, y + 4 * s); cx.lineTo(x + bw * .5, y + 4 * s); for (let t2 = -2; t2 <= 2; t2++) { cx.moveTo(x + t2 * bw * .2, y + 2 * s); cx.lineTo(x + t2 * bw * .2, y + 6 * s); } cx.stroke();   // the sewn mouth of the bag
        cx.fillStyle = 'rgba(255,255,255,.14)'; cx.beginPath(); cx.ellipse(x - bw * .15, y + 1.5 * s, bw * .3, 1.8 * s, 0, 0, 7); cx.fill();
      }
    }
    if (dm > .3) { cx.fillStyle = `rgb(${150},${126},${82})`; for (let i = 0; i < 18; i++) cx.fillRect(q.x + (hash(sd + i) - .5) * w * 2.2, q.y - hash(sd + 30 + i) * 6 * s, 1.6 * s, 1.4 * s); }   // spilled sand
    const dd = cx.createRadialGradient(q.x, q.y, 2, q.x, q.y, w * 1.3); dd.addColorStop(0, 'rgba(170,140,95,.25)'); dd.addColorStop(1, 'rgba(170,140,95,0)'); cx.fillStyle = dd; cx.beginPath(); cx.ellipse(q.x, q.y, w * 1.3, 6 * s, 0, 0, 7); cx.fill();
  } else if (k === 'overpass') {
    const xa = P(-1.12, rel), xb = P(1.12, rel), top = 260 * q.s * 1.4, dk = 48 * q.s * 1.4, col = o.st === 1 ? 1 : 0;
    cx.fillStyle = '#3a3d42';
    for (const p of [xa, xb]) { cx.fillRect(p.x - 30 * q.s, p.y - top, 60 * q.s, top); cx.fillStyle = '#555960'; cx.fillRect(p.x - 30 * q.s, p.y - top, 10 * q.s, top); cx.fillStyle = '#3a3d42'; }
    if (o.st < 2) {
      const sh = o.st === 1 ? Math.sin(G.t * 60) * 2 * s : 0, y0 = xa.y - top - dk * .2 + sh;
      cx.fillStyle = '#2c2f33'; cx.fillRect(xa.x - 38 * q.s, y0, xb.x - xa.x + 76 * q.s, dk);
      cx.fillStyle = '#4b4f56'; cx.fillRect(xa.x - 38 * q.s, y0, xb.x - xa.x + 76 * q.s, dk * .24);
      cx.fillStyle = '#d4b228'; for (let i = 0; i < 18; i++) cx.fillRect(xa.x - 38 * q.s + i * (xb.x - xa.x + 76 * q.s) / 18, y0 + dk * .78, (xb.x - xa.x + 76 * q.s) / 36, dk * .14);
      cx.strokeStyle = '#121315'; cx.lineWidth = Math.max(1, 1.6 * s); cx.beginPath(); for (let i = 0; i < 6; i++) { const x = xa.x + (xb.x - xa.x) * (.1 + i * .16); cx.moveTo(x, y0 + dk * .25); cx.lineTo(x + (hash(i + sd) - .5) * 30 * s, y0 + dk * .95); } cx.stroke();
      if (col) for (let i = 0; i < 3; i++) { if (i === o.open) continue; const lp = P((i - 1) * .6, rel); cx.fillStyle = `rgba(255,70,40,${.18 + .2 * Math.sin(G.t * 14)})`; cx.beginPath(); cx.ellipse(lp.x, lp.y, .3 * LANE * lp.s, Math.max(4, .3 * LANE * lp.s * .28), 0, 0, 7); cx.fill(); }
    }
  } else if (k === 'slab') { // Tilted concrete deck slab with rebar grid
    const drop = (1 - o.fall) * 320 * s, h = 34 * s;
    cx.translate(0, -drop); cx.fillStyle = 'rgba(0,0,0,.45)'; cx.beginPath(); cx.ellipse(q.x, q.y + drop, w * 1.15, 6 * s, 0, 0, 7); cx.fill();
    cx.fillStyle = '#5c6066'; cx.beginPath(); cx.moveTo(q.x - w, q.y); cx.lineTo(q.x - w * .9, q.y - h); cx.lineTo(q.x + w * .85, q.y - h * 1.38); cx.lineTo(q.x + w, q.y); cx.fill();
    cx.fillStyle = '#7a7e84'; cx.beginPath(); cx.moveTo(q.x - w * .9, q.y - h); cx.lineTo(q.x + w * .85, q.y - h * 1.38); cx.lineTo(q.x + w * .85, q.y - h * 1.2); cx.lineTo(q.x - w * .9, q.y - h * .82); cx.fill();
    gritIn(() => { cx.moveTo(q.x - w, q.y); cx.lineTo(q.x - w * .9, q.y - h); cx.lineTo(q.x + w * .85, q.y - h * 1.38); cx.lineTo(q.x + w, q.y); cx.closePath(); }, q.x - w, q.y - h * 1.4, w * 2, h * 1.4, 'dirt', .6, .6);
    crackAt(q.x - w * .3, q.y - h * .9, h * .8, sd + 2, s); crackAt(q.x + w * .4, q.y - h * 1.1, h * .6, sd + 7, s);
    cx.strokeStyle = '#7a4222'; cx.lineWidth = Math.max(1.2, s * 1.1); for (let i = 0; i < 7; i++) { const px = q.x - w * .8 + i * w * .28; cx.beginPath(); cx.moveTo(px, q.y - h * 1.1); cx.lineTo(px + (hash(sd + i) - .5) * 16 * s, q.y - h * 1.1 - (10 + hash(sd * 2 + i) * 16) * s); cx.stroke(); }
  }
  cx.restore();
}
function drawScrapChunk(c) {
  const rel = c.wz - G.dist; if (rel < -20) return;
  const q = P(c.x, rel), s = q.s * 1.5, sp = c.sp + G.t * 2;
  cx.save(); cx.translate(q.x, q.y - 4 * s);
  cx.globalAlpha = .22; cx.fillStyle = '#ffd24a'; cx.beginPath(); cx.arc(0, 0, 9 * s, 0, 7); cx.fill(); cx.globalAlpha = 1;
  cx.save(); cx.rotate(sp); cx.fillStyle = '#c9d3dc'; cx.fillRect(-4 * s, -2 * s, 8 * s, 4 * s); cx.fillStyle = '#7a8696'; cx.fillRect(-4 * s, 0, 8 * s, 2 * s); cx.restore();
  cx.save(); cx.rotate(-sp * 1.3); cx.fillStyle = '#9aa6b6'; cx.fillRect(-2.5 * s, -2.5 * s, 5 * s, 5 * s); cx.restore();
  if (Math.sin(G.t * 6 + c.sp * 3) > .75) { cx.fillStyle = '#fff'; cx.fillRect(-1 * s, -4.5 * s, 2 * s, 2 * s); }
  cx.restore();
}

function drawRocket(r) {
  if (r.delay > 0) return;
  const rel = r.wz - G.dist, q = P(r.x, rel), s = q.s * 2;
  if (r.gren) { const h = 30 + Math.sin(clamp(rel / 600, 0, 1) * Math.PI) * 26; cx.fillStyle = '#4a5330'; cx.beginPath(); cx.arc(q.x, q.y - h * q.s, 3.2 * q.s * 1.6 + 1, 0, 7); cx.fill(); cx.fillStyle = '#c9d94a'; cx.fillRect(q.x - 1, q.y - h * q.s - 1, 2, 2); return; }
  cx.save(); cx.translate(q.x, q.y - 32 * q.s);
  cx.fillStyle = 'rgba(255,170,60,.85)'; cx.beginPath(); cx.moveTo(-2.4 * s, 4 * s); cx.lineTo(0, 14 * s + rnd(0, 3 * s)); cx.lineTo(2.4 * s, 4 * s); cx.fill();
  cx.fillStyle = '#ffe9a0'; cx.beginPath(); cx.moveTo(-1.2 * s, 4 * s); cx.lineTo(0, 9 * s); cx.lineTo(1.2 * s, 4 * s); cx.fill();
  cx.fillStyle = '#7a828e'; cx.fillRect(-2 * s, -7 * s, 4 * s, 11 * s); cx.fillStyle = '#d44'; cx.beginPath(); cx.moveTo(-2 * s, -7 * s); cx.lineTo(0, -11 * s); cx.lineTo(2 * s, -7 * s); cx.fill();
  cx.restore();
}

// ---- sector weather: plasma storms in the Foundry, night-vision dark zones in the Metro, radioactive rain on the Salt Flats
const ENVS = { 'Foundry': 'storm', 'Salt Flats': 'rain', 'Drowned Metro': 'dark' };
const ENV_NAMES = { storm: 'PLASMA STORM', rain: 'RADIOACTIVE RAIN', dark: 'DARK ZONE' };
function envStep(dt) {
  if (!G.env || G.over) return;
  if (G.env === 'storm') {   // squalls of burning plasma: markers burn on the road, then it comes down. A gap is always open.
    G.stCd = (G.stCd === undefined ? 7 : G.stCd) - dt;
    if (G.stCd <= 0) { G.stCd = rnd(11, 16); G.squall = 4.5; addText(W / 2, 300, 'PLASMA STORM', '#ff8a3a'); sfx.siren(); }
    if (G.squall > 0) {
      G.squall -= dt; G.sqT = (G.sqT || 0) - dt;
      if (G.sqT <= 0) { G.sqT = .9; const gx = clamp(G.px + rnd(-.5, .5), -.6, .6); for (let i = 0; i < 2; i++) { let x = rnd(-.85, .85); if (Math.abs(x - gx) < .4) x = gx + (x < gx ? -.45 : .45); G.strikes.push({ x: clamp(x, -.88, .88), rz: rnd(4, 40), t: 1.2, max: 1.2, dmg: 1 + LS(6, 5), r: .13, fire: 0, storm: 1 }); } }
    }
    G.storm = clamp((G.storm || 0) + ((G.squall > 0 ? 1 : 0) - (G.storm || 0)) * dt * 1.5, 0, 1);
  } else if (G.env === 'dark') {
    const ph = Math.sin(G.dist / 520 + 1.2), tg = ph > .15 ? clamp((ph - .15) * 3, 0, 1) : 0, was = (G.dk || 0) > .3;
    G.dk = (G.dk || 0) + (tg - (G.dk || 0)) * dt * 1.2;
    if (!was && G.dk > .3) addText(W / 2, 300, 'DARK ZONE: NIGHT VISION', '#6dff9a');
  } else if (G.env === 'rain') {
    const ph = Math.sin(G.dist / 700 + 2.4), tg = ph > 0 ? clamp(ph * 3, 0, 1) : 0, was = (G.rn || 0) > .3;
    G.rn = (G.rn || 0) + (tg - (G.rn || 0)) * dt * 1.2;
    if (!was && G.rn > .3) addText(W / 2, 300, 'RADIOACTIVE RAIN: SCRAP +30%, FIRE -10%', '#9aff7a');
    if (G.rn > .5 && Math.random() < dt * 8) sfx.geiger();
  }
}
function drawEnv() {
  const t = G.t;
  if (G.env === 'storm' && (G.storm || 0) > .01) {
    const k = G.storm;
    // Dynamic lightning / plasma thunderbolt flashes
    const flash = (Math.sin(t * 14.3) > .92 && Math.cos(t * 7.1) > .4) ? (0.35 + 0.55 * Math.random()) * k : 0;
    cx.fillStyle = `rgba(${255 * (1 - flash * 0.4)},${70 + flash * 150},${15 + flash * 240},${.07 * k + flash * 0.3})`;
    cx.fillRect(0, 0, W, H);

    // Lightning bolt rendering across sky/horizon
    if (flash > 0.4) {
      cx.save();
      cx.strokeStyle = `rgba(220, 240, 255, ${flash})`;
      cx.lineWidth = 2.5;
      cx.beginPath();
      let lx = W * (0.2 + hash(Math.floor(t * 10)) * 0.6), ly = 0;
      cx.moveTo(lx, ly);
      for (let step = 0; step < 5; step++) {
        lx += (hash(step + Math.floor(t * 10)) - 0.5) * 60;
        ly += (HOR + 20) / 5;
        cx.lineTo(lx, ly);
      }
      cx.stroke();
      cx.restore();
    }

    // Plasma particle wind
    cx.save(); cx.globalCompositeOperation = 'lighter'; cx.lineWidth = 1.6;
    for (let i = 0; i < 46; i++) {
      const x = (hash(i) * W + t * 120 * (.5 + hash(i + 9))) % W, y = (hash(i + 3) * H + t * 300 * (.6 + hash(i + 5))) % H;
      cx.strokeStyle = `rgba(255,${120 + hash(i) * 100 | 0},40,${.55 * k + flash * 0.3})`;
      cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x - 7, y - 16); cx.stroke();
    }
    cx.restore();
  } else if (G.env === 'rain' && (G.rn || 0) > .01) {
    const k = G.rn;
    const flash = (Math.sin(t * 9.7) > .95) ? 0.3 * k : 0;
    cx.fillStyle = `rgba(${40 + flash * 180},${255 * (1 - flash * 0.2)},${70 + flash * 180},${.05 * k + flash * 0.25})`;
    cx.fillRect(0, 0, W, H);
    
    // Dense angled rain streak passes
    cx.save(); cx.strokeStyle = `rgba(160,255,150,${.4 * k})`; cx.lineWidth = 1;
    for (let i = 0; i < 110; i++) {
      const x = (hash(i) * (W + 80) + t * 60) % (W + 80) - 40, y = (hash(i + 3) * H + t * 640 * (.7 + hash(i + 7) * .5)) % H;
      cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x - 4, y + 15); cx.stroke();
      
      // Ground rain splash ripples
      if (y > HOR + 40 && i % 3 === 0) {
        const splashR = 1.5 + hash(i + 13) * 3;
        cx.strokeStyle = `rgba(180,255,170,${.35 * k})`;
        cx.beginPath(); cx.ellipse(x, y + 15, splashR, splashR * 0.3, 0, 0, 7); cx.stroke();
      }
    }
    cx.restore();
  } else if (G.env === 'dark' && (G.dk || 0) > .01) {
    const k = G.dk, g = cx.createRadialGradient(W / 2, H - 250, 90, W / 2, H - 250, 560);
    g.addColorStop(0, 'rgba(0,16,6,0)'); g.addColorStop(.4, `rgba(0,14,5,${.62 * k})`); g.addColorStop(1, `rgba(0,6,2,${.93 * k})`);
    cx.fillStyle = g; cx.fillRect(0, 0, W, H);
    cx.save(); cx.globalCompositeOperation = 'lighter'; cx.fillStyle = `rgba(20,255,90,${.045 * k})`; cx.fillRect(0, 0, W, H); cx.restore();
  }
}
function drawStrike(st) {
  const q = P(st.x, st.rz), rx = st.r * LANE * q.s + 10, ry = rx * .3;
  if (!st.fire) {
    const p = 1 - st.t / st.max, on = Math.sin(G.t * (10 + p * 22)) > -.3;
    cx.strokeStyle = st.storm ? `rgba(255,150,40,${.45 + .5 * p})` : `rgba(255,60,40,${.45 + .5 * p})`; cx.lineWidth = 2 + 2 * p; cx.beginPath(); cx.ellipse(q.x, q.y, rx, ry, 0, 0, 7); cx.stroke();
    if (on) { cx.fillStyle = `rgba(255,60,40,${.1 + .16 * p})`; cx.fill(); }
    cx.strokeStyle = `rgba(255,150,120,${.5})`; cx.lineWidth = 1.5; cx.beginPath(); cx.ellipse(q.x, q.y, rx * (1 - p * .65), ry * (1 - p * .65), 0, 0, 7); cx.stroke();
  } else {
    const f = st.fire / .3, w = rx * .7 * f;
    cx.save(); cx.globalCompositeOperation = 'lighter';
    cx.fillStyle = `rgba(190,130,255,${.55 * f})`; cx.fillRect(q.x - w / 2, 0, w, q.y);
    cx.fillStyle = `rgba(245,235,255,${.9 * f})`; cx.fillRect(q.x - w * .22, 0, w * .44, q.y);
    cx.fillStyle = `rgba(200,150,255,${.5 * f})`; cx.beginPath(); cx.ellipse(q.x, q.y, rx * 1.2, ry * 1.2, 0, 0, 7); cx.fill();
    cx.restore();
  }
}

function lightPool(x, y, r, col, a, ground) { // stepped, flat-shaded glow so it suits the pixel look
  if (!(r > 0) || !Number.isFinite(r) || !Number.isFinite(x) || !Number.isFinite(y)) return;   // (an object far behind the squad has a negative projected size)
  cx.save(); cx.globalCompositeOperation = 'lighter';
  for (const k of [1, .64, .34]) { cx.fillStyle = col + (a * (1.1 - k * .55)).toFixed(3) + ')'; cx.beginPath(); cx.ellipse(x, y, r * k, ground ? r * k * .3 : r * k, 0, 0, 7); cx.fill(); }
  cx.restore();
}
function drawLights() { // plasma, muzzle flashes, explosions and hazards cast light over the ground and ruins
  if (G.mz > 0) {
    const gp = P(G.px, 70), q = squadPos();
    lightPool(gp.x, gp.y, 150 * gp.s + 30, 'rgba(255,205,115,', .085 * G.mz, true);
    lightPool(q.x, q.y - 30, 70, 'rgba(255,200,110,', .06 * G.mz, false);
    lightPool(gp.x, gp.y - 70 * gp.s, 130 * gp.s + 20, 'rgba(255,195,105,', .05 * G.mz, false);
  }
  // (no halos round the squad's plasma or rail rounds either: the bars carry their own light)
  for (const r of G.rockets) { if (r.delay > 0) continue; const q = P(r.x, r.wz - G.dist); lightPool(q.x, q.y - 32 * q.s, 40 * q.s + 10, 'rgba(255,160,60,', .12, false); lightPool(q.x, q.y, 80 * q.s + 14, 'rgba(255,150,50,', .1, true); }
  for (const st of G.strikes) { const q = P(st.x, st.rz); if (st.fire) lightPool(q.x, q.y, 150 * q.s + 30, 'rgba(210,170,255,', .25 * (st.fire / .3), true); else lightPool(q.x, q.y, 70 * q.s + 14, 'rgba(255,60,40,', .08, true); }
  for (const pu of G.pups) { const q = P(pu.x, pu.wz - G.dist); lightPool(q.x, q.y, 70 * q.s + 14, 'rgba(110,230,255,', .14 + .05 * Math.sin(G.t * 4), true); }
  for (const l of G.lt) lightPool(l.x, l.y, l.r, l.col, .2 * (l.life / l.max), l.gr);
}

const EMB = []; for (let i = 0; i < 46; i++) EMB.push({ x: rnd(0, W), y: rnd(0, H), v: rnd(6, 22), r: Math.random() < .2 ? rnd(4, 8) : rnd(1, 2.4), p: rnd(0, 6), a: rnd(.25, .8) });
const DGS = { x: -60, y: 70, v: 6, wait: 4 };   // one distant gunship, rare
function drawEmbers() {
  for (const e of EMB) {
    e.y -= e.v / 60; e.x += Math.sin(T * .8 + e.p) * .25 - .1;
    if (e.y < -10) { e.y = H + 10; e.x = rnd(0, W); } if (e.x < -10) e.x = W + 10;
    cx.globalAlpha = e.r > 3.5 ? .12 : e.a * (.6 + .4 * Math.sin(T * 3 + e.p));
    cx.fillStyle = e.r > 3.5 ? '#ffd9a0' : '#ff8a3a'; cx.beginPath(); cx.arc(e.x, e.y, e.r, 0, 7); cx.fill();
  }
  cx.globalAlpha = 1;
}
function drawDistantGunship() {
  const g = DGS;
  if (g.wait > 0) { g.wait -= 1 / 60; return; }
  g.x += g.v / 60;
  if (g.x > W + 80) { g.wait = rnd(25, 50); g.x = -60; g.y = rnd(55, 95); return; }
  const by = g.y + Math.sin(T * .6) * 3;
  cx.fillStyle = 'rgba(190,225,255,.10)'; cx.beginPath(); cx.moveTo(g.x - 6, by + 8); cx.lineTo(g.x + 6, by + 8); cx.lineTo(g.x + 46, HOR + 20); cx.lineTo(g.x - 46, HOR + 20); cx.fill();
  cx.fillStyle = 'rgba(190,225,255,.18)'; cx.beginPath(); cx.ellipse(g.x, HOR + 20, 46, 6, 0, 0, 7); cx.fill();
  drawSpr('hk_aerial', g.x, by + 10, .11, { head: [0, -1], shadow: false, alpha: .85 });
}
function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t), g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t), bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `rgb(${r},${g},${bl})`;
}

function drawCity(layer, off, col, edge, win) {
  for (let rep = 0; rep < 2; rep++) for (const b of layer.b) {
    const x0 = b.x - off + rep * layer.w;
    if (x0 > W || x0 + b.w < 0) continue;
    // Building silhouette with subtle gradient depth
    cx.fillStyle = col;
    for (let i = 0; i < b.cols; i++) cx.fillRect(x0 + i * 5, HOR - b.hs[i], 5.4, b.hs[i] + 2);
    // Destroyed roof spires & antenna towers
    if (b.spire) {
      cx.fillStyle = col; cx.fillRect(x0 + b.w * .5 - 0.5, HOR - b.hs[b.cols >> 1] - b.spire, 2.8, b.spire);
      // Red aviation warning blinking light on top of tall spires
      if (b.spire > 18 && Math.sin(T * 4 + b.x) > 0.4) {
        cx.fillStyle = '#ff3322'; cx.fillRect(x0 + b.w * .5 - 1, HOR - b.hs[b.cols >> 1] - b.spire - 1, 3.8, 3.8);
      }
    }
    // High-contrast rim/edge highlight
    cx.fillStyle = edge; for (let i = 0; i < b.cols; i++) cx.fillRect(x0 + i * 5, HOR - b.hs[i], 5.4, 1.8);
    // Horizontal floor beams & exposed structural rebar grid
    cx.fillStyle = 'rgba(0,0,0,.38)'; for (let r = 14; r < b.h; r += 14) cx.fillRect(x0, HOR - r, b.w, 1.6);
    
    // Windows with warm fire flickering & cyan Skynet scanner lights
    if (win > 0) for (const l of b.lit) {
      const ci = Math.min(b.cols - 1, Math.floor(l[0] / 5));
      if (l[1] < b.hs[ci] - 4 && l[3] < win) {
        const flick = Math.sin(T * 8 + l[0] * 3) > -0.2;
        cx.fillStyle = l[2] ? (flick ? '#6ff3ff' : '#2b90a8') : (flick ? '#ff9a4a' : '#b8581e');
        cx.fillRect(x0 + l[0], HOR - l[1], 3.2, 3.2);
      }
    }
  }
  if (layer.ov && save.fx !== 'low') for (let rep = 0; rep < 2; rep++) cx.drawImage(layer.ov, -off + rep * layer.w, HOR - 280);   // grit, blown-out windows, rust runs
}

function heap(xc, z, hw, hh, seed, col) { // rubble berm along the edge of the cleared path
  const q = P(xc, z), w = hw * LANE * q.s, h = hh * q.s;
  cx.fillStyle = col || '#0f1620'; cx.beginPath(); cx.moveTo(q.x - w, q.y); cx.lineTo(q.x - w * .6, q.y - h * .55); cx.lineTo(q.x - w * .2, q.y - h * (.75 + hash(seed) * .25));
  cx.lineTo(q.x + w * .3, q.y - h * .6); cx.lineTo(q.x + w * .7, q.y - h * .42); cx.lineTo(q.x + w, q.y); cx.closePath(); cx.fill();
  cx.fillStyle = '#3f5270'; cx.fillRect(q.x - w * .45, q.y - h * .6, w * .5, Math.max(1.4, 2.6 * q.s));
  cx.fillStyle = '#1b2431'; cx.fillRect(q.x + w * .1, q.y - h * .45, w * .4, h * .2);
  cx.strokeStyle = '#5e4332'; cx.lineWidth = Math.max(1, 1.5 * q.s); line(q.x + w * .2, q.y - h * .6, q.x + w * .3, q.y - h * 1.15);
}

// ---------------------------------------------------------------- procedural textures: grit for the ground, road, skylines, clouds and the film
function mkCanvas(w, h) { // (null where there is no real canvas: headless tests)
  try { if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null; const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext && c.getContext('2d'); return x && typeof x.createImageData === 'function' ? c : null; } catch (e) { return null; }
}
const th = (x, y, sd) => { let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(sd | 0, 1442695041); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
function vnoise(x, y, per, sd) { // value noise on a lattice that wraps every `per` cells, so the texture tiles seamlessly
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), X = ((xi % per) + per) % per, X1 = (X + 1) % per, Y = ((yi % per) + per) % per, Y1 = (Y + 1) % per;
  return lerp(lerp(th(X, Y, sd), th(X1, Y, sd), u), lerp(th(X, Y1, sd), th(X1, Y1, sd), u), v);
}
function fbm(u, v, base, oct, sd) { let a = .5, sum = 0, nrm = 0, per = base; for (let o = 0; o < oct; o++) { sum += a * vnoise(u * per, v * per, per, sd + o * 17); nrm += a; a *= .5; per *= 2; } return sum / nrm; }
const TEXK = {   // dark / light thresholds and gains, light tint, speckle density, number of cracks and stains
  dirt:   { d0: .47, dg: 2.4, l0: .63, lg: 1.5, lc: [205, 208, 218], spk: .02, cracks: 6, stains: 5 },
  ash:    { d0: .49, dg: 1.7, l0: .57, lg: 1.9, lc: [228, 228, 232], spk: .035, cracks: 3, stains: 6 },
  sand:   { d0: .45, dg: 1.5, l0: .6, lg: 1.7, lc: [255, 228, 172], spk: .015, cracks: 1, stains: 2, ripple: true },
  scorch: { d0: .51, dg: 2.8, l0: .72, lg: 1.1, lc: [200, 120, 90], spk: .02, cracks: 10, stains: 4, glow: true },
  snow:   { d0: .4, dg: 1, l0: .5, lg: 2.4, lc: [255, 255, 255], dc: [70, 90, 125], spk: .025, cracks: 2, stains: 3 },
  wet:    { d0: .5, dg: 2.5, l0: .66, lg: 1.2, lc: [165, 205, 225], spk: .015, cracks: 4, stains: 4, streak: true },
  metal:  { d0: .48, dg: 2.1, l0: .62, lg: 1.3, lc: [215, 195, 175], spk: .02, cracks: 3, stains: 8, plates: true },
};
const TEXC = {};
function crackLine(x, y, sd, ctx, size, col, w, len) { // a jagged wandering fracture, drawn three times so it wraps around the tile
  let a = th(sd, 1, 7) * 6.28, px = x, py = y; const pts = [[px, py]];
  for (let i = 0; i < len; i++) { a += (th(sd, i, 9) - .5) * 1.1; px += Math.cos(a) * (3 + th(sd, i, 5) * 5); py += Math.sin(a) * (3 + th(sd, i, 5) * 5); pts.push([px, py]); }
  ctx.strokeStyle = col; ctx.lineWidth = w; for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0] + ox, p[1] + oy) : ctx.moveTo(p[0] + ox, p[1] + oy)); ctx.stroke(); }
}
function getTex(kind) { // a tileable grit overlay: dark pits, pale chips, speckle, cracks, stains. Transparent, so the ground's own colour shows through.
  if (kind in TEXC) return TEXC[kind];
  const size = kind === 'road' ? 256 : 256, c = mkCanvas(size, size); if (!c) return (TEXC[kind] = null);
  const x = c.getContext('2d'), id = x.createImageData(size, size); if (!id || !id.data) return (TEXC[kind] = null);
  const d = id.data, sd = kind.length * 101 + kind.charCodeAt(0) * 7, K = TEXK[kind] || TEXK.dirt;
  if (kind === 'road') { // cracked asphalt: fine grain, worn tyre tracks, patches
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      const u = px / size, v = py / size, n = fbm(u, v, 6, 4, sd), g = th(px, py, 3), tr = Math.max(0, 1 - Math.abs(u - .3) / .08) + Math.max(0, 1 - Math.abs(u - .7) / .08), wear = tr * (.4 + .6 * fbm(u * 3, v, 8, 3, 77));
      let r = 0, gg = 0, b = 0, a = 0;
      if (n < .46) { a = (.46 - n) * 2.2; } else if (n > .62) { r = gg = b = 200; a = (n - .62) * 1.2; }
      if (g < .025) { r = gg = b = g < .012 ? 20 : 190; a = .4; }
      if (wear > .05) { r = gg = b = 0; a = Math.max(a, wear * .5); }
      const i = (py * size + px) * 4; d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = Math.min(255, a * 255);
    }
  } else {
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      const u = px / size, v = py / size; let n = fbm(u, v, 5, 5, sd);
      if (K.ripple) n += Math.sin((v + fbm(u, v, 4, 2, sd + 5) * .25) * 60) * .06;
      if (K.streak) n = n * .5 + .5 * fbm(u * 6, v * .5 + .001, 8, 2, sd + 9);
      let r = 0, gg = 0, b = 0, a = 0;
      if (n < K.d0) { a = Math.min(.85, (K.d0 - n) * K.dg); if (K.dc) { r = K.dc[0]; gg = K.dc[1]; b = K.dc[2]; } }
      else if (n > K.l0) { a = Math.min(.7, (n - K.l0) * K.lg); r = K.lc[0]; gg = K.lc[1]; b = K.lc[2]; }
      const g = th(px, py, sd + 3); if (g < K.spk) { a = Math.max(a, .38); if (g < K.spk * .5) { r = K.lc[0]; gg = K.lc[1]; b = K.lc[2]; } else { r = gg = b = 0; } }
      const i = (py * size + px) * 4; d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = Math.min(255, a * 255);
    }
  }
  x.putImageData(id, 0, 0);
  x.lineCap = 'round';
  if (kind === 'road') {
    for (let i = 0; i < 5; i++) crackLine(th(i, 1, 21) * size, th(i, 2, 21) * size, i + 40, x, size, 'rgba(0,0,0,.45)', 1, 30 + i * 6);
    for (let i = 0; i < 4; i++) { const px = th(i, 3, 31) * size, py = th(i, 4, 31) * size, g = x.createRadialGradient(px, py, 2, px, py, 16 + th(i, 5, 31) * 14); g.addColorStop(0, 'rgba(0,0,0,.4)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(px - 40, py - 40, 80, 80); }
    for (let i = 0; i < 3; i++) { x.fillStyle = 'rgba(200,200,205,.07)'; x.fillRect(th(i, 7, 33) * size, th(i, 8, 33) * size, 30 + th(i, 9, 33) * 40, 20 + th(i, 10, 33) * 30); }
  } else {
    for (let i = 0; i < K.cracks; i++) { const ember = K.glow && i % 4 === 0; crackLine(th(i, 1, 51) * size, th(i, 2, 51) * size, i + sd, x, size, ember ? 'rgba(255,100,30,.42)' : 'rgba(0,0,0,.42)', 1, ember ? 14 + (i % 3) * 5 : 24 + (i % 5) * 7); }   // (scorched ground: a few short, dim ember cracks among the dark ones)
    for (let i = 0; i < K.stains; i++) { const px = th(i, 3, 61) * size, py = th(i, 4, 61) * size, r = 14 + th(i, 5, 61) * 28, g = x.createRadialGradient(px, py, 1, px, py, r); g.addColorStop(0, i % 3 ? 'rgba(0,0,0,.34)' : 'rgba(120,70,30,.22)'); g.addColorStop(1, 'rgba(0,0,0,0)'); for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) { x.save(); x.translate(ox, oy); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); x.restore(); } }
    if (K.plates) { x.strokeStyle = 'rgba(0,0,0,.55)'; x.lineWidth = 1.4; for (let i = 0; i <= size; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, size); x.moveTo(0, i); x.lineTo(size, i); x.stroke(); } x.fillStyle = 'rgba(215,195,175,.35)'; for (let i = 0; i < size; i += 64) for (let j = 0; j < size; j += 64) for (const [a, b] of [[6, 6], [58, 6], [6, 58], [58, 58]]) x.fillRect(i + a, j + b, 2, 2); }
  }
  return (TEXC[kind] = c);
}
const BIOMETEX = { wasteland: 'dirt', ash: 'ash', desert: 'sand', scorched: 'scorch', winter: 'snow', flooded: 'wet', industrial: 'metal' };
const TWG = 2.6, TZG = 300, TZR = 360;   // ground tile: 2.6 lane-widths across, 300 px deep; road tile 360 px deep
function drawFloor(dist, tp, B, L, wx) { // the textured ground, sliced row by row in perspective: grit on the dirt and a worn, cracked road down the middle
  const gt = getTex(BIOMETEX[L.biome] || 'dirt'), rt = getTex('road'); if (!gt) return;
  const lum = clamp(1 - tp.stars * .6 - (tp.vig - .3) * .25, .4, 1), base = .5 + .4 * lum, step = save.fx === 'low' ? 4 : 2, y0 = HOR + (PY - HOR) * .1;
  cx.imageSmoothingEnabled = false;
  for (let y = y0; y < H; y += step) {
    const s = (y - HOR) / (PY - HOR), z = (1 / s - 1) / K, a = clamp((s - .1) / .3, 0, 1) * base * clamp(1.5 - s * .5, .6, 1); if (a <= .01) continue;
    const vg = Math.floor((((dist + z) / TZG) % 1 + 1) % 1 * gt.height), tilePx = TWG * LANE * s;
    let frac = ((-W / 2 / (LANE * s) / TWG) % 1 + 1) % 1, sx = 0; cx.globalAlpha = a;
    for (let guard = 0; sx < W - .01 && guard < 40; guard++) { const take = Math.min(W - sx, (1 - frac) * tilePx); if (take > .01) cx.drawImage(gt, frac * gt.width, vg, Math.max(.5, take / tilePx * gt.width), 1, sx, y, take, step); sx += take; frac = 0; }
    if (rt) { const vr = Math.floor((((dist + z) / TZR) % 1 + 1) % 1 * rt.height); cx.globalAlpha = Math.min(1, a * 1.25); cx.drawImage(rt, 0, vr, rt.width, 1, W / 2 - LANE * s, y, 2 * LANE * s, step); }
  }
  if ((wx.rain || 0) > .05 || L.biome === 'flooded') { // wet ground: a pale sheen of sky
    const w = Math.max(wx.rain || 0, L.biome === 'flooded' ? .55 : 0), g = cx.createLinearGradient(0, HOR, 0, H); g.addColorStop(0, `rgba(${tp.haze},${.2 * w})`); g.addColorStop(.5, `rgba(${tp.haze},${.07 * w})`); g.addColorStop(1, `rgba(${tp.haze},0)`); cx.globalAlpha = 1; cx.fillStyle = g; cx.fillRect(0, HOR, W, H - HOR);
  }
  cx.globalAlpha = 1; cx.imageSmoothingEnabled = true;
}
function bakeOverlay(w, h, drawMask, details, grainSeed) { // texture for a silhouette: dark window panes, rust streaks, cracks and grit, clipped to the shape and drawn over its flat colour
  const c = mkCanvas(w, h); if (!c) return null; const x = c.getContext('2d');
  x.fillStyle = 'rgba(0,0,0,0.006)'; drawMask(x); x.globalCompositeOperation = 'source-atop'; details(x);
  const gr = getTex('dirt'); if (gr) { x.globalAlpha = .55; for (let ox = 0; ox < w; ox += gr.width) for (let oy = 0; oy < h; oy += gr.height) x.drawImage(gr, ox, oy); x.globalAlpha = 1; }
  return c;
}
function bakeCityOverlay(layer, OH) {
  return bakeOverlay(Math.ceil(layer.w), OH, x => { for (const b of layer.b) for (let i = 0; i < b.cols; i++) x.fillRect(b.x + i * 5, OH - b.hs[i], 5.4, b.hs[i] + 2); }, x => {
    for (const b of layer.b) {
      x.fillStyle = 'rgba(0,0,0,.34)'; for (let r = 14; r < b.h - 6; r += 9) for (let q = 3; q < b.w - 3; q += 7) { const ci = Math.min(b.cols - 1, Math.floor(q / 5)); if (r < b.hs[ci] - 5 && th(b.x + q, r, 5) < .7) x.fillRect(b.x + q, OH - r, 3.2, 3.2); }   // blown-out window panes
      x.fillStyle = 'rgba(0,0,0,.4)'; for (let r = 14; r < b.h; r += 14) x.fillRect(b.x, OH - r, b.w, 1.4);
      for (let k = 0; k < 3; k++) { const sx = b.x + th(b.x, k, 71) * b.w, top = OH - b.h * (.4 + th(k, b.x, 72) * .6); x.fillStyle = k ? 'rgba(90,50,30,.28)' : 'rgba(0,0,0,.3)'; x.fillRect(sx, top, 1.6 + th(k, 3, 73) * 2, 20 + th(b.x, k, 74) * 60); }   // rust and soot runs
      const g = x.createLinearGradient(0, OH - b.h, 0, OH); g.addColorStop(0, 'rgba(255,255,255,.07)'); g.addColorStop(1, 'rgba(0,0,0,.28)'); x.fillStyle = g; x.fillRect(b.x, OH - b.h, b.w, b.h);
    }
  });
}
function bakeRidgeOverlay(R, snow) {
  const OH = 200;
  return bakeOverlay(Math.ceil(R.w), OH, x => { x.beginPath(); x.moveTo(0, OH); for (const p of R.p) x.lineTo(p[0], OH - p[1]); x.lineTo(R.w, OH); x.closePath(); x.fill(); }, x => {
    x.strokeStyle = 'rgba(0,0,0,.28)'; x.lineWidth = 1.2; for (let k = 0; k < 9; k++) { x.beginPath(); for (let px = 0; px <= R.w; px += 14) { const yy = OH - 12 - k * 15 + Math.sin(px * .03 + k * 2) * 5 + (th(px, k, 9) - .5) * 4; px ? x.lineTo(px, yy) : x.moveTo(px, yy); } x.stroke(); }
    const g = x.createLinearGradient(0, 0, 0, OH); g.addColorStop(0, 'rgba(255,255,255,.1)'); g.addColorStop(1, 'rgba(0,0,0,.3)'); x.fillStyle = g; x.fillRect(0, 0, R.w, OH);
    if (snow) { x.fillStyle = 'rgba(240,246,255,.75)'; for (let i = 1; i < R.p.length - 1; i++) { const p = R.p[i]; if (p[1] > 70 && p[1] >= R.p[i - 1][1] && p[1] >= R.p[i + 1][1]) { x.beginPath(); x.moveTo(p[0], OH - p[1]); x.lineTo(p[0] - 14, OH - p[1] + 22); x.lineTo(p[0] + 14, OH - p[1] + 22); x.closePath(); x.fill(); } } }
  });
}
const CLOUDT = [];
function cloudTex(k, dark) { // a soft, lumpy cloud: fractal noise inside a squashed ellipse
  const key = k * 2 + (dark ? 1 : 0); if (key in CLOUDT) return CLOUDT[key];
  const w = 300, h = 80, c = mkCanvas(w, h); if (!c) return (CLOUDT[key] = null); const x = c.getContext('2d'), id = x.createImageData(w, h); if (!id || !id.data) return (CLOUDT[key] = null);
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const ex = (px / w - .5) * 2, ey = (py / h - .5) * 2, fall = 1 - (ex * ex + ey * ey * 1.6), n = fbm(px / w, py / h, 4, 4, k * 31 + 5), a = clamp((fall * 1.3 + (n - .5) * 1.5) , 0, 1) * (dark ? .6 : .5), i = (py * w + px) * 4;
    setPx(id.data, i, dark ? 0 : 255, dark ? 6 : 255, dark ? 14 : 255, a * 255 * (.6 + .4 * n));
  }
  x.putImageData(id, 0, 0); return (CLOUDT[key] = c);
}
function setPx(a, i, r, g, b, al) { a[i] = r; a[i + 1] = g; a[i + 2] = b; a[i + 3] = al; }
let GRAIN = null, GRAINP = null;
function resetTextures() { for (const k of Object.keys(TEXC)) delete TEXC[k]; CLOUDT.length = 0; GRAIN = null; GRAINP = null; }   // (tests swap the canvas implementation)
function grainTex() { if (GRAIN !== null) return GRAIN; const c = mkCanvas(160, 160); if (!c) return (GRAIN = false); const x = c.getContext('2d'), id = x.createImageData(160, 160); if (!id || !id.data) return (GRAIN = false); for (let i = 0; i < 160 * 160; i++) { const g = Math.random(), v = g < .5 ? 0 : 255, a = Math.abs(g - .5) * 2; setPx(id.data, i * 4, v, v, v, a * a * 90); } x.putImageData(id, 0, 0); try { GRAINP = cx.createPattern(c, 'repeat'); } catch (e) { GRAINP = null; } return (GRAIN = c); }

// ---------------------------------------------------------------- level looks: time of day, weather, biome and skyline differ from sector to sector
const mixC = (a, b, t) => { const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), f = sh => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t); return '#' + ((1 << 24) | (f(16) << 16) | (f(8) << 8) | f(0)).toString(16).slice(1); };
const lerp = (a, b, t) => a + (b - a) * t;
const TODS = {
  dawn:     { sky: ['#1b1634', '#8a4560', '#ffb070'], gnd: ['#5a4650', '#1c1519'], city: [['#3a3050', '#a06a78'], ['#2a2238', '#7a4e66'], ['#14101e', '#4a3048']], haze: [255, 170, 130], tint: [255, 150, 100, .10], stars: .05, win: .2, vig: .5, fires: .7, search: 0, glow: .3 },
  day:      { sky: ['#2d73b8', '#6aa9dc', '#d6e9f6'], gnd: ['#6d6454', '#2b2721'], city: [['#7d92a8', '#b8c9d8'], ['#5d7189', '#97aabd'], ['#3d4e63', '#6f8399']], haze: [215, 232, 246], tint: [255, 244, 214, .05], stars: 0, win: 0, vig: .25, fires: .3, search: 0, glow: 0 },
  dusk:     { sky: ['#150a26', '#7e2c50', '#ff8238'], gnd: ['#4d3a3a', '#190f12'], city: [['#2b1a30', '#8a4a58'], ['#1d1124', '#6a3448'], ['#0f0914', '#3c1e2e']], haze: [255, 130, 80], tint: [255, 110, 60, .10], stars: .15, win: .35, vig: .5, fires: .9, search: .5, glow: .5 },
  moon:     { sky: ['#030718', '#102650', '#3a6aa8'], gnd: ['#2a3a52', '#101a26'], city: [['#1b2e45', '#4a6f96'], ['#0f1c2d', '#2b4a68'], ['#070e19', '#1a2e44']], haze: [110, 160, 230], tint: [70, 120, 220, .09], stars: 1, win: .6, vig: .42, fires: 1, search: 1, glow: 1 },
  dark:     { sky: ['#010203', '#03060c', '#0b1220'], gnd: ['#161e2a', '#06090e'], city: [['#0b121b', '#1c2a3a'], ['#070b11', '#121c28'], ['#04070b', '#0b121a']], haze: [40, 70, 110], tint: [0, 10, 30, .20], stars: .3, win: .9, vig: .8, fires: 1.25, search: .6, glow: .3 },
  overcast: { sky: ['#262a30', '#454b54', '#7d858f'], gnd: ['#4a4d50', '#1a1c1e'], city: [['#3a4048', '#6a727c'], ['#2a3036', '#505860'], ['#161a1e', '#343a40']], haze: [150, 160, 170], tint: [150, 160, 170, .06], stars: 0, win: .12, vig: .4, fires: .6, search: 0, glow: 0 },
};
const BIOMES = {
  wasteland:  { gnd: null, chip: ['#79899f', '#0b1118', '#34445a', '#4a3a30'], scar: ['rgba(5,8,13,.55)', 'rgba(96,120,158,.3)'], heap: '#0f1620', puddle: .3, road: 'rgba(30,36,46,.45)' },
  ash:        { gnd: ['#4c4c50', '#18181b'], chip: ['#9a9aa2', '#26262a', '#5c5c64', '#44444a'], scar: ['rgba(10,10,12,.5)', 'rgba(150,150,160,.28)'], heap: '#1c1c20', puddle: .15, road: 'rgba(24,24,28,.5)' },
  desert:     { gnd: ['#9a7a4c', '#3e2c1a'], chip: ['#c8a870', '#5a4028', '#a08050', '#3a2a1c'], scar: ['rgba(40,24,10,.4)', 'rgba(220,190,130,.3)'], heap: '#4a3622', puddle: 0, road: 'rgba(70,52,34,.4)' },
  scorched:   { gnd: ['#5a2e24', '#190d0a'], chip: ['#8a4a38', '#1a0c0a', '#6a3a2c', '#30201a'], scar: ['rgba(12,4,3,.6)', 'rgba(150,80,60,.28)'], heap: '#2a1410', puddle: .1, road: 'rgba(36,18,14,.5)' },
  winter:     { gnd: ['#a8b4c2', '#505c6c'], chip: ['#f0f4fa', '#8a96a8', '#c8d2de', '#6a7686'], scar: ['rgba(60,70,90,.35)', 'rgba(240,246,255,.5)'], heap: '#6a7686', puddle: .2, road: 'rgba(80,90,106,.4)' },
  flooded:    { gnd: ['#264650', '#0c1a20'], chip: ['#5a8896', '#0a1418', '#34606c', '#1c3038'], scar: ['rgba(3,10,14,.55)', 'rgba(90,150,170,.3)'], heap: '#0c1a20', puddle: .85, road: 'rgba(14,30,38,.5)' },
  industrial: { gnd: ['#3c3632', '#141110'], chip: ['#8a7a6a', '#0e0c0a', '#4a4036', '#6a3a26'], scar: ['rgba(8,6,4,.6)', 'rgba(130,110,90,.3)'], heap: '#201a16', puddle: .25, road: 'rgba(28,24,22,.5)' },
};
const WXT = { clear: {}, fog: { fog: .85 }, rain: { rain: .75, fog: .2, wind: .3 }, storm: { rain: 1, storm: 1, wind: .7, fog: .1 }, wind: { wind: 1 }, dust: { dust: 1, wind: .85, fog: .3 }, ash: { ash: 1, fog: .25, wind: .2 } };
const WXK = ['fog', 'rain', 'storm', 'wind', 'dust', 'ash'];
const LOOKS = {};
function makeLook(lv) { // deterministic per sector: the same sector always looks the same, neighbouring sectors do not
  const h = k => hash(lv * 1000003 + k * 40503 + 99991), pick = (a, k) => a[Math.floor(h(k) * a.length) % a.length];
  let tod = lv === 1 ? 'moon' : pick(['dawn', 'day', 'dusk', 'moon', 'dark', 'overcast', 'day', 'moon', 'dusk', 'dark', 'overcast', 'dawn'], 1);
  const wxs = { dawn: ['clear', 'fog', 'wind', 'clear', 'rain', 'fog'], day: ['clear', 'clear', 'wind', 'dust', 'rain', 'storm', 'fog', 'dust', 'storm'], dusk: ['clear', 'wind', 'fog', 'storm', 'rain', 'storm', 'dust'], moon: ['clear', 'clear', 'fog', 'wind', 'rain', 'ash', 'storm'], dark: ['clear', 'rain', 'storm', 'fog', 'ash', 'storm'], overcast: ['rain', 'storm', 'storm', 'fog', 'ash', 'wind'] };
  let wA = lv === 1 ? 'clear' : pick(wxs[tod], 2), wB = h(3) < .55 ? pick(wxs[tod], 4) : wA;
  const env = ENVS[SECT[(lv - 1) % SECT.length]];
  if (env === 'dark') { tod = 'dark'; wA = 'clear'; wB = h(3) < .5 ? 'fog' : 'clear'; }
  else if (env === 'rain') { wA = 'wind'; wB = 'wind'; }   // (the radioactive rain of the Salt Flats is its own effect)
  else if (env === 'storm') { if (tod !== 'dusk' && tod !== 'dark') tod = 'dusk'; wA = 'wind'; wB = 'clear'; }
  return { lv, tod, from: tod === 'dawn' ? 'moon' : tod === 'dusk' ? 'day' : tod, wA, wB, sw: .3 + h(8) * .4, biome: lv === 1 ? 'wasteland' : pick(['wasteland', 'wasteland', 'ash', 'desert', 'scorched', 'winter', 'flooded', 'industrial'], 6), cityMode: lv === 1 ? 'city' : pick(['city', 'city', 'city', 'sparse', 'ridge', 'ridge'], 7), dens: .55 + h(12) * .9, sx: h(9), moonX: .12 + h(10) * .76, phase: h(11), env };
}
function lookFor(lv) { return LOOKS[lv] || (LOOKS[lv] = makeLook(lv)); }
function curLook() { return G && G.look ? G.look : lookFor(save.sel || 1); }
function todPal(look, frac) { // the palette right now: dawn brightens from moonlight, dusk darkens from daylight, the rest hold
  const A = TODS[look.from], B = TODS[look.tod], f = look.from === look.tod ? 1 : clamp(frac * 1.6, 0, 1);
  const m = (a, b) => mixC(a, b, f), n = (a, b) => lerp(a, b, f);
  return { sky: [m(A.sky[0], B.sky[0]), m(A.sky[1], B.sky[1]), m(A.sky[2], B.sky[2])], gnd: [m(A.gnd[0], B.gnd[0]), m(A.gnd[1], B.gnd[1])], city: [0, 1, 2].map(i => [m(A.city[i][0], B.city[i][0]), m(A.city[i][1], B.city[i][1])]),
    haze: A.haze.map((v, i) => Math.round(n(v, B.haze[i]))).join(','), tint: B.tint.map((v, i) => n(A.tint[i], v)), stars: n(A.stars, B.stars), win: n(A.win, B.win), vig: n(A.vig, B.vig), fires: n(A.fires, B.fires), search: n(A.search, B.search), glow: n(A.glow, B.glow), f };
}
function wxAt(look, frac) { // weather intensity 0..1 per kind, crossing from the first weather to the second part-way through the sector
  const a = WXT[look.wA], b = WXT[look.wB], t = clamp((frac - look.sw) / .12 + .5, 0, 1), out = {};
  for (const k of WXK) out[k] = lerp(a[k] || 0, b[k] || 0, t * t * (3 - 2 * t));
  return out;
}
function makeBolt() {
  const pts = [[rnd(40, W - 40), 0]]; let y = 0;
  while (y < HOR - 8) { y += rnd(8, 18); const p = pts[pts.length - 1]; pts.push([p[0] + rnd(-16, 16), Math.min(HOR - 6, y)]); }
  const br = []; for (let i = 0; i < 2; i++) { const k = rint(2, Math.max(2, pts.length - 3)), bp = [pts[k]]; let by = pts[k][1]; for (let j = 0; j < 4; j++) { by += rnd(6, 14); const p = bp[bp.length - 1]; bp.push([p[0] + rnd(-20, 20), Math.min(HOR - 4, by)]); } br.push(bp); }
  G.bolt = { t: .5, max: .5, pts, br }; G.thunder = rnd(.25, 1.7);
}
function weatherStep(dt) {
  const L = G.look; if (!L) return; const frac = clamp(G.dist / Math.max(1, G.L), 0, 1);
  G.tp = todPal(L, frac); G.wx = wxAt(L, frac);
  if (G.wx.storm > .35 && !G.over) { G.ltCd = (G.ltCd === undefined ? rnd(2, 6) : G.ltCd) - dt; if (G.ltCd <= 0) { G.ltCd = rnd(3.5, 12) / Math.max(.5, G.wx.storm); makeBolt(); } }
  if (G.bolt) { G.bolt.t -= dt; if (G.bolt.t <= 0) G.bolt = null; }
  if (G.thunder > 0) { G.thunder -= dt; if (G.thunder <= 0) { sfx.thunder(); G.shake = Math.max(G.shake, 3); } }
  const wv = G.wx.wind * 9 * dt; if (wv > 0) for (const p of G.parts) if (!p.st && !p.fl) p.x += wv;   // smoke and dust lean downwind
}
function drawBolt(b) {
  const a = clamp(b.t / b.max, 0, 1), ft = 1 - a, fl = ft < .12 ? 1 : ft < .2 ? .2 : ft < .3 ? .85 : ft < .6 ? .35 * (1 - (ft - .3) / .3) : 0;
  if (fl <= 0) return;
  cx.save(); cx.lineCap = 'round'; cx.lineJoin = 'round';
  for (const [pts, w] of [[b.pts, 1], ...b.br.map(p => [p, .55])]) for (const [lw, col] of [[7 * w, `rgba(150,170,255,${.35 * fl})`], [2.4 * w, `rgba(245,248,255,${fl})`]]) { cx.strokeStyle = col; cx.lineWidth = lw; cx.beginPath(); pts.forEach((p, i) => i ? cx.lineTo(p[0], p[1]) : cx.moveTo(p[0], p[1])); cx.stroke(); }
  cx.restore();
}
function drawSun(look, tp, frac) { // sun disc and glow (behind the skyline, so a low sun is cut by the roofs)
  if (look.tod === 'moon' || look.tod === 'dark') return;
  const hgt = look.tod === 'dawn' ? -.04 + .24 * tp.f : look.tod === 'dusk' ? .5 - .46 * tp.f : look.tod === 'overcast' ? .38 : .62;
  const x = W * (.18 + .64 * look.sx) - frac * 30, y = HOR - 4 - hgt * (HOR - 38), r = look.tod === 'dusk' ? 30 + 12 * tp.f : look.tod === 'dawn' ? 28 : 24, ov = look.tod === 'overcast' ? .35 : 1;
  const g = cx.createRadialGradient(x, y, r * .4, x, y, r * 6); g.addColorStop(0, `rgba(${look.tod === 'day' ? '255,246,215' : look.tod === 'overcast' ? '230,230,225' : '255,170,100'},${.5 * ov})`); g.addColorStop(1, 'rgba(255,200,140,0)');
  cx.fillStyle = g; cx.fillRect(0, 0, W, HOR + 40);
  cx.fillStyle = look.tod === 'day' ? 'rgba(255,252,235,.97)' : look.tod === 'overcast' ? 'rgba(240,240,235,.5)' : 'rgba(255,196,120,.97)'; cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.fill();
}
function drawMoon(look, tp, frac) {
  const show = look.tod === 'moon' ? 1 : look.tod === 'dawn' ? 1 - tp.f : 0; if (show <= .02) return;
  const x = W * look.moonX - frac * 14, y = 52 + 30 * (1 - look.sx), r = 24;
  const g = cx.createRadialGradient(x, y, r * .5, x, y, r * 7); g.addColorStop(0, `rgba(190,215,255,${.38 * show})`); g.addColorStop(1, 'rgba(120,160,230,0)'); cx.fillStyle = g; cx.fillRect(0, 0, W, HOR + 40);
  cx.save(); cx.globalAlpha = show; cx.fillStyle = '#e9eff8'; cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.fill();
  cx.fillStyle = 'rgba(150,165,190,.45)'; for (const [dx, dy, rr] of [[-7, -5, 5], [6, 4, 7], [-3, 9, 3.4], [9, -9, 3]]) { cx.beginPath(); cx.arc(x + dx, y + dy, rr, 0, 7); cx.fill(); }
  const sh = look.phase;   // a bite out of the disc for a waning moon
  if (sh > .35) { cx.fillStyle = TODS.moon.sky[1]; cx.beginPath(); cx.arc(x + r * (.4 + (sh - .35) * 1.2), y, r * .94, 0, 7); cx.fill(); }
  cx.restore();
}
function drawStars(look, tp, wx) {
  const k = tp.stars * (1 - clamp((wx.storm || 0) + (wx.fog || 0) * .9 + (wx.rain || 0) * .5 + (wx.ash || 0) + (wx.dust || 0), 0, 1)); if (k < .04) return;
  for (let i = 0; i < 90; i++) { const sx = hash(look.lv * 31 + i) * W, sy = hash(look.lv * 53 + i * 3) * (HOR - 30), tw = .55 + .45 * Math.sin(T * (1 + hash(i) * 2) + i); cx.fillStyle = `rgba(235,242,255,${k * tw * (.4 + hash(i * 7) * .6)})`; const sz = hash(i * 11) < .12 ? 2 : 1; cx.fillRect(sx, sy, sz, sz); }
}
function drawClouds(look, tp, wx) {
  const grey = clamp((wx.storm || 0) * .9 + (wx.rain || 0) * .4 + (wx.ash || 0) * .5, 0, 1), n = Math.round(5 + 9 * grey + (look.tod === 'overcast' ? 5 : 0)), sp = 1.8 + (wx.wind || 0) * 9, night = tp.stars > .25 || look.tod === 'dark';
  for (let i = 0; i < n; i++) {
    const xx = ((i * 185 + T * (sp + i * .5)) % (W + 360)) - 180, yy = 16 + (i * 47) % 130, big = 145 + (i % 3) * 45 + grey * 40, hgt = 15 + (i % 2) * 10 + grey * 8, dark = night || grey > .5 || i % 2 === 0 && look.tod !== 'day';
    const sprite = save.fx !== 'low' && cloudTex(i % 3, dark);
    if (sprite) { cx.globalAlpha = dark ? clamp(.55 + .35 * grey + .1 * tp.stars, 0, 1) : clamp(.5 + .3 * (1 - tp.stars), 0, 1); cx.drawImage(sprite, xx - big, yy - hgt * 1.6, big * 2, hgt * 3.2); cx.globalAlpha = 1; if (!dark) { cx.fillStyle = `rgba(${tp.haze},.05)`; cx.beginPath(); cx.ellipse(xx, yy, big * .9, hgt * .6, 0, 0, 7); cx.fill(); } continue; }
    cx.fillStyle = i % 2 ? `rgba(${tp.haze},${.10 + .22 * (1 - tp.stars) * (1 - grey)})` : `rgba(8,14,24,${.18 + .25 * grey + .1 * tp.stars})`;
    cx.beginPath(); cx.ellipse(xx, yy, big, hgt, 0, 0, 7); cx.fill();
  }
}
function drawRidge(col, edge, off) {
  const R = RIDGE; cx.fillStyle = col; cx.beginPath(); cx.moveTo(-10, HOR + 4);
  for (let rep = 0; rep < 2; rep++) for (const p of R.p) { const x = p[0] - off + rep * R.w; if (x > -40 && x < W + 40) cx.lineTo(x, HOR - p[1]); }
  cx.lineTo(W + 10, HOR + 4); cx.closePath(); cx.fill(); cx.strokeStyle = edge; cx.lineWidth = 1.2; cx.stroke();
  if (R.ov && save.fx !== 'low') for (let rep = 0; rep < 2; rep++) cx.drawImage(R.ov, -off + rep * R.w, HOR - 200);   // rock strata and snow
}
function drawWeather() { // in front of the world: fog, rain, ash, dust, wind-blown debris, and the flash of lightning
  const L = curLook(), wx = (G && G.wx) || wxAt(L, .3), tp = (G && G.tp) || todPal(L, .3), gust = .75 + .25 * Math.sin(T * .35);
  if ((wx.fog || 0) > .02) { // low, drifting fog: thickest at the horizon, thinning toward the camera
    const f = wx.fog, g = cx.createLinearGradient(0, HOR - 70, 0, H); g.addColorStop(0, `rgba(${tp.haze},${.78 * f})`); g.addColorStop(.3, `rgba(${tp.haze},${.55 * f})`); g.addColorStop(1, `rgba(${tp.haze},${.1 * f})`); cx.fillStyle = g; cx.fillRect(0, HOR - 70, W, H - HOR + 70);
    for (let i = 0; i < 4; i++) { const fx = ((T * (6 + i * 4) + i * 130) % (W + 300)) - 150; cx.fillStyle = `rgba(${tp.haze},${.12 * f})`; cx.beginPath(); cx.ellipse(fx, HOR + 40 + i * 70, 190, 30 + i * 8, 0, 0, 7); cx.fill(); }
  }
  if ((wx.dust || 0) > .02) { cx.fillStyle = `rgba(190,150,90,${.2 * wx.dust})`; cx.fillRect(0, 0, W, H); }
  const slant = .12 + (wx.wind || 0) * gust * .55;
  if ((wx.rain || 0) > .02) {
    const n = Math.round(130 * wx.rain), ln = 16 + 10 * wx.rain; cx.strokeStyle = `rgba(190,215,240,${.28 + .22 * wx.rain})`; cx.lineWidth = 1; cx.beginPath();
    for (let i = 0; i < n; i++) { const sp = 520 + hash(i * 5) * 380, x = ((hash(i) * (W + 120) + T * 40 * slant * 10) % (W + 120)) - 40 + 0, y = (hash(i + 3) * H + T * sp) % H; cx.moveTo(x, y); cx.lineTo(x - slant * ln, y + ln); }
    cx.stroke();
  }
  if ((wx.ash || 0) > .02) { for (let i = 0; i < 70 * wx.ash; i++) { const x = ((hash(i) * W + Math.sin(T * .5 + i) * 18 + T * 24 * slant * 4) % W + W) % W, y = (hash(i + 9) * H + T * (22 + hash(i * 3) * 24)) % H; cx.fillStyle = `rgba(${i % 3 ? '170,170,176' : '70,70,76'},${.5 * wx.ash})`; cx.fillRect(x, y, 1.6 + hash(i * 7) * 1.8, 1.6 + hash(i * 7) * 1.8); } }
  if ((wx.wind || 0) > .25) { // wind: long dust streaks and tumbling debris, all going the same way
    const k = (wx.wind - .25) / .75 * gust; cx.strokeStyle = `rgba(${tp.haze},${.16 * k})`; cx.lineWidth = 1; cx.beginPath();
    for (let i = 0; i < 26 * k + 4; i++) { const y = hash(i * 13) * H, x = ((hash(i) * (W + 240) + T * (240 + hash(i * 3) * 200) * k) % (W + 240)) - 120, ln = 40 + hash(i * 5) * 70; cx.moveTo(x, y); cx.lineTo(x + ln, y + Math.sin(T + i) * 3); }
    cx.stroke();
    for (let i = 0; i < 9 * k; i++) { const x = ((hash(i * 17) * (W + 100) + T * (180 + hash(i) * 120) * k) % (W + 100)) - 50, y = HOR + 40 + hash(i * 19) * (H - HOR - 60) + Math.sin(T * 3 + i) * 6; cx.fillStyle = 'rgba(60,56,50,.55)'; cx.save(); cx.translate(x, y); cx.rotate(T * 4 + i); cx.fillRect(-2, -1, 5, 2); cx.restore(); }
  }
  if (G && G.bolt) { const b = G.bolt, ft = 1 - b.t / b.max, fl = ft < .12 ? 1 : ft < .2 ? .2 : ft < .3 ? .85 : ft < .6 ? .35 * (1 - (ft - .3) / .3) : 0; if (fl > 0) { cx.fillStyle = `rgba(215,228,255,${.32 * fl})`; cx.fillRect(0, 0, W, H); } }
}

function drawBG(dist, pal) {
  const quad = (xa, xb, z0, z1, col) => {
    const a = P(xa, z0), b = P(xb, z0), c = P(xb, z1), d = P(xa, z1);
    cx.fillStyle = col; cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y); cx.lineTo(c.x, c.y); cx.lineTo(d.x, d.y); cx.closePath(); cx.fill();
  };
  const L = curLook(), frac = G ? clamp(dist / Math.max(1, G.L), 0, 1) : .3, tp = (G && G.tp) || todPal(L, frac), wx = (G && G.wx) || wxAt(L, frac), B = BIOMES[L.biome] || BIOMES.wasteland;
  const grey = clamp((wx.storm || 0) * .75 + (wx.rain || 0) * .3 + (wx.ash || 0) * .45 + (wx.fog || 0) * .3, 0, .8), dustK = (wx.dust || 0) * .6;
  const sk = tp.sky.map(c => { let r = mixC(c, '#3a4048', grey); if (dustK > 0) r = mixC(r, '#a88a5a', dustK); return r; });
  const SK = HOR + 40, STEPS = 20, sh = SK / STEPS;
  for (let i = 0; i < STEPS; i++) {
    const t = i / (STEPS - 1), seg = t < .6 ? [sk[0], sk[1], t / .6] : [sk[1], sk[2], (t - .6) / .4];
    cx.fillStyle = mixHex(seg[0], seg[1], seg[2]); cx.fillRect(0, i * sh, W, sh + 1);
  }
  drawStars(L, tp, wx); drawSun(L, tp, frac); drawMoon(L, tp, frac); drawClouds(L, tp, wx);
  if (tp.glow > .05) { // the glare of the burning cities on the horizon
    const mg = cx.createRadialGradient(W * .64, HOR - 30, 4, W * .64, HOR - 30, 140);
    mg.addColorStop(0, `rgba(210,240,255,${.6 * tp.glow})`); mg.addColorStop(.25, `rgba(110,180,245,${.25 * tp.glow})`); mg.addColorStop(1, 'rgba(40,90,160,0)');
    cx.fillStyle = mg; cx.fillRect(0, 0, W, HOR + 40);
  }
  if (tp.search > .05) for (const bm of [{ x: 75, p: 0 }, { x: 260, p: 1.4 }, { x: 410, p: 2.8 }]) {
    const sx = bm.x + Math.sin(T * .4 + bm.p) * 85;
    cx.fillStyle = `rgba(160,215,255,${.08 * tp.search})`; cx.beginPath(); cx.moveTo(bm.x - 3, HOR); cx.lineTo(bm.x + 3, HOR); cx.lineTo(sx + 32, 0); cx.lineTo(sx - 32, 0); cx.fill();
  }
  if (G && G.bolt) drawBolt(G.bolt);
  if (tp.stars > .25 || L.tod === 'dusk') drawDistantGunship();
  // horizon: mountains, a dense ruined city, or both
  if (L.cityMode === 'ridge') { drawRidge(tp.city[0][0], tp.city[0][1], (dist * .015) % RIDGE.w); drawRidge(tp.city[1][0], tp.city[1][1], (dist * .03) % RIDGE.w); }
  else drawCity(CITY[0], (dist * .02) % CITY[0].w, tp.city[0][0], tp.city[0][1], 0);
  const hz0 = cx.createLinearGradient(0, HOR - 120, 0, HOR); hz0.addColorStop(0, `rgba(${tp.haze},0)`); hz0.addColorStop(1, `rgba(${tp.haze},${.18 + .14 * Math.max(tp.glow, .3)})`);
  cx.fillStyle = hz0; cx.fillRect(0, HOR - 120, W, 120);
  drawCity(CITY[1], (dist * .04) % CITY[1].w, tp.city[1][0], tp.city[1][1], tp.win);
  // burning skyline fires & smoke vents
  for (const f of [{ x: 60, s: 0, k: .5 }, { x: 150, s: 1.7, k: .7 }, { x: 250, s: 3.1, k: .45 }, { x: 330, s: 2.3, k: .8 }, { x: 410, s: 4.4, k: .55 }, { x: 520, s: 5.9, k: .65 }]) {
    const fx = ((f.x - dist * .04) % (W * 2) + W * 2) % (W * 2) - 40;
    if (fx < -60 || fx > W + 60 || f.k * tp.fires < .24 + .1 * hash(f.s * 7 + L.lv)) continue;
    smokeVent(fx, HOR - 6, f.k * 1.1, .4, f.s * 13.7, T); fireVent(fx, HOR - 2, f.k, .55, f.s * 13.7, Math.floor(f.s), T);
  }
  { const fl = Math.max(0, Math.sin(T * .53) * Math.sin(T * 1.7 + 1) - .72) * 3.2 * Math.min(1, tp.fires);
    if (fl > 0) { const g2 = cx.createLinearGradient(0, HOR - 90, 0, HOR); g2.addColorStop(0, 'rgba(255,120,40,0)'); g2.addColorStop(1, `rgba(255,140,60,${Math.min(.35, fl * .3)})`); cx.fillStyle = g2; cx.fillRect(0, HOR - 90, W, 90); } }
  if (L.cityMode !== 'sparse' || L.dens > 1) drawCity(CITY[2], (dist * .07) % CITY[2].w, tp.city[2][0], tp.city[2][1], tp.win);
  // ground: this sector's terrain with a broken highway and a cleared lane
  const gc = B.gnd ? [mixC(tp.gnd[0], B.gnd[0], .6), mixC(tp.gnd[1], B.gnd[1], .6)] : tp.gnd;
  const gg = cx.createLinearGradient(0, HOR, 0, H);
  gg.addColorStop(0, gc[0]); gg.addColorStop(1, gc[1]);
  cx.fillStyle = gg; cx.fillRect(0, HOR, W, H - HOR);
  quad(-1, 1, -150, 3200, B.road);                                          // asphalt road base
  quad(-0.95, 0.95, -150, 3200, 'rgba(120,150,195,.06)');                                    // trampled, cleared path center
  drawFloor(dist, tp, B, L, wx);

  const BS = 50, base = Math.floor(dist / BS) - 2;
  for (let k = 0; k < 42; k++) {
    const idx = base + k, z0 = idx * BS - dist;
    // Cracked highway center line dash marks
    if (idx % 2 === 0) {
      const qDash1 = P(-0.02, z0), qDash2 = P(0.02, z0 + BS * 0.55);
      cx.fillStyle = 'rgba(210,180,90,.38)';
      cx.beginPath(); cx.moveTo(qDash1.x, qDash1.y); cx.lineTo(qDash2.x, qDash2.y);
      cx.lineTo(qDash2.x + Math.max(1, 3.5 * qDash2.s), qDash2.y);
      cx.lineTo(qDash1.x + Math.max(1, 4.5 * qDash1.s), qDash1.y); cx.closePath(); cx.fill();
    }
    for (let j = 0; j < 7; j++) { // jagged soot scars and slab fragments
      const hx = hash(idx * 31 + j * 5 + 2), hz = hash(idx * 31 + j * 5 + 3), hs = hash(idx * 31 + j * 5 + 4);
      const pq = P(hx * 7 - 3.5, z0 + hz * BS), wd = (.08 + hs * .3) * LANE * pq.s, hh = wd * (.16 + hs * .12), dark = hs < .55;
      cx.fillStyle = dark ? B.scar[0] : B.scar[1];
      cx.beginPath(); cx.moveTo(pq.x - wd, pq.y);
      for (let v = 1; v < 7; v++) { const an = Math.PI + v * Math.PI / 6.5, rr = .55 + hash(idx * 71 + j * 13 + v) * .6; cx.lineTo(pq.x + Math.cos(an) * wd * rr * -1, pq.y + Math.sin(an) * hh * rr * -1); }
      cx.lineTo(pq.x + wd, pq.y); cx.closePath(); cx.fill();
      if (!dark) { cx.fillStyle = 'rgba(190,210,240,.35)'; cx.fillRect(pq.x - wd * .5, pq.y - hh * .6, wd * .7, Math.max(1, hh * .18)); }
    }
    for (let j = 0; j < (save.fx === 'low' ? 4 : 10); j++) { // debris chips across the ground
      const hx = hash(idx * 91 + j * 3 + 11), hz = hash(idx * 91 + j * 3 + 12), pq = P(hx * 8 - 4, z0 + hz * BS), sz = Math.max(1, (1.5 + hash(idx * 7 + j) * 3) * pq.s);
      cx.fillStyle = B.chip[j % 4]; cx.fillRect(pq.x, pq.y, sz * 1.8, sz);
    }
    for (let j = 0; j < (save.fx === 'low' ? 4 : 12); j++) { // pebbles and shards on the path
      const hx = hash(idx * 53 + j * 3 + 7), hz = hash(idx * 53 + j * 3 + 8), pq = P(hx * 1.9 - .95, z0 + hz * BS), sz = Math.max(1, 2.2 * pq.s);
      cx.fillStyle = j % 3 ? '#0e141c' : '#6a7c96'; cx.fillRect(pq.x, pq.y, sz * 1.6, sz);
    }
    for (let j = 0; j < 2; j++) { // fissures in the ground: some glow with embers from below
      if (hash(idx * 17 + j * 5 + 1) < .35) continue;
      const hx = hash(idx * 23 + j * 7 + 2) * 6 - 3, hz = hash(idx * 23 + j * 7 + 3) * BS, glow2 = hash(idx * 29 + j) < .3;
      cx.beginPath(); for (let v = 0; v < 6; v++) { const pq = P(hx + v * .12 * (j ? -1 : 1) + (hash(idx * 31 + v + j) - .5) * .06, z0 + hz + v * 5 + (hash(idx * 37 + v) - .5) * 5); if (!v) cx.moveTo(pq.x, pq.y); else cx.lineTo(pq.x, pq.y); }
      cx.strokeStyle = 'rgba(2,4,8,.7)'; cx.lineWidth = Math.max(1, 3 * P(hx, z0 + hz).s); cx.stroke();
      if (glow2) { cx.strokeStyle = `rgba(255,${100 + 50 * Math.sin(T * 3 + idx)},30,${.35 + .2 * Math.sin(T * 2 + idx + j)})`; cx.lineWidth = Math.max(.8, 1.3 * P(hx, z0 + idx).s); cx.stroke(); }
    }
    if (hash(idx * 41 + 3) < B.puddle) { // a standing puddle holding a little of the sky
      const hx = hash(idx * 43 + 1) * 5 - 2.5, hz = hash(idx * 43 + 2) * BS, pq = P(hx, z0 + hz), pw = (.14 + hash(idx * 43 + 3) * .2) * LANE * pq.s;
      cx.fillStyle = 'rgba(30,60,100,.5)'; cx.beginPath(); cx.ellipse(pq.x, pq.y, pw, pw * .2, 0, 0, 7); cx.fill(); cx.fillStyle = 'rgba(150,190,240,.28)'; cx.fillRect(pq.x - pw * .5, pq.y - pw * .06, pw * .8, Math.max(1, pw * .05));
    }
    for (const sd of [-1, 1]) heap(sd * (1.08 + hash(idx * 7 + (sd > 0 ? 1 : 2)) * .1), z0 + hash(idx * 9 + 3) * BS, .24 + hash(idx * 13 + sd) * .14, 24 + hash(idx * 19 + sd) * 30, idx * 5 + sd, B.heap);
  }
  
  // horizon haze and low mist, in the colour of this time of day
  const fog = cx.createLinearGradient(0, HOR, 0, HOR + 130);
  fog.addColorStop(0, `rgba(${tp.haze},${.18 + .2 * Math.max(tp.glow, .3)})`); fog.addColorStop(0.5, `rgba(${tp.haze},.12)`); fog.addColorStop(1, `rgba(${tp.haze},0)`);
  cx.fillStyle = fog; cx.fillRect(0, HOR, W, 130);
  for (let fIdx = 0; fIdx < 3; fIdx++) {
    const fx = ((T * (12 + fIdx * 8) + fIdx * 160) % (W + 200)) - 100, fy = HOR + 15 + fIdx * 25;
    cx.fillStyle = `rgba(${tp.haze},${0.05 + fIdx * 0.02})`; cx.beginPath(); cx.ellipse(fx, fy, 140 + fIdx * 30, 18 + fIdx * 6, 0, 0, 7); cx.fill();
  }
}

function drawGrade() {
  drawEmbers(); // the grade of this time of day: haze band, tint, vignette
  cx.setTransform(RS, 0, 0, RS, 0, 0);
  const L = curLook(), tp = (G && G.tp) || todPal(L, .3), tn = tp.tint;
  const hz = cx.createLinearGradient(0, HOR - 70, 0, HOR + 90);
  hz.addColorStop(0, `rgba(${tp.haze},0)`); hz.addColorStop(.45, `rgba(${tp.haze},.18)`); hz.addColorStop(1, `rgba(${tp.haze},0)`);
  cx.fillStyle = hz; cx.fillRect(0, HOR - 70, W, 160);
  cx.fillStyle = `rgba(${Math.round(tn[0])},${Math.round(tn[1])},${Math.round(tn[2])},${tn[3].toFixed(3)})`; cx.fillRect(0, 0, W, H);
  const v = cx.createRadialGradient(W / 2, H * .55, H * .3, W / 2, H * .55, H * .75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,4,12,${tp.vig.toFixed(3)})`);
  cx.fillStyle = v; cx.fillRect(0, 0, W, H);
  if (save.fx !== 'low' && grainTex() && GRAINP) { const ox = Math.floor(Math.random() * 160), oy = Math.floor(Math.random() * 160); cx.save(); cx.translate(-ox, -oy); cx.fillStyle = GRAINP; cx.globalAlpha = .38; cx.fillRect(0, 0, W + 160, H + 160); cx.restore(); }   // film grain
}

// camera zoom: the world is drawn magnified about the squad's feet so everything is larger on a phone (the HUD stays put). Wide 1.0 / Close 1.15 / Closer 1.3
const ZOOMS = [1, 1.15, 1.3], ZNAMES = ['Wide', 'Close', 'Closer'];
function zoomLevel() { if (save.zoom !== undefined) return save.zoom; return (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) ? 1 : 0; }   // phones start on Close
function camZ() { return ZOOMS[clamp(zoomLevel(), 0, 2)]; }
const depthKey = e => (e.wz - G.dist) - (ET[e.t].fly ? 45 : 0);   // a hovering machine is drawn over ground units standing at about its depth (it is above them, and its sprite reaches over their heads)
function render() {
  if (typeof cx.reset === 'function') { SAVED = 0; cx.reset(); }   // a clean canvas state every frame, whatever happened in the last one
  cx.setTransform(RS, 0, 0, RS, 0, 0); cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over'; cx.shadowBlur = 0;
  cx.clearRect(0, 0, W, H);
  const pal = PAL[((G ? G.lv : save.sel) - 1) % PAL.length];
  cx.save();
  const Z = camZ(); if (Z !== 1) { cx.translate(W / 2, PY); cx.scale(Z, Z); cx.translate(-W / 2, -PY); }
  if (G && G.shake > 0) cx.translate(rnd(-G.shake, G.shake), rnd(-G.shake, G.shake));
  drawBG(G ? G.dist : bgDist, pal);
  if (!G) { cx.restore(); drawGrade(); return; }

  const items = [];
  for (const d of decor) { const z = d.wz - G.dist; if (z < 1500) items.push({ z, f: () => drawDecor(d) }); }
  for (const g of G.gates) { const z = g.wz - G.dist; if (!g.used && z < 1500 && z > -30) items.push({ z, f: () => drawGate(g) }); }
  for (const e of G.en) { const z = e.wz - G.dist; if (z < 1500 && z > -120 && !e.dead) items.push({ z: depthKey(e), f: () => drawEnemy(e) }); }
  for (const Dh of G.deaths) items.push({ z: Dh.e.wz - G.dist, f: () => drawBossDeath(Dh) });
  for (const o of G.obs) { const z = o.wz - G.dist; if (z < 1500 && z > -90) items.push({ z: o.k === 'overpass' ? z + 40 : z, f: () => drawObs(o) }); }   // (behind the squad the projection flips sign: never draw there) }
  for (const w of G.waves) items.push({ z: 1e6, f: () => drawEmpWave(w) });
  for (const n of G.nukes) items.push({ z: n.wz - G.dist, f: () => drawNuke(n) });
  for (const u of G.uplinks) items.push({ z: u.wz - G.dist, f: () => drawUplink(u) });
  if (G.beam) items.push({ z: 1e6, f: () => drawBeam(G.beam) });
  for (const f of G.fallout) { const z = f.wz - G.dist; if (z < 1500 && z > -100) items.push({ z: z + 1, f: () => drawFallout(f) }); }
  for (const f of G.flares) { const z = f.wz - G.dist; if (z < 1500 && z > -100) items.push({ z, f: () => drawFlare(f) }); }
  for (const c of G.c4) if (!c.dead) items.push({ z: c.e.wz - G.dist - 1, f: () => drawC4(c) });
  for (const h of G.haz) { const z = h.wz - G.dist; if (z < 1500 && z > -140) items.push({ z: z + 1, f: () => drawHaz(h) }); }
  for (const c of G.scr) { const z = c.wz - G.dist; if (z < 1200 && z > -20) items.push({ z, f: () => drawScrapChunk(c) }); }
  for (const pu of G.pups) { const z = pu.wz - G.dist; if (z < 1500 && z > -30) items.push({ z, f: () => drawPowerup(pu) }); }
  for (const r of G.rockets) items.push({ z: r.wz - G.dist, f: () => drawRocket(r) });
  for (const st of G.strikes) items.push({ z: st.rz, f: () => drawStrike(st) });
  for (const b of G.bolts) items.push({ z: b.rz, f: () => {
    const hf = b.rz / b.rz0, h = 28 + (b.h0 - 28) * hf, trz = Math.min(b.rz + (b.big ? 70 : 40), b.rz0), th = 28 + (b.h0 - 28) * (trz / b.rz0);
    const q = P(b.x, b.rz), t = P(b.x - b.vx * ((trz - b.rz) / 170), trz);
    const tx = t.x, ty = t.y - th * t.s, hx = q.x, hy = q.y - h * q.s, w = (b.big ? 8 : b.mg ? 2.6 : 4.6) * q.s + .8;
    cx.save(); cx.globalCompositeOperation = 'lighter';
    streak(tx, ty, hx, hy, w * 1.9, b.mg ? '255,130,30' : '150,90,255', .5);   // soft halo
    streak(tx, ty, hx, hy, w * .62, b.mg ? '255,236,170' : '232,214,255', .98);        // hot core
    cx.restore(); } });
  if (G.guard && !G.guard.dead) items.push({ z: GZ, f: () => {
    const q = P(G.gx, GZ + (G.adv || 0)), ss = q.s * 1.35, fr = G.guard.hp / G.guard.max;
    const upv = drawSpr('t800_reprogrammed', q.x, q.y, ss, { head: [clamp((G.tx - G.px) * 5, -.9, .9), 1], walk: G.t * 6, amp: .7, rim: true });
    if (G.gflash > 0 && !G.over) { const um = upv && upv.muz, fx = um ? q.x + um[0] * upv.flip * ss : q.x + 16 * ss, fy = um ? q.y - um[1] * ss : q.y - 42 * ss; flare(fx, fy, 5.2 * ss + 1.5, '255,214,130', Math.floor(G.t * 24)); }
    const w = 38 * q.s, hy = q.y - (sprReady('t800_reprogrammed') ? 72 : 88) * ss, bh = Math.max(2.4, 4 * q.s);
    cx.fillStyle = '#012'; cx.fillRect(q.x - w / 2, hy, w, bh); cx.fillStyle = fr > .35 ? '#6ff3ff' : '#ff6a4a'; cx.fillRect(q.x - w / 2, hy, w * fr, bh);
    if (fr < .5 && Math.random() < .25) pushPart({ x: q.x + rnd(-4, 4), y: q.y - 55 * ss, vx: rnd(-8, 8), vy: -26, life: .7, max: .7, col: '#2a2f38', r: 3, g: -18 });
  } });
  const shown = Math.min(G.n, 40);
  if (!G.over || G.won) for (let i = 0; i < shown; i++) {
    const { ox, oz } = slotOf(i, shown);
    const ci = shown - 1 - i, cl = clAt(ci);
    items.push({ z: oz + (G.adv || 0), f: () => {   // the Meshy soldiers (rifle3 rifleman, rifle2 cap, rifle1 goggles, rifle0 bandana, rifle4 radio; all views + run cycle) are used for now; class soldiers reuse them
      const q = P(G.px + ox, oz + (G.adv || 0)), nm = cl && sprReady(CLASS[cl].spr) ? CLASS[cl].spr : 'resistance_rifleman', fc = ox < -.02 ? -1 : 1;
      const pv = drawSpr(nm, q.x, q.y, q.s, { head: [clamp((G.tx - G.px) * 5, -.9, .9), 1], flip: fc, walk: G.t * 8 + i, amp: .8, rim: true });
      if (pv) {
        if (!G.over && i % 2 === 0 && ((G.t / (G.fiv || .2) + i * .618) % 1) < .22) {   // each fighter flashes on his own beat
           const mz = pv.muz, fx = mz ? q.x + mz[0] * pv.flip * q.s : q.x + fc * 25 * q.s, fy = mz ? q.y - mz[1] * q.s : q.y - 36 * q.s; flare(fx, fy, 4.4 * q.s + 1.4, '255,214,130', Math.floor(G.t * 20) + i * 3.7); }
      }
    } });
  }
  items.sort((a, b) => b.z - a.z);
  for (const it of items) safeDraw(it.f);
  safeDraw(drawLights);

  // bullets
  for (const b of G.bullets) {
    if (b.d > 0) continue;
    const len = b.w.pierce ? 90 : b.w.splash ? 46 : 30, rel = b.wz - G.dist, q = P(b.x, rel), q2 = P(b.x - (b.vx || 0) * len / 1100, rel - len), c = b.w.col, rgb = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)).join(',');
    cx.save(); cx.globalCompositeOperation = 'lighter';
    streak(q2.x, q2.y - 34 * q2.s, q.x, q.y - 34 * q.s, Math.max(1.4, (b.w.pierce ? 6 : b.w.splash ? 5.5 : 3) * q.s * 1.9), rgb, .45);
    streak(q2.x, q2.y - 34 * q2.s, q.x, q.y - 34 * q.s, Math.max(.9, (b.w.pierce ? 2.6 : b.w.splash ? 2.4 : 1.4) * q.s * 1.6), '255,250,235', .95);
    cx.restore();
  }
  // particles / text
  for (const p of G.parts) {
    cx.globalAlpha = clamp(p.life / p.max * 1.6, 0, 1);
    if (p.fl) flare(p.x, p.y, p.r, p.fl, p.sd);
    else if (p.st) { cx.strokeStyle = p.col; cx.lineWidth = 1.6; line(p.x, p.y, p.x - p.vx * .035, p.y - p.vy * .035); }
    else { cx.fillStyle = p.col; cx.fillRect(p.x, p.y, p.r, p.r); }
  }
  cx.globalAlpha = 1;
  cx.textAlign = 'center'; cx.textBaseline = 'middle';
  for (const t of G.texts) {
    cx.globalAlpha = clamp(t.life, 0, 1); cx.font = `${t.sz || 20}px ${FONT}`;
    cx.lineWidth = 4; cx.strokeStyle = '#000'; cx.strokeText(t.txt, t.x, t.y); cx.fillStyle = t.col; cx.fillText(t.txt, t.x, t.y);
  }
  cx.globalAlpha = 1;
  // squad count
  if (!G.over || G.won) {
    const q = squadPos();
    cx.font = `34px ${FONT}`; cx.lineWidth = 6; cx.strokeStyle = '#000'; cx.strokeText(G.n, q.x, q.y - 78);
    cx.fillStyle = '#fff'; cx.fillText(G.n, q.x, q.y - 78);
  }
  if (G.flash > 0) { cx.fillStyle = `rgba(255,255,255,${G.flash * .6})`; cx.fillRect(0, 0, W, H); }
  if (G.hurtFlash > 0) { cx.fillStyle = `rgba(255,0,0,${G.hurtFlash * .5})`; cx.fillRect(0, 0, W, H); }
  safeDraw(drawWeather);
  safeDraw(drawEnv);
  cx.restore();
  safeDraw(drawGrade);
  safeDraw(drawHUD);
}

function drawHUD() {
  cx.fillStyle = 'rgba(0,0,0,.5)'; cx.fillRect(0, 0, W, 52);
  cx.textBaseline = 'middle'; cx.textAlign = 'left'; cx.font = `15px ${FONT}`; cx.fillStyle = '#ff9a4a';
  cx.fillText('SECTOR ' + G.lv + (G.endless ? ' · SURVIVAL' : ''), 14, 18);
  cx.textAlign = 'right'; cx.fillStyle = '#ffd24a'; cx.fillText('⚙ ' + G.scrap, W - 60, 18);
  const pw = W - 100, pr = clamp(G.dist / G.L, 0, 1);
  cx.fillStyle = '#222'; cx.fillRect(14, 34, pw, 8); cx.fillStyle = '#ff5a2a'; cx.fillRect(14, 34, pw * pr, 8);
  // pause button
  cx.strokeStyle = '#fff'; cx.lineWidth = 2; cx.beginPath(); cx.arc(W - 26, 26, 15, 0, 7); cx.stroke();
  cx.fillStyle = '#fff'; cx.fillRect(W - 31, 19, 4, 14); cx.fillRect(W - 24, 19, 4, 14);
  // boss bar
  const boss = G.en.find(e => e.boss && !e.dead && e.wz - G.dist < 900);
  if (boss) {
    cx.textAlign = 'center'; cx.font = `13px ${FONT}`; cx.fillStyle = '#fff'; cx.fillText((boss.name || ET[boss.t].name).toUpperCase(), W / 2, 68);
    cx.fillStyle = '#300'; cx.fillRect(30, 78, W - 60, 10); cx.fillStyle = '#ff2a2a'; cx.fillRect(30, 78, (W - 60) * Math.max(0, boss.hp / boss.max), 10);
    if (boss.plateMax) { cx.fillStyle = '#012'; cx.fillRect(30, 90, W - 60, 5); cx.fillStyle = '#6ff3ff'; cx.fillRect(30, 90, (W - 60) * Math.max(0, boss.plate / boss.plateMax), 5); }
    if (boss.cp) { const cw = (W - 60) / boss.cp.length; cx.font = `8px ${FONT}`; boss.cp.forEach((p, i) => { const x0 = 30 + i * cw; cx.fillStyle = '#1a1010'; cx.fillRect(x0 + 1, 98, cw - 2, 4); cx.fillStyle = p.dead ? '#444' : p.hit > 0 ? '#fff' : '#ffb04a'; cx.fillRect(x0 + 1, 98, (cw - 2) * Math.max(0, p.fr), 4); cx.fillStyle = p.dead ? '#666' : '#c9a070'; cx.textAlign = 'center'; cx.fillText((p.dead ? '✕ ' : '') + p.name, x0 + cw / 2, 111); }); }
  }
  // weapon
  cx.textAlign = 'left'; cx.font = `14px ${FONT}`; cx.fillStyle = WEAPONS[G.tier].col; cx.fillText(WEAPONS[G.tier].name, 14, H - 20);
  { cx.textAlign = 'left'; cx.font = `11px ${FONT}`; const g = G.guard; // reprogrammed unit integrity
    if (g && !g.dead) { cx.fillStyle = '#6ff3ff'; cx.fillText('UNIT', 14, H - 58); cx.fillStyle = '#012'; cx.fillRect(52, H - 63, 90, 9); cx.fillStyle = g.hp / g.max > .35 ? '#6ff3ff' : '#ff6a4a'; cx.fillRect(52, H - 63, 90 * g.hp / g.max, 9); }
    else if (g) { cx.fillStyle = '#7a4a4a'; cx.fillText('UNIT LOST', 14, H - 58); } }
  { let by = H - 76; cx.textAlign = 'left'; cx.font = `11px ${FONT}`;   // active buffs
    if (G.od > 0) { cx.fillStyle = BUFF.rapid.col; cx.fillText('OVERDRIVE ' + G.od.toFixed(1) + 's', 14, by); by -= 16; }
    if (G.shield > 0) { cx.fillStyle = BUFF.shield.col; cx.fillText('ARMOUR ' + '■'.repeat(G.shield), 14, by); by -= 16; }
    if (G.n > 0 && G.peak >= 12 && G.n <= G.peak * .25) { cx.fillStyle = '#ff6a4a'; cx.globalAlpha = .6 + .4 * Math.sin(T * 8); cx.fillText('LAST STAND +20%', 14, by); cx.globalAlpha = 1; } }
  // specialist squad members
  cx.textAlign = 'left'; cx.font = `11px ${FONT}`; let cxp = 14;
  { let row = 0; for (const k of CLS) { if (!G.cls[k]) continue; const t = CLASS[k].name.split(' ')[0] + ' x' + G.cls[k], tw = cx.measureText(t).width; if (cxp + tw > W - 140 && cxp > 14) { cxp = 14; row++; } cx.fillStyle = CLASS[k].col; cx.fillText(t, cxp, H - 40 - row * 14); cxp += tw + 10; } }
  // formation button
  { const fx = W - 118, fy = H - 52; cx.fillStyle = 'rgba(0,0,0,.55)'; cx.beginPath(); cx.arc(fx, fy, 24, 0, 7); cx.fill(); cx.strokeStyle = '#8fb4d8'; cx.lineWidth = 2; cx.beginPath(); cx.arc(fx, fy, 21, 0, 7); cx.stroke();
    cx.fillStyle = '#cfe8ff'; const f = G.form || 'free', dot = (x, y) => cx.fillRect(fx + x - 2, fy + y - 2, 4, 4);
    if (f === 'free') { dot(-6, -4); dot(5, -6); dot(0, 0); dot(-5, 6); dot(6, 4); } else if (f === 'v') { dot(0, -8); dot(-5, -1); dot(5, -1); dot(-10, 6); dot(10, 6); } else if (f === 'col') { for (let i = 0; i < 4; i++) { dot(-3, -9 + i * 6); dot(3, -9 + i * 6); } } else { for (let i = 0; i < 5; i++) { dot(-12 + i * 6, -3); dot(-12 + i * 6, 5); } }
    cx.textAlign = 'center'; cx.font = `8px ${FONT}`; cx.fillStyle = '#7fa0c0'; cx.fillText(FORMS[f].name, fx, fy + 36); }
  // tactical item slot
  { const ex = W - 56, ey = H - 70, it = G.item, d = it && ITEMS[it.k], col = d ? d.col : '#3a6b8a';
    cx.fillStyle = 'rgba(0,0,0,.55)'; cx.beginPath(); cx.arc(ex, ey, 34, 0, 7); cx.fill();
    cx.strokeStyle = col; cx.lineWidth = 4; cx.globalAlpha = d ? .55 + .45 * Math.sin(T * 5) * .5 + .2 : .5; cx.beginPath(); cx.arc(ex, ey, 30, 0, 7); cx.stroke(); cx.globalAlpha = 1;
    cx.textAlign = 'center';
    if (d) {
      cx.font = `${d.g.length > 2 ? 15 : 19}px ${FONT}`; cx.fillStyle = col; cx.fillText(d.g, ex, ey - 3);
      for (let i = 0; i < it.n; i++) { cx.fillRect(ex - (it.n - 1) * 5 + i * 10 - 3, ey + 7, 6, 6); }
      cx.font = `8px ${FONT}`; cx.fillStyle = '#9fb4c4'; cx.fillText('USE', ex, ey + 25);
    } else { cx.font = `10px ${FONT}`; cx.fillStyle = '#5a7a8a'; cx.fillText('NO ITEM', ex, ey + 3); }
    if (d) { cx.font = `9px ${FONT}`; cx.fillStyle = col; cx.textAlign = 'right'; cx.fillText(d.name, ex + 34, ey - 42); } }
  if (G.alert && !G.warn) { const a = G.alert, al = clamp(Math.min(a.t, 2.4 - a.t + .0) * 3, 0, 1); cx.save(); cx.globalAlpha = al; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.font = `13px ${FONT}`;
    const tw = cx.measureText(a.txt).width + 34; cx.fillStyle = 'rgba(40,8,8,.72)'; cx.fillRect(W / 2 - tw / 2, 82, tw, 22); cx.fillStyle = '#ff5a4a'; cx.fillRect(W / 2 - tw / 2, 82, 3, 22); cx.fillRect(W / 2 + tw / 2 - 3, 82, 3, 22);
    cx.fillStyle = '#ffd0c8'; cx.fillText((a.fly ? '▲ ' : '') + a.txt, W / 2, 94); cx.restore(); }
  if (G.warn) { // boss approaching: siren and flashing warning
    const on = Math.sin(T * 14) > -.2, a = Math.min(1, G.warn.t * 2);
    cx.globalAlpha = a * (on ? .4 : .15); cx.fillStyle = '#ff1a1a'; cx.fillRect(0, 52, W, 10); cx.fillRect(0, H - 10, W, 10);
    cx.globalAlpha = a; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    if (on) { cx.font = `46px ${FONT}`; cx.lineWidth = 7; cx.strokeStyle = '#000'; cx.strokeText('WARNING', W / 2, 250); cx.fillStyle = '#ff3b3b'; cx.fillText('WARNING', W / 2, 250); }
    cx.font = `18px ${FONT}`; cx.lineWidth = 5; cx.strokeStyle = '#000'; const nm = String(G.warn.name).toUpperCase() + ' APPROACHING'; cx.strokeText(nm, W / 2, 288); cx.fillStyle = '#fff'; cx.fillText(nm, W / 2, 288);
    cx.globalAlpha = 1;
  }
  // intro banner
  if (G.t < 2.2) {
    cx.globalAlpha = clamp(2.2 - G.t, 0, 1); cx.font = `30px ${FONT}`; cx.lineWidth = 6; cx.strokeStyle = '#000'; cx.textAlign = 'center';
    const nm = SECT[(G.lv - 1) % SECT.length].toUpperCase();
    cx.strokeText(nm, W / 2, 200); cx.fillStyle = '#ff9a4a'; cx.fillText(nm, W / 2, 200);
    if (tierOf(G.lv) > 0) { cx.font = `14px ${FONT}`; cx.lineWidth = 4; const tt = 'THREAT TIER ' + tierOf(G.lv) + ' · ENEMY HEALTH +' + Math.round((tierMul(G.lv) - 1) * 100) + '%'; cx.strokeText(tt, W / 2, 228); cx.fillStyle = '#ff6a5a'; cx.fillText(tt, W / 2, 228); }
    cx.globalAlpha = 1;
  }
  { const pu = G.pups.find(q => q.wz - G.dist > 40 && q.wz - G.dist < 720);
    if (pu && G.lv <= 2 && !G.guard) { cx.globalAlpha = .6 + .4 * Math.sin(T * 6); cx.font = `12px ${FONT}`; cx.textAlign = 'center'; cx.lineWidth = 4; cx.strokeStyle = '#000'; cx.strokeText('STEER ONTO THE CYAN CRATE: REPROGRAMMED UNIT', W / 2, 232); cx.fillStyle = '#6ff3ff'; cx.fillText('STEER ONTO THE CYAN CRATE: REPROGRAMMED UNIT', W / 2, 232); cx.globalAlpha = 1; } }
  if (G.lv === 1 && G.t < 6 && G.t > 1.5) {
    cx.globalAlpha = .9; cx.font = `13px ${FONT}`; cx.fillStyle = '#fff'; cx.textAlign = 'center';
    cx.fillText('DRAG TO MOVE · SHOOT GATES TO BOOST THEM', W / 2, 250); cx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- loop
let acc = 0;
function frame(ts) {
  try { frame0(ts); } catch (err) { console.error(err); try { cv.width = cv.width; } catch (e2) {} last = ts; acc = 0; requestAnimationFrame(frame); }   // (re-assigning the width resets the canvas state: a draw that threw half way must not leave a clip, blend mode or save() behind for every later frame)   // one bad frame must never freeze the game
}
function frame0(ts) {
  const dt = Math.min(.1, (ts - last) / 1000 || 0); last = ts; T += dt;
  if (state === 'play' && G && !G.paused) { // fixed 60 Hz simulation: game speed no longer depends on the display's frame rate (a 30 fps phone plays at the same pace, just choppier)
    acc += dt; let n = 0; while (acc >= 1 / 60 && n < 6) { update(1 / 60); acc -= 1 / 60; n++; } if (n === 6) acc = 0;
  } else { acc = 0; if (state === 'menu') bgDist += 60 * dt; }
  render();
  requestAnimationFrame(frame);
}
applyCRT();
function spriteLoad() { let ok = 0, tot = 0; for (const n of Object.keys(SPR)) for (const k of Object.keys(SPR[n].dirs)) for (const f of SPR[n].dirs[k].frames) { tot++; if (f.ok) ok++; } return [ok, tot]; }
if (typeof Image !== 'undefined' && spriteLoad()[1] > 0) { // show a loading bar until the sprites are in (or a few seconds have passed), so nothing pops in during play
  const t0 = performance.now(); state = 'loading';
  const tick = () => { const [ok, tot] = spriteLoad(), done = ok >= tot - 1 || performance.now() - t0 > 7000; if (done) { showMenu(); return; }
    ov(`<div class="panel"><h2>LOADING</h2><div class="res">${ok} / ${tot}</div><div style="height:.6em;background:#1a2230;border-radius:.3em;margin:.6em 8%"><div style="height:100%;width:${Math.round(100 * ok / tot)}%;background:#ff5a2a;border-radius:.3em"></div></div></div>`); setTimeout(tick, 120); };
  tick();
} else showMenu();
requestAnimationFrame(frame);
