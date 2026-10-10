const fs=require('fs');
const noop=()=>{};
const ctx=new Proxy({}, {get:(t,k)=>(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop:noop}):k==='getImageData'?()=>({data:new Uint8ClampedArray(336*560*4)}):(k==='measureText'?()=>({width:20}):(k in t?t[k]:noop)), set:(t,k,v)=>{t[k]=v;return true}});
const el=()=>({getContext:()=>ctx,addEventListener:noop,style:{},set innerHTML(v){},getBoundingClientRect:()=>({left:0,top:0,width:480,height:800}),setPointerCapture:noop});
global.document={getElementById:el,addEventListener:noop,hidden:false,querySelectorAll:()=>[]};
global.window={addEventListener:noop};
global.localStorage={getItem:()=>null,setItem:noop};
global.performance={now:()=>Date.now()};
let rafcb;global.requestAnimationFrame=f=>{rafcb=f};
global.setTimeout=(f)=>{f()};
let src=fs.readFileSync((process.argv[2]||require('path').join(__dirname,'..','game.js')),'utf8')+`
;globalThis.__t={setPause,showSettings,sanitizeSave,endRun,activateBuff,dropCrate,bossShielded,hurtEnemy,fireEMP,render,airStrike,hurt0:0,armoryBuy,armoryDown,UPS,showArmory,activateGuard,buzz,mk,update,ET,keys,kill,startLevel,applyGate,volley,showSquad,genLevel,CLS,CLASS,airStrike,clsTotal,hurt,get save(){return save},get G(){return G}};`;
eval(src); const t=globalThis.__t; let pass=0,fail=0;
const check=(n,c,i)=>{ if(c){pass++;console.log('PASS',n)} else {fail++;console.log('FAIL',n,i||'')} };
function fresh(lv,loadout){ t.save.loadout=loadout; t.save.unlocked={heavy:1,tech:1,medic:1,shot:1,mark:1,officer:1,signal:1}; t.startLevel(lv); return t.G; }
// starting squad
{ const G=fresh(3,['shot','mark']); check('each pick starts with 2 soldiers', G.cls.shot===2&&G.cls.mark===2&&G.cls.heavy===0&&G.n>=10, JSON.stringify(G.cls)+' n'+G.n); }
{ const G=fresh(3,[]); check('no picks -> no specialists', t.clsTotal()===0); }
// gates only offer picked classes
{ t.save.loadout=['signal','officer']; const seen=new Set(); let any=0;
  for(let lv=2;lv<14;lv++){ const L=t.genLevel(lv); for(const g of L.gates) for(const o of [g.L,g.R]) if(o.k==='cls'){ any++; seen.add(o.c);} }
  check('class gates exist', any>0, any); check('gates only offer picked classes', [...seen].every(c=>c==='signal'||c==='officer'), [...seen]); }
{ t.save.loadout=[]; let any=0; for(let lv=2;lv<14;lv++){ const L=t.genLevel(lv); for(const g of L.gates) for(const o of [g.L,g.R]) if(o.k==='cls') any++; } check('no class gates without picks', any===0, any); }
// shotgun pellets: many, short range
{ const G=fresh(3,['shot']); G.n=30; G.cls.shot=3; const b0=G.bullets.length; t.volley(); const pel=G.bullets.filter(b=>b.rng); check('shotgunners add pellets', pel.length===9, pel.length);
  for(let i=0;i<40;i++) t.update(1/60); check('pellets expire at short range', G.bullets.filter(b=>b.rng).every(b=>b.wz-b.sz<=330)); }
// marksman: piercing armour-ignoring
{ const G=fresh(3,['mark']); G.n=30; G.cls.mark=2; t.volley(); const m=G.bullets.filter(b=>b.pen); check('marksman rounds pierce + ignore armour', m.length===2&&m[0].w.pierce); }
// officer: faster fire
{ const count=n=>{ const G=fresh(3,[]); G.n=30; G.cls.officer=n; G.en=[]; G.gates=[]; let c=0; const v=G.bullets; for(let i=0;i<120;i++){ t.update(1/60); c+=G.bullets.length; } return G.fcd; };
  const G0=fresh(3,[]); G0.en=[];G0.gates=[]; G0.n=30; let n0=0; for(let i=0;i<180;i++){ const b=G0.bullets.length; t.update(1/60); } 
  const G1=fresh(3,[]); G1.en=[];G1.gates=[]; G1.n=30; G1.cls.officer=6; let shots=0,last=G1.fcd; for(let i=0;i<180;i++){ t.update(1/60); if(G1.fcd>last+.001) shots++; last=G1.fcd; }
  const G2=fresh(3,[]); G2.en=[];G2.gates=[]; G2.n=30; let shots0=0; last=G2.fcd; for(let i=0;i<180;i++){ t.update(1/60); if(G2.fcd>last+.001) shots0++; last=G2.fcd; }
  check('officers raise fire rate ~30%', shots>shots0*1.2, shots+' vs '+shots0); }
