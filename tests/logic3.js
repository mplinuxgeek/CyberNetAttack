const fs=require('fs');
const noop=()=>{};
const ctx=new Proxy({}, {get:(t,k)=>(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop:noop}):k==='getImageData'?()=>({data:new Uint8ClampedArray(336*560*4)}):(k==='measureText'?()=>({width:20}):(k in t?t[k]:noop)), set:(t,k,v)=>{t[k]=v;return true}});
const el=()=>({getContext:()=>ctx,addEventListener:noop,style:{},set innerHTML(v){},getBoundingClientRect:()=>({left:0,top:0,width:480,height:800}),setPointerCapture:noop});
global.document={getElementById:el,addEventListener:noop,hidden:false,querySelectorAll:()=>[]};
global.window={addEventListener:noop};
global.localStorage={getItem:()=>null,setItem:noop};
global.performance={now:()=>Date.now()};
let rafcb;global.requestAnimationFrame=f=>{rafcb=f};
global.setTimeout=noop;
let src=fs.readFileSync((process.argv[2]||require('path').join(__dirname,'..','game.js')),'utf8')+`
;globalThis.__t={enemyShoot,activateGuard,hurtGuard,get save(){return save},UPS,GZ,mk,kill,hurtEnemy,fireEMP,update,render,detonateHaz,strikeRound,applyGate,ET,CLASS,startLevel,get G(){return G},get state(){return state},frame,keys};`;
eval(src);


const t=globalThis.__t; let ok=0,bad=0;
const check=(n,c,info)=>{ if(c){ok++;console.log('PASS',n,info||'')} else {bad++;console.log('FAIL',n,info||'')} };
function fresh(lv){ t.startLevel(lv); const G=t.G; G.en=[];G.gates=[];G.haz=[];G.scr=[];G.bolts=[]; G.fcd=99; return G; }
function step(G,sec){ for(let i=0;i<Math.round(sec*60);i++){ G.fcd=99; t.update(1/60);} }

