const fs=require('fs');
const noop=()=>{};
const ctx=new Proxy({}, {get:(t,k)=>(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop:noop}):k==='getImageData'?()=>({data:new Uint8ClampedArray(336*560*4)}):(k==='measureText'?()=>({width:20}):(k in t?t[k]:noop)), set:(t,k,v)=>{t[k]=v;return true}});
const el=()=>({getContext:()=>ctx,addEventListener:noop,style:{},set innerHTML(v){},getBoundingClientRect:()=>({left:0,top:0,width:480,height:800}),setPointerCapture:noop});
global.document={getElementById:el,addEventListener:noop,hidden:false,querySelectorAll:()=>[]};
global.window={addEventListener:noop};
global.localStorage={getItem:()=>null,setItem:noop};
global.performance={now:()=>Date.now()};
let rafcb;global.requestAnimationFrame=f=>{rafcb=f};
// UI fuzz: persistent fake DOM so every button handler can be invoked at random, interleaved with play frames
const els = {}, rows = [];
const mkEl = id => (els[id] = els[id] || { id, style: {}, dataset: {}, classList: { toggle() {}, add() {}, remove() {} }, set innerHTML(v) { this._h = v; if (id === 'ui') { rows.length = 0; for (const m of String(v).matchAll(/<button class="(row|dn)" data-k="(\w+)"/g)) rows.push({ cls: m[1], dataset: { k: m[2] }, onclick: null }); } }, get innerHTML() { return this._h || ''; }, getContext: () => ctx, addEventListener: noop, getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 800 }), setPointerCapture: noop, click() { this.onclick && this.onclick(); }, textContent: '' });
global.document = { getElementById: mkEl, addEventListener: noop, hidden: false, querySelectorAll: sel => rows.filter(r => sel === '.row' ? r.cls === 'row' : sel === '.dn' ? r.cls === 'dn' : false) };
global.localStorage = { getItem: () => null, setItem: noop };
const store = {}; const src = fs.readFileSync(process.argv[2] || require('path').join(__dirname, '..', 'game.js'), 'utf8') + `;globalThis.__t={showMenu,showSquad,showArmory,showSettings,startLevel,update,render,setPause,useItem,fireEMP,endRun,get G(){return G},get save(){return save},get state(){return state},keys};`;
eval(src); const t = globalThis.__t; let seed = +process.argv[3] || 99; const R = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296; Math.random = R;
let actions = 0; const errs = [];
t.save.scrap = 5000; t.showMenu();
for (let step = 0; step < +(process.argv[4] || 3000); step++) {
  try {
    const ids = Object.keys(els).filter(k => k !== 'ui' && k !== 'c' && els[k].onclick), pool = ids.map(k => els[k]).concat(rows.filter(r => r.onclick));
    const r = R();
    if (r < .45 && pool.length) { const e = pool[Math.floor(R() * pool.length)]; if (e.id !== 'rst' && e.id !== 'yes') { e.onclick(); actions++; } }
    else if (r < .5 && ids.includes('rst')) { els.rst.onclick(); if (els.no) els.no.onclick && els.no.onclick(); }
    else if (t.state === 'play' && t.G) { for (let i = 0; i < 1 + Math.floor(R() * 90); i++) { t.G.tx = R() * 1.7 - .85; if (R() < .02) { t.G.item = { k: ['pulse','c4','flare','spike','cannon','nuke'][Math.floor(R() * 6)], n: 3 }; t.useItem(); } if (R() < .002) t.setPause(!t.G.paused); if (R() < .01) t.G.n = Math.min(999, t.G.n + 30); if (!t.G.paused) t.update(1 / 60); if (i % 20 === 0) t.render(); } }
    t.render();
    if (!['menu', 'play', 'end'].includes(t.state)) errs.push('bad state ' + t.state);
    if (t.save.scrap < 0 || !Number.isFinite(t.save.scrap)) errs.push('bad scrap ' + t.save.scrap);
    for (const k of Object.keys(t.save.up)) if (t.save.up[k] < 0) errs.push('neg upgrade ' + k);
    if (t.save.loadout.length > 3) errs.push('loadout > 3');
  } catch (e) { errs.push(String(e.stack).split('\n').slice(0, 3).join(' | ')); if (errs.length > 5) break; }
}
console.log('ui fuzz actions', actions, 'state', t.state, 'scrap', t.save.scrap); console.log(errs.length ? errs.join('\n') : 'no ui errors');