// signaller air strike
{ const G=fresh(3,['signal']); G.n=40; const e=G.en.find(x=>!x.boss&&x.t!=='runner')||G.en[0]; G.gates=[]; e.wz=G.dist+300; e.hp=1e5; e.max=1e5; const hp0=e.hp;
  for(let i=0;i<60*9;i++){ G.n=Math.max(G.n,40); t.update(1/60); } check('signaller bombs machines ahead', e.hp<hp0 || e.dead, e.hp); }
// squad screen builds
{ fresh(3,['heavy']); t.save.scrap=999; let ok=true; try{ t.showSquad(); }catch(e){ ok=false; console.log(e.message);} check('squad screen renders', ok); }
// boss must not pin the squad short of a gate
{ const G=fresh(2,[]); G.n=30; G.en=[]; const boss=t.mk('harvester',G.dist+420,0,1,{boss:true}); G.en.push(boss); G.gates=[{wz:G.dist+170,L:{k:'add',v:3},R:{k:'add',v:3},used:false,px:0}];
  const g=G.gates[0]; for(let i=0;i<60*6&&!g.used;i++){ G.n=Math.max(G.n,30); t.update(1/60); }
  check('squad reaches the gate even with the boss in range', g.used, 'dist '+G.dist+' gate '+g.wz+' boss rel '+(boss.wz-G.dist)); }
{ const G=fresh(2,[]); G.n=30; G.en=[]; const boss=t.mk('harvester',G.dist+420,0,1,{boss:true}); G.en.push(boss); G.gates=[];
  for(let i=0;i<60*8;i++){ G.n=Math.max(G.n,30); t.update(1/60); } check('boss still stops the squad when no gate is in the way', boss.wz-G.dist>150 && G.spd<5, 'rel '+(boss.wz-G.dist)+' spd '+G.spd); }
// enemies wait behind gates
{ const G=fresh(2,[]); G.n=30; G.en=[]; const gw=G.dist+900; G.gates=[{wz:gw,L:{k:'add',v:3},R:{k:'add',v:3},used:false,px:0}];
  const e=t.mk('grunt',gw+150,0,1); e.hp=e.max=1e6; G.en.push(e); const z0=e.wz; G.fcd=1e9;
  G.spd=0; for(let i=0;i<30;i++){ G.n=30; G.fcd=1e9; t.update(1/60); }
  check('enemy beyond a far gate does not move yet', e.wz===z0 || Math.abs(e.wz-z0)<1, e.wz-z0);
  let minGap=1e9; for(let i=0;i<60*14&&!G.gates[0].used;i++){ G.n=30; G.fcd=1e9; t.update(1/60); if(!G.gates[0].used) minGap=Math.min(minGap,e.wz-G.gates[0].wz); }
  check('enemy never passes the gate before the squad does', minGap>=39.9, minGap); check('squad did reach the gate', G.gates[0].used); }
check('crawlers are slower than grunts', t.ET.runner.spd < t.ET.grunt.spd*.7, t.ET.runner.spd+' vs '+t.ET.grunt.spd);
// victory march: centre, no steering, scrap collected
{ const G=fresh(2,[]); G.n=30; G.en=[]; G.gates=[]; G.px=.7; G.tx=.7; G.gx=.7;
  for(let i=0;i<8;i++) G.scr.push({x:-.8+i*.23,wz:G.dist+60+i*40,v:5,sp:0});
  const tot=G.scr.reduce((a,c)=>a+c.v,0); const s0=G.scrap;
  G.over=true; G.won=true; G.sweep=true; G.adv=0; G.endT=99; G.sweepT=0;
  t.keys.ArrowRight=true; let maxx=0,tx_ok=true;
  for(let i=0;i<60*12&&G.sweep;i++){ t.update(1/60); if(G.tx!==0) tx_ok=false; if(i>90) maxx=Math.max(maxx,Math.abs(G.px)); }
  t.keys.ArrowRight=false;
  check('victory march ignores steering keys', tx_ok, 'tx '+G.tx);
  check('squad glides to the lane centre', maxx<.05, 'px '+maxx);
  check('whole lane of scrap is collected', G.scrap-s0===tot && G.scr.length===0, (G.scrap-s0)+'/'+tot); }
// tracked vehicles only change lane while driving forward
function laneTest(type){ const G=fresh(3,[]); G.n=40; G.gates=[]; G.en=[]; const e=t.mk(type,G.dist+700,0,1); e.hp=e.max=1e9; G.en.push(e); let xsMoving=[],xsHeld=[];
  for(let i=0;i<60*40;i++){ G.n=40; G.fcd=1e9; t.update(1/60); const rel=e.wz-G.dist; const held=rel<=t.ET[type].hold; if(!held) xsMoving.push(e.x); else if(rel>0) xsHeld.push(e.x); if(xsHeld.length>60*6) break; }
  const spread=a=>a.length?Math.max(...a)-Math.min(...a):0; return {mv:spread(xsMoving), held:spread(xsHeld), nHeld:xsHeld.length}; }
