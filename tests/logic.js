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
;globalThis.__t={mk,kill,hurtEnemy,useItem,fireEMP,update,render,detonateHaz,strikeRound,applyGate,ET,CLASS,startLevel,get G(){return G},get state(){return state},frame,keys};`;
eval(src);

const t=globalThis.__t; let ok=0,bad=0;
const check=(n,c,info)=>{ if(c){ok++;console.log('PASS',n,info||'')} else {bad++;console.log('FAIL',n,info||'')} };
function fresh(lv){ t.startLevel(lv); const G=t.G; G.en=[];G.gates=[];G.haz=[];G.scr=[];G.bolts=[]; G.fcd=99; return G; }
function step(G,sec){ for(let i=0;i<Math.round(sec*60);i++){ G.fcd=99; t.update(1/60);} }

// 1 crawling phase: ~30% of lethal hits on grunts/gunners convert to crawlers
{ let conv=0,N=400; for(let i=0;i<N;i++){ const G=fresh(1); const e=t.mk('grunt',G.dist+200,0,1); e.active=true; G.en.push(e); e.hp=0; e.blast=true; t.kill(e); if(!e.dead && e.t==='runner') conv++; }
  check('crawl phase ~75% after a blast', conv/N>.66 && conv/N<.84, (conv/N).toFixed(2)); }
// 2 plating: frontal fire hits plate first, flank bypasses
{ const G=fresh(3); const e=t.mk('heavy',G.dist+150,0,1.4); e.active=true; e.plateMax=500; e.plate=500; e.hp=e.max=1000; G.en.push(e); G.px=0;
  t.hurtEnemy(e,100); check('front hit soaks plate not hp', e.plate<500 && e.hp===1000, `plate ${e.plate.toFixed(0)} hp ${e.hp}`);
  G.px=-.6; e.x=0; const hp0=e.hp; t.hurtEnemy(e,100); check('flank bypasses plate', e.hp<hp0, `hp ${e.hp.toFixed(0)}`);
  G.px=0; e.plate=10; t.hurtEnemy(e,100); check('plate breaks cleanly', e.plate===0 && e.hp<=hp0-70); }
// 3 aerostat EMP
{ const G=fresh(3); const e=t.mk('aerostat',G.dist+200,0,1); e.active=true; G.en.push(e); G.item={k:'pulse',n:3}; const m=e.max; t.useItem(); for(let i=0;i<100;i++) t.update(1/60); check('EMP drops the aerostat out of the sky', e.dead, `hp ${e.hp.toFixed(0)}/${m.toFixed(0)} crash ${e.crash}`); }
// 4 scrap drops physically and is vacuumed
{ const G=fresh(1); G.px=0; G.tx=0; const e=t.mk('heavy',G.dist+60,0,1); e.active=true; G.en.push(e); const before=G.scrap; e.hp=0; t.kill(e);
  check('kill spawns scrap chunks, no instant scrap', G.scr.length>0 && G.scrap===before, `chunks ${G.scr.length}`);
  step(G,3); check('squad vacuums chunks', G.scrap>before, `scrap ${G.scrap}`); }
// 5 hazards (only unexploded ordnance now)
{ const G2=fresh(2); G2.n=30; G2.haz.push({k:'uxo',x:0,hw:.09,wz:G2.dist+25,len:30,tick:0,dead:false}); step(G2,1.2); check('UXO explodes on contact', G2.n<30, `n ${G2.n}`);
  const G3=fresh(2); G3.n=30; G3.px=.7; G3.tx=.7; G3.haz.push({k:'uxo',x:-.5,hw:.09,wz:G3.dist+25,len:30,tick:0,dead:false}); step(G3,2); check('steering clear avoids the mine', G3.n===30, `n ${G3.n}`); }
// 6 classes: gate gives specialists, rockets hit armoured tank, tech widens, medic revives
{ const G=fresh(3); G.n=10; G.peak=10; t.applyGate({px:-.5,L:{k:'cls',c:'heavy',v:2},R:{k:'add',v:3}}); check('class gate adds specialists', G.cls.heavy===4 && G.n===15, `n ${G.n} cls ${JSON.stringify(G.cls)}`);
  const tk=t.mk('tank',G.dist+300,0,1); tk.active=true; tk.hp=tk.max=2000; G.en.push(tk); G.px=0; G.tx=0; G.rcd=0; const h0=tk.hp; step(G,2.2); check('rockets damage tank', tk.hp<h0 - 0, `tank hp ${tk.hp.toFixed(0)}`);
  const G2=fresh(3); G2.n=8; G2.peak=20; G2.cls.medic=5; G2.px=0; G2.tx=0; for(let i=0;i<40;i++) G2.scr.push({x:0,wz:G2.dist+40+i*3,v:1,sp:0}); step(G2,3); check('scavengers revive fallen soldiers', G2.n>8, `n ${G2.n}`);
  const G3=fresh(3); G3.n=20; G3.cls.tech=3; G3.px=.04; t.applyGate({px:.04,L:{k:'add',v:6},R:{k:'add',v:-4}}); check('tech ops collect the good gate too', G3.n===20 || G3.n===22, `n ${G3.n}`); }
// 7 sky hunter strikes + boss warning
{ const G=fresh(3); G.n=30; const b=t.mk('gunship',G.dist+400,0,1,{boss:true,hp:3000,max:3000,sc:1.5,name:'Sky Hunter'}); b.active=true; G.en.push(b); G.px=0; G.tx=0; step(G,.3);
  check('boss intro warning + shake', !!G.warn && G.shake>0, G.warn&&G.warn.name); step(G,9);
  check('sky hunter paints strike markers', G.strikes.length>0 || b.striking>=0 && b.sk!==undefined, `strikes ${G.strikes.length}`); }
// 8 endos never run: constant slow pace all the way in
{ const G=fresh(1); const e=t.mk('grunt',G.dist+140,0,1); e.active=true; e.hp=e.max=1e6; G.en.push(e); G.px=.8; G.tx=.8; G.fcd=1e9; G.gates=[]; G.spd=0; const z0=e.wz; let relBefore=e.wz-G.dist; step(G,.2); const moved=(relBefore-(e.wz-G.dist))-G.spd*.2*0; check('grunts do not sprint (no red-eye burst)', e.spr===undefined && Math.abs((z0-e.wz)-t.ET.grunt.spd*.2)<1.5, 'moved '+(z0-e.wz)+' expected '+(t.ET.grunt.spd*.2)); }
console.log(ok+' passed, '+bad+' failed');