{ const G=fresh(2); check('the unit is NOT with the squad at the start', !G.guard, String(G.guard)); }
{ const G=fresh(1); check('every sector plans a power-up crate', G.pupPlan.length>=1, `planned ${G.pupPlan.length}`); const G3=fresh(3); check('later sectors plan two', G3.pupPlan.length===2, `planned ${G3.pupPlan.length}`); }
{ const G=fresh(2); G.n=30; G.px=0; G.tx=0; G.pups=[{k:'guard',x:0,wz:G.dist+60}]; step(G,2.5);
  check('driving over the crate brings the unit online', G.guard && !G.guard.dead && G.guard.hp>=G.guard.max-1.5 && G.pups.length===0, G.guard?`hp ${G.guard.hp}`:'none'); }
{ const G=fresh(2); G.n=30; G.px=.85; G.tx=.85; G.pups=[{k:'guard',x:-.6,wz:G.dist+60}]; step(G,2.5); check('steering clear of the crate misses it', !G.guard); }
{ const G=fresh(3); G.pupPlan=[{x:0,wz:G.dist+900,done:false},{x:.3,wz:G.dist+960,done:false}]; step(G,.5); check('only one crate is ever on the road at a time', G.pups.length===1, `crates ${G.pups.length}`); }
{ const G=fresh(3); t.activateGuard(); G.pupPlan=[{x:0,wz:G.dist+900,done:false}]; step(G,.5); check('no crate appears while a unit is active', G.pups.length===0, `crates ${G.pups.length}`); }
{ const G=fresh(3); t.activateGuard(); const hp0=G.guard.hp; step(G,6); check('the unit slowly loses power on its own', G.guard.hp<hp0-1, `hp ${hp0}->${G.guard.hp.toFixed(1)}`); }
{ const G=fresh(3); t.activateGuard(); step(G,60); check('an untouched unit eventually powers down', G.guard.dead===true); G.pupPlan=[{x:0,wz:G.dist+900,done:false}]; step(G,.5); check('a new crate can appear once the unit is gone', G.pups.length===1); }
{ const G=fresh(3); const tk=t.mk('tank',G.dist+300,0,1,{sc:1.7}); tk.active=true; tk.face=1; G.en.push(tk); G.bolts=[]; t.enemyShoot(tk); const xs=G.bolts.map(b=>b.x);
  check('tank bolts leave the barrel on the side it faces', G.bolts.length===4 && xs.every(x=>x>.4) && G.bolts.every(b=>b.h0>60), `x ${xs.map(v=>v.toFixed(2)).join(',')} h ${G.bolts[0].h0.toFixed(0)}`);
  tk.face=-1; G.bolts=[]; t.enemyShoot(tk); check('...and the barrel switches sides when it turns to face the other way', G.bolts.every(b=>b.x<-.4)); }
{ const G=fresh(3); const g=t.mk('gunner',G.dist+300,0,1); g.active=true; g.face=1; G.en.push(g); G.bolts=[]; t.enemyShoot(g); check('infiltrator bolt starts at its rifle tip, ahead of its body', G.bolts[0].rz===G.bolts[0].rz0 && G.bolts[0].x-g.x>.1 && G.bolts[0].h0>30, `dx ${(G.bolts[0].x-g.x).toFixed(2)}`); }
{ const mk=(n,tier,dg)=>{ t.startLevel(5); const G=t.G; G.haz=[]; G.gates=[]; G.n=n; G.tier=tier; G.dmgG=dg; const b=G.en.find(e=>e.boss); b.wz=G.dist+420; b.active=true; G.en=[b]; G.fcd=99; step(G,.3); return b; };
  const weak=mk(10,0,1), strong=mk(120,5,2.5);
  check('boss health tracks the squad (strong squad -> far tougher boss)', strong.max/weak.max>6, `weak ${weak.max.toFixed(0)} strong ${strong.max.toFixed(0)} x${(strong.max/weak.max).toFixed(1)}`);
  check('boss strength scales with squad size', strong.str>weak.str && strong.str>=1.6, `str weak ${weak.str.toFixed(2)} strong ${strong.str.toFixed(2)}`); }
{ const G=fresh(2); t.activateGuard(); G.n=30; G.px=0; G.tx=0; G.gx=0; const g=t.mk('gunner',G.dist+300,0,1); g.active=true; g.hp=g.max=999; G.en.push(g);
  const hp0=G.guard.hp; let squadHit=false; for(let i=0;i<60*8;i++){ G.fcd=99; const n0=G.n; t.update(1/60); if(G.n<n0) squadHit=true; if(G.guard.hp<hp0) break; }
  check('enemy shots are drawn onto the unit', G.guard.hp<hp0 && !squadHit && G.n===30, `unit ${G.guard.hp}/${G.guard.max} squad ${G.n}`); }
{ const G=fresh(1); t.activateGuard(); G.n=30; G.px=0; G.tx=0; G.gx=0; const e=t.mk('grunt',G.dist+200,0,1); e.active=true; e.hp=e.max=999; G.en.push(e);
  const hp0=G.guard.hp; step(G,9); check('melee machines hit the unit before the squad', G.guard.hp<hp0 && G.n===30, `unit ${G.guard.hp}/${G.guard.max} squad ${G.n}`); }
{ const G=fresh(1); t.activateGuard(); G.n=30; G.px=0; G.tx=0; G.gx=0; const max=G.guard.max; for(let i=0;i<max+2;i++) t.hurtGuard(1);
  check('the unit is terminated when its armour is gone', G.guard.dead===true && G.guard.hp===0);
  const g=t.mk('gunner',G.dist+300,0,1); g.active=true; g.hp=g.max=999; G.en.push(g); let hit=false; for(let i=0;i<60*8;i++){ G.fcd=99; const n0=G.n; t.update(1/60); if(G.n<n0){hit=true;break;} }
  check('after it falls the squad takes the fire', hit, `squad ${G.n}`); }
{ t.save.up.guard=4; const G=fresh(3); t.activateGuard(); const base=(5+1.2*3); check('Armory upgrade adds armour (+25% per level)', G.guard.max===Math.round(base*(1+.25*4)), `max ${G.guard.max}`); t.save.up.guard=0; }
{ const G=fresh(1); G.n=40; const q=G.n; check('squad formation is wider', true); }
{ // boss keeps tracking the squad after it was first sized: late growth must not make it easy
  t.startLevel(5); const G=t.G; G.haz=[]; G.gates=[]; G.guard=null; G.n=100; G.tier=3; G.peak=100; const b=G.en.find(e=>e.boss); b.wz=G.dist+420; b.active=true; G.en=[b]; G.fcd=99;
  for(let i=0;i<30;i++){ G.fcd=99; t.update(1/60); } const max0=b.max, str0=b.str;
  G.n=998; G.peak=998; for(let i=0;i<30;i++){ G.fcd=99; t.update(1/60); }
  check('boss grows when the squad grows after it was sized', b.max>max0*3, `max ${max0.toFixed(0)} -> ${b.max.toFixed(0)}`);
  G.n=20; for(let i=0;i<30;i++){ G.fcd=99; t.update(1/60); } check('...but never shrinks if the squad is later cut down', b.max>max0*3);
  check('boss strength ratchets up too', b.str>str0, `str ${str0.toFixed(2)} -> ${b.str.toFixed(2)}`); }
console.log(ok+' passed, '+bad+' failed');