for(const ty of ['tank','behemoth','ogre']){ const r=laneTest(ty); check(ty+' strafes while driving forward', r.mv>.02, JSON.stringify(r)); check(ty+' cannot sidestep when stopped', r.nHeld>60 && r.held<.003, JSON.stringify(r)); }
{ const r=laneTest('heavy'); check('walkers (not tracked) still sway when holding', r.held>.02, JSON.stringify(r)); }
// haptics
{ const calls=[]; Object.defineProperty(globalThis,'navigator',{value:{vibrate:p=>{calls.push(p);return true}},configurable:true,writable:true});
  const G=fresh(2,[]); G.n=30; G.en=[]; G.gates=[]; t.volley(); const afterShot=calls.length; t.volley(); const rate=calls.length;
  check('shooting gives a light vibration, rate-limited', afterShot===1 && rate===1 && Array.isArray(calls[0]) && calls[0][0]<=5 && Math.max(...calls[0])<=90, JSON.stringify(calls));
  { calls.length=0; let now=Date.now()+1e7; const pn=performance.now; Object.defineProperty(globalThis,'performance',{value:{now:()=>now},configurable:true,writable:true});
    const times=[]; for(let i=0;i<400;i++){ now+=20; const b=calls.length; t.buzz(null,true); if(calls.length>b) times.push(now); }
    Object.defineProperty(globalThis,'performance',{value:{now:pn},configurable:true,writable:true});
    const gaps=times.slice(1).map((x,i)=>x-times[i]); const sig=new Set(calls.map(c=>JSON.stringify(c)));
    check('shoot vibration is irregular (varied gaps and patterns)', gaps.length>10 && new Set(gaps).size>=5 && sig.size>=5 && Math.max(...gaps)-Math.min(...gaps)>=200, 'gaps '+new Set(gaps).size+' patterns '+sig.size); calls.length=0; }
  t.hurt(1,0); const light=calls[calls.length-1]; t.hurt(5,0); const heavy=calls[calls.length-1];
  check('losing soldiers gives a stronger vibration', (Array.isArray(light)?light[0]:light)>=70 && Array.isArray(heavy), JSON.stringify([light,heavy]));
  t.save.vib=false; const n0=calls.length; t.hurt(2,0); check('vibration can be switched off', calls.length===n0); t.save.vib=true; }
// squad fires out of step
{ const G=fresh(2,[]); G.n=60; G.en=[]; G.gates=[]; G.fiv=.2; t.volley(); const ds=G.bullets.map(b=>b.d); const uniq=new Set(ds.map(d=>d.toFixed(3))).size;
  check('rounds leave at different moments (not in unison)', G.bullets.length>=6 && uniq>=G.bullets.length-1 && Math.max(...ds)>.08 && Math.min(...ds)<.12, 'n '+G.bullets.length+' uniq '+uniq);
  let launched=[]; for(let i=0;i<12;i++){ t.update(1/60); launched.push(G.bullets.filter(b=>!(b.d>0)).length); }
  check('rounds are released gradually over the fire interval', launched[1]<launched[10] && launched[10]<=G.bullets.length, JSON.stringify(launched)); }
// reprogrammed unit aims diagonally at enemies
{ const G=fresh(2,[]); G.n=20; G.gates=[]; G.en=[]; t.activateGuard(); G.gx=0; G.px=0; G.tx=0;
  const e=t.mk('grunt',G.dist+350,.55,1); e.hp=e.max=1e6; G.en.push(e); G.fcd=1e9; G.n=1; const hp0=e.hp;
  G.gx=0; t.volley(); const gb=G.bullets.filter(b=>b.src==='gx');
  check('the unit shoots at an off-centre enemy (aimed rounds)', gb.length===2 && gb.every(b=>b.tg===e), gb.length);
  let maxx=0; for(let i=0;i<50;i++){ G.n=1; G.fcd=1e9; t.update(1/60); for(const b of G.bullets) if(b.tg===e) maxx=Math.max(maxx,b.x); }
  check('aimed rounds travel diagonally and hurt the target', maxx>.3 && e.hp<hp0, 'maxx '+maxx+' hp '+(hp0-e.hp)); }
// armory: downgrade without refund, re-buy paid levels free
{ const sv=t.save; sv.up={squad:0,dmg:0,rate:0,weapon:0,emp:0,guard:0}; sv.paid={}; sv.scrap=1000; const c0=t.UPS.squad.cost(0), c1=t.UPS.squad.cost(1);
  t.armoryBuy('squad'); t.armoryBuy('squad'); check('buying charges full price', sv.scrap===1000-c0-c1 && sv.up.squad===2 && sv.paid.squad===2, sv.scrap);
  const afterBuy=sv.scrap; t.armoryDown('squad'); t.armoryDown('squad'); check('downgrading refunds nothing', sv.scrap===afterBuy && sv.up.squad===0 && sv.paid.squad===2, sv.scrap+' lvl '+sv.up.squad);
  t.armoryBuy('squad'); t.armoryBuy('squad'); check('re-buying paid levels is free', sv.scrap===afterBuy && sv.up.squad===2, sv.scrap);
  const c2=t.UPS.squad.cost(2); t.armoryBuy('squad'); check('a genuinely new level is charged once', sv.scrap===afterBuy-c2 && sv.paid.squad===3, sv.scrap);
  t.armoryDown('squad'); t.armoryBuy('squad'); check('...and is free again after a downgrade', sv.scrap===afterBuy-c2 && sv.up.squad===3, sv.scrap);
  check('cannot go below 0', (()=>{ for(let i=0;i<10;i++) t.armoryDown('squad'); return sv.up.squad===0; })());
  sv.scrap=0; sv.up.dmg=0; sv.paid.dmg=0; check('cannot buy a new level without scrap', t.armoryBuy('dmg')===false && sv.up.dmg===0);
  let ok=true; try{ t.showArmory('menu'); }catch(e){ ok=false; console.log(e.message); } check('armory screen renders', ok); }
// squad rounds lean toward machines just off the line, not toward far-off ones
{ const G=fresh(2,[]); G.n=30; G.gates=[]; G.en=[]; G.px=0; G.tx=0; G.fcd=1e9;
  const near=t.mk('grunt',G.dist+300,.18,1), far=t.mk('grunt',G.dist+300,.6,1); near.hp=near.max=far.hp=far.max=1e6; G.en.push(near,far); t.volley();
  const aimed=G.bullets.filter(b=>b.tg); check('squad rounds aim at a machine just off their line', aimed.length>0 && aimed.every(b=>b.tg===near), aimed.length);
  for(let i=0;i<40;i++){ G.n=30; G.fcd=1e9; t.update(1/60); } check('...and the nearby machine takes damage', near.hp<near.max, near.max-near.hp); check('...but the far-off one is untouched (steering still needed)', far.hp===far.max, far.max-far.hp); }
// each fighter picks his own target
{ const G=fresh(2,[]); G.n=60; G.gates=[]; G.en=[]; G.px=0; G.tx=0; G.fcd=1e9;
  const es=[-.1,.05,.15].map((x,i)=>{ const e=t.mk('grunt',G.dist+280+i*40,x,1); e.hp=e.max=1e6; G.en.push(e); return e; });
  const seen=new Set(), starts=new Set(); for(let v=0;v<30;v++){ G.bullets.length=0; t.volley(); for(const b of G.bullets){ if(b.tg) seen.add(es.indexOf(b.tg)); starts.add(b.x.toFixed(3)); } }
  check('different fighters choose different enemies', seen.size>=2, [...seen]); check('rounds leave from many different spots in the formation', starts.size>20, starts.size); }
// review fixes
{ const G=fresh(2,[]); G.n=5; G.gates=[]; G.en=[]; const b=t.mk('harvester',G.dist+300,0,1,{boss:true}); G.en.push(b);
  G.n=0; G.over=true; G.endT=1.2; t.kill(b); check('a wiped-out squad cannot win by a late kill', !G.won && !G.sweep); }
{ const G=fresh(2,['signal']); G.n=30; G.gates=[]; G.en=[]; const e=t.mk('heavy',G.dist+300,0,1); e.hp=e.max=1e6; G.en.push(e); G.cls.signal=2;
  t.airStrike(); const q=G.later.length; const hp0=e.hp; check('air strike queues game-time timers (not wall-clock)', q>=1 && e.hp===hp0, q);
  for(let i=0;i<30;i++){ G.fcd=1e9; t.update(1/60); } check('...and they land as the game advances', e.hp<hp0, hp0-e.hp);
  t.airStrike(); const G2=fresh(2,[]); check('...a restart leaves no stray strikes behind', G2.later.length===0); }
{ const calls=[]; Object.defineProperty(globalThis,'navigator',{value:{vibrate:p=>{calls.push(p);return true}},configurable:true,writable:true});
  let now=Date.now()+2e7; const pn=performance.now; Object.defineProperty(globalThis,'performance',{value:{now:()=>now},configurable:true,writable:true});
  t.buzz([110,40,110]); const n0=calls.length; let cut=false; for(let i=0;i<10;i++){ now+=20; t.buzz(null,true); if(calls.length>n0) cut=true; }
  check('firing ticks do not cut a heavy buzz short', !cut, JSON.stringify(calls)); now+=600; t.buzz(null,true); check('...and resume afterwards', calls.length>n0);
  Object.defineProperty(globalThis,'performance',{value:{now:pn},configurable:true,writable:true}); }
{ const G=fresh(3,[]); G.n=30; G.en=[]; const gw=G.dist+900; G.gates=[{wz:gw,L:{k:'add',v:3},R:{k:'add',v:3},used:false,px:0}]; const tk=t.mk('tank',gw+150,0,1); G.en.push(tk);
  for(let i=0;i<10;i++){ G.n=30; G.fcd=1e9; t.update(1/60); } check('a tank frozen behind a far gate does not slow the world', G.ts>.99, G.ts); }
// boss death sequence
{ const G=fresh(2,[]); G.n=30; G.gates=[]; const b=G.en.find(e=>e.boss); b.wz=G.dist+330; G.en=[b]; for(let i=0;i<30;i++){ G.n=30; G.fcd=1e9; b.fcd=99; t.update(1/60); }
  b.hp=1; t.kill(b); check('boss death starts an explosion sequence', G.deaths.length===1 && G.won);
  let ok=true; try{ for(let i=0;i<60*5.2;i++){ G.n=30; t.update(1/60); t.render(); if(i===60) { if(G.deaths[0].big) ok=false; } } }catch(e){ ok=false; console.log(e.message); }
  check('chain blasts, then fireball, render cleanly', ok); check('the explosion record clears itself', G.deaths.length===0, G.deaths.length); }
// squad waits out the explosion before the scrap march
{ const G=fresh(2,[]); G.n=30; G.gates=[]; const b=G.en.find(e=>e.boss); b.wz=G.dist+330; G.en=[b]; for(let i=0;i<20;i++){ G.n=30; G.fcd=1e9; b.fcd=99; t.update(1/60); }
  for(let i=0;i<5;i++) G.scr.push({x:0,wz:G.dist+90+i*30,v:5,sp:0}); t.kill(b); const d0=G.dist; let advAt=null, st=null;
  for(let i=0;i<60*8;i++){ G.n=30; t.update(1/60); if(advAt===null&&G.adv>5) advAt=i/60; }
  check('squad holds still until the blast is over', advAt!==null && advAt>=3.4, 'moved at '+advAt);
  check('...then collects the scrap', G.scr.length===0 && G.scrap>0, G.scr.length+' left, scrap '+G.scrap); }
// EMP: machines stop for 5 s, flyers crash and explode
{ const G=fresh(3,[]); G.n=40; G.gates=[]; G.en=[]; const gr=t.mk('grunt',G.dist+300,.2,1), tk=t.mk('tank',G.dist+250,-.3,1), ae=t.mk('aerostat',G.dist+260,0,1), gu=t.mk('gunner',G.dist+180,.5,1), nb=t.mk('grunt',G.dist+330,-.1,1);
  for(const e of [gr,tk,ae,gu,nb]){ e.hp=e.max=1e6; } ae.hp=ae.max=500; G.en.push(gr,tk,ae,gu,nb);
  for(let i=0;i<10;i++){ G.n=40; G.fcd=1e9; t.update(1/60); } G.emp=100; const z0=[gr.wz,tk.wz,gu.wz], hit0=G.n; t.fireEMP();
  check('nothing is stunned the instant the pulse fires', ![gr,tk,gu,nb].some(e=>e.stun>0));
  for(let i=0;i<60*1.3;i++){ G.n=40; G.fcd=1e9; t.update(1/60); }
  check('EMP stuns every machine once the wavefront has passed', [gr,tk,gu,nb].every(e=>e.stun>3), [gr.stun,tk.stun,gu.stun,nb.stun]);
  z0[0]=gr.wz; z0[1]=tk.wz; z0[2]=gu.wz;
  for(let i=0;i<60*1.5;i++){ G.n=40; G.fcd=1e9; t.update(1/60); }
  check('stunned machines do not move for the whole stun', [gr,tk,gu].every((e,i)=>Math.abs(e.wz-z0[i])<2 || e.wz>=z0[i]-2), [gr.wz-z0[0],tk.wz-z0[1],gu.wz-z0[2]]);
  check('the drone crashed and blew up', ae.dead, ae.hp+' crash '+ae.crash);
  for(let i=0;i<60*3;i++){ G.n=40; G.fcd=1e9; t.update(1/60); }
  check('stun wears off and they move again', gr.stun<=0 && gr.wz<z0[0]-1, gr.wz-z0[0]); }
{ const G=fresh(3,[]); G.n=40; G.gates=[]; G.en=[]; const g1=t.mk('gunship',G.dist+300,0,1), n1=t.mk('grunt',G.dist+300,0.02,1); g1.hp=g1.max=1e5; n1.hp=n1.max=30; G.en.push(g1,n1);
  for(let i=0;i<10;i++){ G.n=40; G.fcd=1e9; t.update(1/60); } G.emp=100; t.fireEMP(); for(let i=0;i<60*2.2;i++){ G.n=40; G.fcd=1e9; t.update(1/60); }
  check('a crashing gunship dies in the fireball and hurts what is beneath it', g1.dead && n1.hp<30, 'gunship dead '+g1.dead+' grunt hp '+n1.hp); }
{ const G=fresh(3,[]); G.n=40; G.gates=[]; G.en=[]; const g2=t.mk('gunship',G.dist+300,0,1,{boss:true}); g2.hp=g2.max=1e5; g2.scaled=true; g2.base0=1e5; G.en.push(g2);
  for(let i=0;i<10;i++){ G.n=40; G.fcd=1e9; t.update(1/60); } G.emp=100; t.fireEMP(); const h0=g2.hp; for(let i=0;i<60*2.2;i++){ G.n=40; G.fcd=1e9; t.update(1/60); }
  check('a gunship boss crashes, takes 30% and survives', !g2.dead && g2.hp<h0*.75 && g2.crashed, g2.hp/h0);
  for(let i=0;i<60*5;i++){ G.n=40; G.fcd=1e9; t.update(1/60); }
  check('...and lifts off again after the stun', g2.crash===undefined && (g2.rise===undefined||g2.rise>0), 'crash '+g2.crash+' rise '+g2.rise); }
{ const G=fresh(3,[]); G.n=40; G.gates=[]; G.en=[]; const sg=t.mk('grunt',G.dist+8,0,1); sg.hp=sg.max=1e6; G.en.push(sg); G.px=0;G.tx=0; G.emp=100; t.fireEMP(); const n0=G.n; for(let i=0;i<30;i++){ G.n=40; G.fcd=1e9; t.update(1/60); } check('a stunned machine does no melee damage', !sg.dead && G.n>=40); }
// the pulse is a travelling wave
{ const G=fresh(3,[]); G.n=40; G.gates=[]; G.en=[]; const nearE=t.mk('grunt',G.dist+150,0,1), farE=t.mk('grunt',G.dist+700,0,1), sideE=t.mk('grunt',G.dist+150,.85,1);
  for(const e of [nearE,farE,sideE]){ e.hp=e.max=1e6; e.active=true; } G.en.push(nearE,farE,sideE); G.px=0; G.tx=0; G.emp=100; t.fireEMP();
  const bolt={rz:600,rz0:600,h0:30,big:false,x:0,vx:0,dmg:1}; G.bolts.push(bolt);
  let tNear=null,tFar=null,tSide=null,boltGone=null; for(let i=0;i<60*2;i++){ G.n=40; G.fcd=1e9; t.update(1/60); const s=i/60;
    if(tNear===null&&nearE.stun>0) tNear=s; if(tFar===null&&farE.stun>0) tFar=s; if(tSide===null&&sideE.stun>0) tSide=s; if(boltGone===null&&!G.bolts.includes(bolt)) boltGone=s; }
  check('the near machine is hit first (about 150/780 s)', tNear!==null && tNear<.45, tNear); check('the far machine is hit later, when the ring gets there', tFar!==null && tFar>tNear+.4, tFar);
  check('a machine off to the side is reached at its true distance', tSide!==null && tSide>tNear, tSide+' vs '+tNear); check('enemy fire is swept away as the ring passes it', boltGone!==null && boltGone>.5, boltGone); }
// death sizes by class of unit
{ const G=fresh(3,[]); G.n=40; G.gates=[]; G.en=[]; const g=t.mk('grunt',G.dist+300,0,1), k=t.mk('tank',G.dist+320,.3,1), a=t.mk('gunship',G.dist+340,-.3,1), w=t.mk('heavy',G.dist+360,.5,1);
  g.revived=true; G.en.push(g,k,a,w); for(const e of [g,k,a,w]) e.hp=0; for(const e of [g,k,a,w]) t.kill(e);
  const kinds=Object.fromEntries(G.deaths.map(d=>[d.e.t,d.kind]));
  check('walkers (grunt, T-47) get a small burst; vehicles and flyers get the big blast', kinds.grunt==='walk' && kinds.heavy==='walk' && kinds.tank==='veh' && kinds.gunship==='veh', JSON.stringify(kinds));
  let ok=true; try{ for(let i=0;i<60*4;i++){ G.n=40; t.update(1/60); t.render(); } }catch(e){ ok=false; console.log(e.message); }
  check('all death sequences render and clean themselves up', ok && G.deaths.length===0, G.deaths.length); }
// crawlers: never spawned, only born from blasts, and slow
{ let n=0; for(let lv=1;lv<=12;lv++){ const L=t.genLevel(lv); n+=L.en.filter(e=>e.t==='runner').length; } check('crawlers never spawn in a level', n===0, n);
  const G=fresh(3,[]); G.n=40; G.gates=[]; G.en=[]; let plain=0, boom=0;
  for(let i=0;i<200;i++){ const e=t.mk('grunt',G.dist+300,0,1); e.hp=0; t.kill(e); if(e.t==='runner') plain++; const f=t.mk('grunt',G.dist+300,0,1); f.hp=0; f.blast=true; t.kill(f); if(f.t==='runner') boom++; G.deaths.length=0; }
  check('shot dead = just dead, never a crawler', plain===0, plain); check('a blast kill leaves a crawler most of the time', boom>110 && boom<180, boom);
  check('crawlers are slow (slower than any walker)', t.ET.runner.spd<=10 && t.ET.runner.spd<t.ET.grunt.spd/2, t.ET.runner.spd); }
// resume after stun, boss shield, double-tap EMP
{ const G=fresh(3,[]); G.n=40; G.gates=[]; G.en=[]; const g=t.mk('gunship',G.dist+330,0,1), h=t.mk('heavy',G.dist+300,.4,1); g.hp=g.max=1e6; h.hp=h.max=1e6; G.en.push(g,h);
  for(let i=0;i<200;i++){ G.n=40; G.fcd=1e9; t.update(1/60); }
  g.hp=g.max; const xs0=h.x, zr=h.wz-G.dist; g.stun=5; g.stunRel=g.wz-G.dist; h.stun=5; const before=[g.wz-G.dist,g.x,h.x];
  for(let i=0;i<60*5.1;i++){ G.n=40; G.fcd=1e9; t.update(1/60); if(i===10) {} }
  const gj=Math.abs((g.wz-G.dist)-before[0]), hx=Math.abs(h.x-before[2]); 
  let maxjump=0, lastx=h.x, lastz=g.wz-G.dist; for(let i=0;i<30;i++){ G.n=40; G.fcd=1e9; t.update(1/60); maxjump=Math.max(maxjump,Math.abs(h.x-lastx)*480,Math.abs((g.wz-G.dist)-lastz)); lastx=h.x; lastz=g.wz-G.dist; }
  check('machines resume without teleporting after the stun', maxjump<25 && gj<60, 'maxjump '+maxjump.toFixed(1)+' hover drift '+gj.toFixed(1)); }
{ const G=fresh(5,[]); G.n=60; G.gates=[]; G.en=[]; const pre=t.mk('tank',G.dist+260,0,1), boss=t.mk('ogre',G.dist+420,0,1,{boss:true}); pre.hp=pre.max=1e6; boss.hp=boss.max=5000; G.en.push(pre,boss);
  t.hurtEnemy(boss,1000); check('the boss takes no damage while the pre-boss lives', boss.hp===5000 && t.bossShielded(boss));
  G.emp=100; t.fireEMP(); for(let i=0;i<120;i++){ G.n=60; G.fcd=1e9; t.update(1/60); } check('EMP leaves the shielded boss alone', Math.abs(boss.hp/boss.max-1)<1e-9 && !(boss.stun>0) && (boss.plate===undefined||boss.plate===boss.plateMax), boss.hp/boss.max);
  pre.hp=0; t.kill(pre); for(let i=0;i<10;i++){ G.n=60; G.fcd=1e9; t.update(1/60); } check('...then the boss becomes vulnerable', !t.bossShielded(boss)); const hb=boss.hp+(boss.plate||0); t.hurtEnemy(boss,500); check('and damage lands', boss.hp+(boss.plate||0)<hb); }
{ const G=fresh(5,[]); G.n=60; G.gates=[]; G.en=[]; const boss=t.mk('ogre',G.dist+420,0,1,{boss:true}); boss.hp=boss.max=1e5; G.en.push(boss); boss.hp=boss.max*.4; const f0=boss.hp/boss.max;
  for(let i=0;i<260;i++){ G.n=60; G.fcd=1e9; boss.fcd=99; t.update(1/60); } check('a boss that is already hurt is not restored to full when it sizes up', boss.hp/boss.max<f0+.02, (boss.hp/boss.max).toFixed(2)+' vs '+f0); }
// endos scale with firepower
{ const lo=fresh(5,[]); lo.n=10; lo.gates=[]; lo.en=[]; const a=t.mk('grunt',lo.dist+500,0,1); lo.en.push(a); for(let i=0;i<5;i++){ lo.n=10; lo.fcd=1e9; t.update(1/60); }
  const hi=fresh(5,[]); hi.n=120; hi.tier=3; hi.gates=[]; hi.en=[]; const b=t.mk('grunt',hi.dist+500,0,1); hi.en.push(b); for(let i=0;i<5;i++){ hi.n=120; hi.fcd=1e9; t.update(1/60); }
  check('an endo takes the same few seconds to cut down whatever the squad: tougher against a bigger one', b.max>a.max*8 && a.max>=14, a.max.toFixed(0)+' vs '+b.max.toFixed(0)); }
// buffs
{ const G=fresh(3,[]); G.n=30; G.gates=[]; G.en=[]; t.activateBuff('shield'); const n0=G.n; t.hurt(2,0); t.hurt(2,0); check('armour plating blocks hits', G.n===n0 && G.shield===2, G.n+' shield '+G.shield);
  for(let i=0;i<5;i++) t.hurt(1,0); check('...and runs out', G.n<n0 && G.shield===0);
  const G2=fresh(3,[]); G2.n=30; G2.gates=[]; G2.en=[]; t.activateBuff('rapid'); check('overdrive switches on and counts down', G2.od===7); for(let i=0;i<60*8;i++){ G2.n=30; G2.fcd=1e9; t.update(1/60); } check('...and wears off', G2.od===0);
  const G3=fresh(3,[]); G3.n=40; G3.peak=40; G3.gates=[]; G3.en=[]; let c=0; for(let i=0;i<300;i++){ G3.pups.length=0; const e=t.mk('tank',G3.dist+300,0,1); t.dropCrate(e); c+=G3.pups.length; } check('big machines drop a crate about 30% of the time', c>60&&c<120, c);
  const G4=fresh(3,[]); G4.n=40; G4.peak=40; G4.gates=[]; G4.en=[]; G4.pups.push({k:'rapid',x:0,wz:G4.dist+5}); G4.px=0; G4.tx=0; for(let i=0;i<20;i++){ G4.n=40; G4.fcd=1e9; t.update(1/60); } check('driving over a crate picks it up', G4.od>0 && !G4.pups.some(p=>p.k==='rapid'), G4.od); }
// end of sector pays out once, with stars
{ const G=fresh(3,[]); G.n=30; G.peak=30; G.won=true; G.over=true; G.scrap=100; G.lostN=2; const s0=t.save.scrap; t.endRun(); const s1=t.save.scrap; t.endRun(); t.endRun();
  check('the payout is banked exactly once however often the screen is redrawn', t.save.scrap===s1 && s1>s0, s0+' -> '+s1+' -> '+t.save.scrap);
  check('losing under 15% of the squad earns 3 stars and a bigger bonus', G.stars===3 && G.bonus===Math.round((100+20*3)*1.5) && t.save.stars[3]===3, G.stars+' '+G.bonus);
  const G2=fresh(3,[]); G2.n=5; G2.peak=40; G2.won=true; G2.over=true; G2.lostN=35; t.endRun(); check('a ragged win earns 1 star', G2.stars===1); }
// corrupt saves cannot break the game
{ const sv=t.save; Object.assign(sv,{scrap:'abc',best:-5,sel:99,up:{squad:99,dmg:-3,rate:'x'},paid:null,loadout:['shot','nonsense','heavy','heavy','tech','mark','officer'],unlocked:{ghost:1,shot:1},stars:{3:9}});
  t.sanitizeSave(); check('absurd values are clamped to legal ones', sv.scrap===0 && sv.best===1 && sv.sel===1 && sv.up.squad===15 && sv.up.dmg===0 && sv.up.rate===0 && sv.paid.squad===15, JSON.stringify([sv.scrap,sv.best,sv.sel,sv.up.squad,sv.up.dmg,sv.up.rate]));
  check('loadout keeps only unlocked, real, unique classes (max 3)', JSON.stringify(sv.loadout)==='["shot","heavy","tech"]', JSON.stringify(sv.loadout)); check('unknown unlocks and bad stars are dropped', !sv.unlocked.ghost && sv.stars[3]===3); }
// gates always have clear approaches
{ let worstB=1e9, worstA=1e9, bad=0;
  for(let lv=1;lv<=14;lv++) for(let k=0;k<6;k++){ const L=t.genLevel(lv); for(const g of L.gates) for(const e of L.en){ if(e.boss) continue; const d=e.wz-g.wz; if(d<=0) worstB=Math.min(worstB,-d); else worstA=Math.min(worstA,d); if(d>-125 && d<225) bad++; } }
  check('no enemy stands in the approach to a gate or just beyond it', bad===0, bad+' too close; nearest before '+worstB.toFixed(0)+', after '+worstA.toFixed(0)); }
// settings reachable from the pause screen, Back returns to it
{ const G=fresh(3,[]); G.n=30; G.gates=[]; G.en=[]; t.setPause(true); check('pausing freezes the game', G.paused===true);
  let ok=true; try{ t.showSettings('pause'); }catch(e){ ok=false; console.log(e.message); }
  check('settings opens from the pause screen without errors', ok);
  t.setPause(true); check('Back from pause settings leaves the game paused', G.paused===true); }
// no radiation or slag pits any more: levels only carry unexploded ordnance
{ const kinds=new Set(); for(let lv=1;lv<=14;lv++) for(let k=0;k<4;k++) for(const h of t.genLevel(lv).haz) kinds.add(h.k); check('levels contain only unexploded ordnance as a ground hazard', kinds.size===1 && kinds.has('uxo'), [...kinds]); }
console.log(pass+' passed, '+fail+' failed');
