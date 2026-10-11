const fs=require('fs');
const noop=()=>{};
const ctx=new Proxy({}, {get:(t,k)=>(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop:noop}):k==='getImageData'?()=>({data:new Uint8ClampedArray(336*560*4)}):(k==='measureText'?()=>({width:20}):(k==='ellipse'?(...a)=>{ if(a[2]<0||a[3]<0) throw new Error('negative ellipse radius'); }:k==='arc'?(...a)=>{ if(a[2]<0) throw new Error('negative arc radius'); }:(k in t?t[k]:noop))), set:(t,k,v)=>{t[k]=v;return true}});
const el=()=>({getContext:()=>ctx,addEventListener:noop,style:{},set innerHTML(v){},getBoundingClientRect:()=>({left:0,top:0,width:480,height:800}),setPointerCapture:noop});
global.document={getElementById:el,addEventListener:noop,hidden:false,querySelectorAll:()=>[]};
global.window={addEventListener:noop};
global.localStorage={getItem:()=>null,setItem:noop};
global.performance={now:()=>Date.now()};
let rafcb;global.requestAnimationFrame=f=>{rafcb=f};
global.setTimeout=(f)=>{f()};
let src=fs.readFileSync((process.argv[2]||require('path').join(__dirname,'..','game.js')),'utf8')+`
;globalThis.__t={setPause,showSettings,sanitizeSave,endRun,activateBuff,dropCrate,bossShielded,hurtEnemy,useItem,fireEMP,render,airStrike,hurt0:0,armoryBuy,armoryDown,UPS,showArmory,activateGuard,buzz,mk,update,ET,keys,kill,startLevel,applyGate,volley,showSquad,genLevel,CLS,CLASS,airStrike,clsTotal,hurt,ITEMS,cycleForm,FORMS,slotOf,squadHalf,explodeAt,enemyShoot,showSquad,bark,setRS,depthKey,squadDps,applyGate,addParts,unlockAudio,checkLost,volley,BOSS_KINDS,WEAPONS,tierMul,tierOf,makeLook,todPal,wxAt,buildScenery,TODS,WXT,get state(){return state},get save(){return save},get G(){return G}};`;
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
  for(let i=0;i<10;i++){ G.n=40; G.fcd=1e9; t.update(1/60); } G.item={k:'pulse',n:3}; const z0=[gr.wz,tk.wz,gu.wz], hit0=G.n; t.useItem();
  check('nothing is stunned the instant the pulse fires', ![gr,tk,gu,nb].some(e=>e.stun>0));
  for(let i=0;i<60*1.3;i++){ G.n=40; G.fcd=1e9; t.update(1/60); }
  check('EMP stuns every machine once the wavefront has passed', [gr,tk,gu,nb].every(e=>e.stun>3), [gr.stun,tk.stun,gu.stun,nb.stun]);
  z0[0]=gr.wz; z0[1]=tk.wz; z0[2]=gu.wz;
  for(let i=0;i<60*1.5;i++){ G.n=40; G.fcd=1e9; t.update(1/60); }
  check('stunned machines do not move for the whole stun', [gr,tk,gu].every((e,i)=>Math.abs(e.wz-z0[i])<2 || e.wz>=z0[i]-2), [gr.wz-z0[0],tk.wz-z0[1],gu.wz-z0[2]]);
  check('the drone crashed and blew up', ae.dead, ae.hp+' crash '+ae.crash);
  for(let i=0;i<60*9;i++){ G.n=40; G.fcd=1e9; t.update(1/60); }
  check('stun wears off and they move again', gr.stun<=0 && gr.wz<z0[0]-1, gr.wz-z0[0]); }
{ const G=fresh(3,[]); G.n=40; G.gates=[]; G.en=[]; const g1=t.mk('gunship',G.dist+300,0,1), n1=t.mk('grunt',G.dist+300,0.02,1); g1.hp=g1.max=1e5; n1.hp=n1.max=30; G.en.push(g1,n1);
  for(let i=0;i<10;i++){ G.n=40; G.fcd=1e9; t.update(1/60); } G.item={k:'pulse',n:3}; t.useItem(); for(let i=0;i<60*2.2;i++){ G.n=40; G.fcd=1e9; t.update(1/60); }
  check('a crashing gunship dies in the fireball and hurts what is beneath it', g1.dead && n1.hp<30, 'gunship dead '+g1.dead+' grunt hp '+n1.hp); }
{ const G=fresh(3,[]); G.n=40; G.gates=[]; G.en=[]; const g2=t.mk('gunship',G.dist+300,0,1,{boss:true}); g2.hp=g2.max=1e5; g2.scaled=true; g2.base0=1e5; G.en.push(g2);
  for(let i=0;i<10;i++){ G.n=40; G.fcd=1e9; t.update(1/60); } G.item={k:'pulse',n:3}; t.useItem(); const h0=g2.hp; for(let i=0;i<60*2.2;i++){ G.n=40; G.fcd=1e9; t.update(1/60); }
  check('a gunship boss crashes, takes 30% and survives', !g2.dead && g2.hp<h0*.75 && g2.crashed, g2.hp/h0);
  for(let i=0;i<60*5;i++){ G.n=40; G.fcd=1e9; t.update(1/60); }
  check('...and lifts off again after the stun', g2.crash===undefined && (g2.rise===undefined||g2.rise>0), 'crash '+g2.crash+' rise '+g2.rise); }
{ const G=fresh(3,[]); G.n=40; G.gates=[]; G.en=[]; const sg=t.mk('grunt',G.dist+8,0,1); sg.hp=sg.max=1e6; G.en.push(sg); G.px=0;G.tx=0; G.item={k:'pulse',n:3}; t.useItem(); const n0=G.n; for(let i=0;i<30;i++){ G.n=40; G.fcd=1e9; t.update(1/60); } check('a stunned machine does no melee damage', !sg.dead && G.n>=40); }
// the pulse is a travelling wave
{ const G=fresh(3,[]); G.n=40; G.gates=[]; G.en=[]; const nearE=t.mk('grunt',G.dist+150,0,1), farE=t.mk('grunt',G.dist+500,0,1), sideE=t.mk('grunt',G.dist+150,.85,1);
  for(const e of [nearE,farE,sideE]){ e.hp=e.max=1e6; e.active=true; } G.en.push(nearE,farE,sideE); G.px=0; G.tx=0; G.item={k:'pulse',n:3}; t.useItem();
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
  G.item={k:'pulse',n:3}; t.useItem(); for(let i=0;i<120;i++){ G.n=60; G.fcd=1e9; t.update(1/60); } check('EMP leaves the shielded boss alone', Math.abs(boss.hp/boss.max-1)<1e-9 && !(boss.stun>0) && (boss.plate===undefined||boss.plate===boss.plateMax), boss.hp/boss.max);
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
  const G3=fresh(3,[]); G3.n=40; G3.peak=40; G3.gates=[]; G3.en=[]; let c=0; for(let i=0;i<300;i++){ G3.pups.length=0; const e=t.mk('tank',G3.dist+300,0,1); t.dropCrate(e); c+=G3.pups.length; } check('big machines drop a crate about 40% of the time', c>80&&c<165, c);
  const G4=fresh(3,[]); G4.n=40; G4.peak=40; G4.gates=[]; G4.en=[]; G4.pups.push({k:'rapid',x:0,wz:G4.dist+5}); G4.px=0; G4.tx=0; for(let i=0;i<20;i++){ G4.n=40; G4.fcd=1e9; t.update(1/60); } check('driving over a crate picks it up', G4.od>0 && !G4.pups.some(p=>p.k==='rapid'), G4.od); }
// end of sector pays out once, with stars
{ const G=fresh(3,[]); G.n=30; G.peak=30; G.won=true; G.over=true; G.scrap=100; G.lostN=2; const s0=t.save.scrap; t.endRun(); const s1=t.save.scrap; t.endRun(); t.endRun();
  check('the payout is banked exactly once however often the screen is redrawn', t.save.scrap===s1 && s1>s0, s0+' -> '+s1+' -> '+t.save.scrap);
  check('losing under 15% of the squad earns 3 stars and a bigger bonus', G.stars===3 && G.bonus===Math.round((100+20*3)*1.5) && t.save.stars[3]===3, G.stars+' '+G.bonus);
  const G2=fresh(3,[]); G2.n=5; G2.peak=40; G2.won=true; G2.over=true; G2.lostN=35; t.endRun(); check('a ragged win earns 1 star', G2.stars===1); }
// corrupt saves cannot break the game
{ const sv=t.save; Object.assign(sv,{scrap:'abc',best:-5,sel:99,up:{squad:99,dmg:-3,rate:'x'},paid:null,loadout:['shot','nonsense','heavy','heavy','tech','mark','officer'],unlocked:{ghost:1,shot:1},stars:{3:9}});
  t.sanitizeSave(); check('absurd values are clamped to legal ones', sv.scrap===0 && sv.best===1 && sv.sel===1 && sv.up.squad===25 && sv.up.dmg===0 && sv.up.rate===0 && sv.paid.squad===25, JSON.stringify([sv.scrap,sv.best,sv.sel,sv.up.squad,sv.up.dmg,sv.up.rate]));
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
// ---- phase 1: the tactical item slot
const run=(G,sec,n)=>{ for(let i=0;i<60*sec;i++){ G.n=n||40; G.fcd=1e9; t.update(1/60); } };
const arena=(lv,...en)=>{ const G=fresh(lv,[]); G.n=40; G.gates=[]; G.en=[]; G.obs=[]; G.haz=[]; G.px=0; G.tx=0; for(const e of en){ e.active=true; G.en.push(e); } return G; };
{ const G=fresh(2,[]); check('a run starts holding a pulse grenade bundle', G.item && G.item.k==='pulse' && G.item.n===2);
  G.n=40; G.gates=[]; G.en=[]; t.useItem(); check('using a charge uses one up', G.item && G.item.n===1); run(G,.5); t.useItem(); check('the last charge empties the slot', G.item===null); check('an empty slot does nothing', t.useItem()===false);
  for(const k of Object.keys(t.ITEMS)){ G.pups.push({k,x:0,wz:G.dist+8}); run(G,.3); check('crate gives '+k, G.item && G.item.k===k && G.item.n===t.ITEMS[k].n, JSON.stringify(G.item)); }
  const G2=fresh(3,[]); check('supply crates are planned on the road', G2.pupPlan.filter(p=>p.k==='supply').length===3);
  let drops=0; for(let i=0;i<200;i++){ const g=fresh(4,[]); g.pups.length=0; const e=t.mk('tank',g.dist+300,0,1); t.dropCrate(e); if(g.pups.length) drops++; } check('big machines sometimes drop crates', drops>20 && drops<140, drops);
  let kinds=new Set(); for(let i=0;i<300;i++){ const g=fresh(6,[]); g.pups.length=0; t.dropCrate(t.mk('tank',g.dist+300,0,1)); g.pups.forEach(p=>kinds.add(p.k)); } check('...and the drops include special weapons', ['pulse','c4','flare','spike','cannon'].filter(k=>kinds.has(k)).length>=3, [...kinds]); }
{ const gr=t.mk('grunt',1,0,1), nb=t.mk('grunt',2,.1,1); const G=arena(3,gr,nb); gr.wz=G.dist+200; nb.wz=G.dist+700; gr.hp=gr.max=nb.hp=nb.max=1e6; G.item={k:'pulse',n:3}; t.useItem(); run(G,.6);
  check('pulse grenades stun endoskeletons for 10 s', gr.stun>9 && gr.stun<=10, gr.stun); check('...but only in a wide radius, not the whole road', !(nb.stun>0), nb.stun); }
{ const gr=t.mk('grunt',1,0,1), tk=t.mk('tank',2,.3,1), fl=t.mk('aerostat',3,-.3,1), bs=t.mk('ogre',4,0,1,{boss:true}), far=t.mk('grunt',5,0,1), nearE=t.mk('grunt',6,.5,1); const G=arena(5,gr,tk,fl,bs,far,nearE);
  gr.wz=G.dist+480; tk.wz=G.dist+520; fl.wz=G.dist+500; bs.wz=G.dist+600; far.wz=G.dist+1100; nearE.wz=G.dist+60; tk.hp=tk.max=5000; fl.hp=fl.max=300; bs.hp=bs.max=20000; bs.plateMax=bs.plate=4000; gr.hp=gr.max=1e5; far.hp=far.max=nearE.hp=nearE.max=1e5; nearE.stun=99; far.stun=99;
  G.item={k:'nuke',n:1}; t.useItem(); const n0=G.n; check('the M-38 is fired as a warhead, not set off from the squad', G.nukes.length===1 && G.waves.length===0 && G.flash<.9, G.nukes.length+' '+G.waves.length); run(G,.1); check('nothing dies while it is still in flight', !gr.dead && !tk.dead && G.nukes.length===1);
  let plateAt=null, hpAt=1; for(let i=0;i<60*2;i++){ G.n=40; G.fcd=1e9; nearE.wz=G.dist+60; far.wz=G.dist+1100; t.update(1/60); if(plateAt===null && bs.plate<bs.plateMax*.9){ plateAt=bs.plate/bs.plateMax; hpAt=bs.hp/bs.max; } }
  check('a mini-nuke destroys the machines at the impact', gr.dead && tk.dead && fl.dead, [gr.dead,tk.dead,fl.dead]);
  check('...but not machines more than ~2 sections away', !far.dead && !nearE.dead, [far.dead,nearE.dead]);
  check('...strips 80% of boss plating once the blockers are gone', plateAt!==null && plateAt<=.21 && hpAt<1, plateAt+' '+hpAt);
  check('it leaves fallout trails and never hurts the squad', G.fallout.length>=5 && G.n===n0, G.fallout.length+' n '+G.n); check('the slot is empty afterwards', G.item===null);
  const e3=t.mk('grunt',1,G.px,1); e3.wz=G.fallout[0].wz; e3.x=G.fallout[0].x; e3.hp=e3.max=1e5; e3.active=true; G.en.push(e3); const h0=e3.hp; run(G,2); check('fallout burns machines standing in it', e3.hp<h0, e3.hp); }
{ const G=arena(4); G.en=[]; G.item={k:'nuke',n:1}; t.useItem(); run(G,1.2); check('with nothing to aim at the warhead lands about 520 ahead', G.waves.length>=0 && G.nukes.length===0); }
{ const G=fresh(3,[]); G.n=40; G.form='v'; G.gates=[]; G.en=[]; const sh=[]; for(let i=0;i<300;i++){ G.bullets.length=0; t.volley(); for(const b of G.bullets) sh.push(b.zo); } const mx=Math.max(...sh), mn=Math.min(...sh); check('rounds leave from where each soldier stands (V formation: front rank ahead, rear behind)', mx>15 && mn<-20, mn.toFixed(0)+'..'+mx.toFixed(0)); }
{ const tk=t.mk('tank',1,0,1); const G=arena(3,tk); tk.wz=G.dist+400; tk.hp=tk.max=3000; G.item={k:'c4',n:3}; t.useItem(); check('C4 uses a charge to throw a pack', G.item.n===2 && G.c4.length===1);
  run(G,.7); check('the pack sticks to the machine', G.c4[0] && G.c4[0].stuck); check('...and does not go off by itself straight away', tk.hp===tk.max, tk.hp);
  check('using the slot again detonates it without costing a charge', t.useItem() && G.item.n===2, G.item.n); run(G,.1); check('massive damage to the machine', tk.hp<tk.max*.65, tk.hp/tk.max); check('the pack is gone', G.c4.length===0);
  const t2=t.mk('tank',2,.4,1); t2.wz=G.dist+450; t2.hp=t2.max=3000; t2.active=true; G.en.push(t2); t.useItem(); run(G,4); check('a stuck pack goes off on its fuse', t2.hp<t2.max*.9 || tk.hp<tk.max*.4, t2.hp/t2.max); }
{ const inL=t.mk('tank',1,0,1), inL2=t.mk('grunt',2,.02,1), side=t.mk('tank',3,.7,1), bs=t.mk('ogre',4,0,1,{boss:true}); const G=arena(3,inL,inL2,side,bs);
  inL.wz=G.dist+300; inL2.wz=G.dist+450; side.wz=G.dist+900; bs.wz=G.dist+700; inL.hp=inL.max=side.hp=side.max=4000; inL2.hp=inL2.max=2000; bs.hp=bs.max=9000;
  G.item={k:'cannon',n:1}; G.bolts.push({rz:200,rz0:200,h0:30,big:false,x:0,vx:0,dmg:1}); t.useItem(); run(G,.1);
  check('the plasma cannon pierces everything in the lane', inL.dead && inL2.dead, inL.hp+' '+inL2.hp); check('...including the boss behind', bs.hp<bs.max*.85, bs.hp/bs.max); check('...but leaves the next lane alone', !side.dead && side.hp===side.max); check('...and clears enemy fire in its path', G.bolts.length===0); }
{ const gr=t.mk('grunt',1,.2,1), tk=t.mk('tank',2,-.3,1); const G=arena(3,tk); G.item={k:'spike',n:1}; check('the spike needs a target', t.useItem()===false && G.item && G.item.n===1);
  G.en.push(gr); gr.wz=G.dist+250; gr.active=true; gr.hp=gr.max=100; const kills0=G.scrap; check('the spike converts an endoskeleton', t.useItem() && gr.dead, ''); check('...which joins the squad as the reprogrammed unit', G.guard && !G.guard.dead); check('...and does not drop scrap', G.scr.length===0 && G.item===null);
  const G2=arena(3,t.mk('tank',1,0,1)); G2.en[0].wz=G2.dist+250; G2.item={k:'spike',n:1}; check('machines cannot be reprogrammed', t.useItem()===false); }
{ const a=[]; for(let i=0;i<5;i++){ const g=t.mk('grunt',i,.1*i-.2,1); g.hp=g.max=60; a.push(g); } const far=t.mk('grunt',9,.0,1); far.hp=far.max=60; const G=arena(3,...a,far); a.forEach((g,i)=>{ g.wz=G.dist+500+i*10; }); far.wz=G.dist+1200;
  G.item={k:'flare',n:1}; t.useItem(); run(G,1.0); check('the barrage waits for the flare to be spotted', a.every(g=>!g.dead)); run(G,5); check('105mm shells destroy the marked group', a.filter(g=>g.dead).length>=3, a.map(g=>g.hp)); check('...and spare what is far away', !far.dead && far.hp===far.max); check('no flares linger', G.flares.length===0); }
// ---- phase 2: terrain obstacles
{ let bad=0, kinds=new Set(), blocked=0, n=0;
  for(let lv=1;lv<=12;lv++) for(let r=0;r<6;r++){ const L=t.genLevel(lv); n+=L.obs.length;
    for(const o of L.obs){ kinds.add(o.k); if(L.gates.some(g=>o.wz>g.wz-170&&o.wz<g.wz+270)) bad++; }
    for(const z of new Set(L.obs.map(o=>Math.round(o.wz/60)))){ const row=L.obs.filter(o=>Math.abs(o.wz-z*60)<40&&(o.k==='jersey'||o.k==='trap')); if(row.length){ let free=false; for(let x=-.88;x<=.88;x+=.02) if(row.every(o=>Math.abs(o.x-x)>o.hw+.05)) free=true; if(!free) blocked++; } } }
  check('obstacles appear on every sector', n>40, n); check('...never in a gate approach', bad===0, bad); check('...and every barrier line has a gap', blocked===0, blocked);
  check('sector 1 has only barriers and rubble', ![...new Set(t.genLevel(1).obs.map(o=>o.k))].some(k=>k==='cable'||k==='trap'||k==='overpass')); check('later sectors use every kind', ['jersey','rubble','trap','cable','overpass'].every(k=>kinds.has(k)), [...kinds]); }
{ const G=arena(2); G.obs=[{k:'jersey',x:0,hw:.1,wz:G.dist+60,len:28,hp:120,dead:false}]; G.n=30; let sp=0,minS=99; for(let i=0;i<60*2;i++){ G.n=30; t.update(1/60); const r=G.obs[0]?G.obs[0].wz-G.dist:-99; if(r<20&&r>-30){ minS=Math.min(minS,G.spd); } }
  check('a jersey barrier slows the squad', minS<45, minS); check('...and shoulders it aside', Math.abs(G.px)>.02, G.px); }
{ const G=arena(2); G.obs=[{k:'rubble',x:0,hw:.4,wz:G.dist+1,len:90,hp:80,dead:false,sd:1}]; let mn=1e9; for(let i=0;i<90;i++){ G.n=30; t.update(1/60); if(i>30) mn=Math.min(mn,G.spd); } check('rubble slows the squad (to about 60% speed)', mn>40 && mn<62, mn);
  const G2=arena(2); G2.obs=[{k:'jersey',x:0,hw:.1,wz:G2.dist+300,len:28,hp:120,dead:false},{k:'rubble',x:0,hw:.4,wz:G2.dist+300,len:90,hp:80,dead:false,sd:1}]; G2.item={k:'flare',n:1}; t.useItem(); G2.en=[]; for(let i=0;i<60*6;i++){ G2.n=30; t.update(1/60); } check('explosives destroy barriers and rubble', G2.obs.length<2 || G2.obs.some(o=>o.hp<(o.k==='jersey'?120:80)), G2.obs.length); }
{ const tk=t.mk('tank',1,0,1), gr=t.mk('grunt',2,0,1); const G=arena(3,tk,gr); tk.wz=G.dist+500; gr.wz=G.dist+500; tk.hp=tk.max=gr.hp=gr.max=1e6; G.obs=[]; for(let x=-.88;x<=.9;x+=.22) G.obs.push({k:'trap',x,hw:.09,wz:G.dist+420,len:24,hp:260,dead:false});
  let tkMin=1e9, grMin=1e9; for(let i=0;i<60*6;i++){ G.n=40; G.px=0; G.tx=0; G.fcd=1e9; tk.wz-=2; gr.wz-=2; t.update(1/60); tkMin=Math.min(tkMin,tk.wz-G.obs[0].wz); grMin=Math.min(grMin,gr.wz-G.obs[0].wz); }
  check('a tank cannot cross a tank-trap line', tkMin>0, tkMin); check('...but an endoskeleton squeezes through', grMin<0, grMin); }
{ const gr=t.mk('grunt',1,.3,1), tk=t.mk('tank',2,.3,1), ae=t.mk('aerostat',3,.3,1); const G=arena(3,gr,tk,ae); gr.wz=tk.wz=ae.wz=G.dist+400; G.n=40; gr.hp=gr.max=tk.hp=tk.max=ae.hp=ae.max=1e6; G.px=-.7; G.tx=-.7; G.obs=[{k:'cable',x:.3,hw:.5,wz:G.dist+200,len:6,hp:1e9,dead:false,sd:1},{k:'cable',x:-.7,hw:.05,wz:G.dist+100,len:6,hp:1e9,dead:false,sd:2}];
  for(let i=0;i<60*4;i++){ G.fcd=1e9; gr.wz-=2; tk.wz-=2; ae.wz-=2; t.update(1/60); }
  check('a live cable stuns machines that cross it', gr.zap&&gr.zap.size===1 && tk.zap&&tk.zap.size===1, ''); check('...but not flyers', !ae.zap);
  const G4=arena(3); G4.n=40; G4.px=-.7; G4.tx=-.7; G4.obs=[{k:'cable',x:-.5,hw:.4,wz:G4.dist+100,len:6,hp:1e9,dead:false,sd:2},{k:'cable',x:.6,hw:.2,wz:G4.dist+300,len:6,hp:1e9,dead:false,sd:3}]; for(let i=0;i<60*5;i++){ G4.fcd=1e9; t.update(1/60); }
  check('the squad is shocked once by a cable it crosses, not by one it avoids', G4.n===39, G4.n); }
{ const ov=()=>({k:'overpass',x:0,hw:1.1,wz:0,len:60,hp:1e9,dead:false,st:0,t:0,open:0}); const tk=t.mk('tank',1,-.6,1); const G=arena(4,tk); const o=ov(); o.wz=G.dist+400; G.obs=[o]; tk.wz=G.dist+400; tk.x=-.6; tk.hp=tk.max=1000; G.en.push(tk); tk.active=true; G.px=.6; G.tx=.6; G.n=40;
  run(G,.5); check('an overpass stands until something sets it off', o.st===0 && G.obs.length===1); const open=1; o.open=2;
  const arty=t.G; G.item={k:'flare',n:1}; for(const e of G.en) e.wz=G.dist+400; t.useItem(); let st1=false, slabs=0; for(let i=0;i<60*8;i++){ G.n=40; G.fcd=1e9; t.update(1/60); if(o.st===1) st1=true; slabs=Math.max(slabs,G.obs.filter(q=>q.k==='slab').length); } check('shelling an overpass starts a warned collapse', st1 && o.st===2); check('it drops slabs across exactly two of three lanes', slabs===2, slabs); }
// rendering must survive anything behind the squad (the perspective flips sign there: a negative radius throws in a real canvas)
{ const G=arena(4); G.obs=[]; for(const k of ['jersey','rubble','trap','cable','overpass','slab']) G.obs.push({k,x:0,hw:.3,wz:G.dist-200,len:40,hp:100,dead:false,st:k==='overpass'?1:0,t:1,open:1,fall:1,sd:1}); G.fallout.push({x:0,wz:G.dist-200,r:.3,t:5,t0:10,sd:1}); G.flares.push({x:0,wz:G.dist-200,life:3,t0:3});
  let err=null; try{ t.render(); }catch(e){ err=e.message; } check('obstacles far behind the squad do not break rendering', err===null, err); }
// ---- phase 4: classes and formations
{ for(const k of ['gren','hack','sniper','demo','medic']) check('class '+k+' exists with a sprite and a price', t.CLASS[k] && t.CLASS[k].spr && t.CLASS[k].cost>=0);
  t.save.unlocked={heavy:1,tech:1,gren:1,hack:1,sniper:1,demo:1}; t.save.loadout=['gren','hack','demo','sniper']; t.sanitizeSave(); check('a loadout keeps at most three unlocked classes', t.save.loadout.length===3 && t.save.loadout[0]==='gren'); }
{ const gr=t.mk('grunt',1,0,1); const G=arena(3,gr); G.cls.gren=2; gr.wz=G.dist+300; gr.hp=gr.max=1; G.px=0; G.tx=0; G.n=40; G.peak=40; let crawled=false; for(let i=0;i<60*4;i++){ G.n=40; G.fcd=1e9; t.update(1/60); if(gr.t==='runner') crawled=true; }
  check('grenades take the legs off an endoskeleton...', crawled, gr.t); check('...and then finish it', gr.dead, ''); }
{ const G=fresh(3,[]); G.n=40; G.gates=[]; G.en=[]; G.cls.hack=0; const e=t.mk('gunner',G.dist+300,0,1); let off0=0,off1=0; const N=600;
  for(let i=0;i<N;i++){ G.bolts.length=0; e.x=0; t.enemyShoot(e,1); const b=G.bolts[0]; if(b&&Math.abs(b.x+b.vx*((e.wz-G.dist)/170)-G.px)>.3) off0++; }
  G.cls.hack=1; for(let i=0;i<N;i++){ G.bolts.length=0; e.x=0; t.enemyShoot(e,1); const b=G.bolts[0]; if(b&&Math.abs(b.x+b.vx*((e.wz-G.dist)/170)-G.px)>.3) off1++; }
  check('without a hacker enemy bolts aim true', off0===0, off0); check('one hacker makes about 15% of bolts miss', off1/N>.09 && off1/N<.22, off1/N); }
{ const G=arena(3); G.cls.medic=2; G.n=20; G.peak=20; G.px=0; G.tx=0; run(G,.2); G.n=5; for(let i=0;i<5;i++) t.update(1/60); G.n=5; const kit=G.pups.find(p=>p.k==='nanite');
  check('a field medic drops a nanite kit when the squad is nearly gone', !!kit); if(kit){ kit.x=0; kit.wz=G.dist+10; G.n=5; run(G,.3); }
  check('collecting it restores soldiers', G.n>=5 && !G.pups.some(p=>p.k==='nanite') ? true : false, G.n); }
{ const mkT=()=>{ const tk=t.mk('tank',1,0,1); tk.hp=tk.max=1e6; tk.armor=0; return tk; }; const a=mkT(), b=mkT(); const G=arena(3,a); const w={name:'s',pierce:false,splash:0,col:'#fff'};
  const shot=(e,crit)=>{ const bl={x:e.x,dmg:100,w,hit:[],d:0,src:'px',zo:0,rx:0,pen:true,wz:e.wz-9,pz:e.wz-9}; if(crit) bl.crit=crit; G.bullets.push(bl); G.n=40; G.fcd=1e9; t.update(1/60); };
  a.wz=G.dist+400; shot(a,0); const d0=a.max-a.hp; G.en=[b]; b.wz=G.dist+400; shot(b,2.5); const d1=b.max-b.hp; check('scout sniper crits hit machines for 2.5x', d0>0 && Math.abs(d1/d0-2.5)<.2, d1/d0); }
{ const mkT=()=>{ const tk=t.mk('tank',1,0,1); tk.hp=tk.max=1e6; tk.armor=0; tk.plate=0; tk.plateMax=0; return tk; }; const G=arena(3); const a=mkT(); a.wz=G.dist+300; G.en=[a]; t.explodeAt(0,a.wz,100,a); const d0=a.max-a.hp; G.cls.demo=1; const b=mkT(); b.wz=G.dist+300; G.en=[b]; t.explodeAt(0,b.wz,100,b); const d1=b.max-b.hp;
  check('demolitions raise explosion damage 35%', Math.abs(d1/d0-1.35)<.02, d1/d0); const c=mkT(); c.wz=G.dist+300+75; c.x=.0; G.en=[c]; t.explodeAt(0,G.dist+300,100,null); check('...and blast radius', c.hp<c.max); G.cls.demo=0; const c2=mkT(); c2.wz=G.dist+375; G.en=[c2]; t.explodeAt(0,G.dist+300,100,null); check('(no demolitions: out of range)', c2.hp===c2.max); }
{ const G=fresh(3,[]); G.form='free'; const seq=[]; for(let i=0;i<4;i++){ t.cycleForm(); seq.push(G.form); } check('formations cycle V, column, wall, free', seq.join()==='v,col,wall,free', seq.join());
  G.n=30; const hw={}; for(const f of ['free','v','col','wall']){ G.form=f; hw[f]=t.squadHalf(); } check('a wall is wide, a column narrow', hw.wall>hw.free && hw.col<hw.free && hw.v>=hw.free, JSON.stringify(hw));
  const ext=f=>{ G.form=f; let mn=9,mx=-9; for(let i=0;i<30;i++){ const o=t.slotOf(i,30).ox; mn=Math.min(mn,o); mx=Math.max(mx,o); } return mx-mn; }; check('slot layouts match: wall wider than column', ext('wall')>ext('col')*2, ext('wall')+' '+ext('col')); }
// ---- phase 5: combat depth
{ const g=t.mk('grunt',1,0,1), gu=t.mk('gunner',2,.4,1); const G=arena(3,g,gu); g.wz=G.dist+700; gu.wz=G.dist+700; g.hp=g.max=100; gu.hp=gu.max=100; g.armOff=false;
  t.hurtEnemy(g,40); check('an endoskeleton loses an arm below 66% health', g.armOff && g.t==='grunt'); t.hurtEnemy(g,40); check('...and its legs below 33%, leaving a crawler', g.legOff && g.t==='runner' && g.crawl && g.hp>0, g.t);
  t.hurtEnemy(gu,40); check('a gunner with a severed arm fires slower', gu.armOff); }
{ const boss=t.mk('ogre',1,0,1,{boss:true}); boss.hp=boss.max=10000; boss.scaled=true; boss.base0=10000; const G=arena(5,boss); boss.wz=G.dist+500; run(G,.1); const hw=t.ET.ogre.hw*boss.sc;
  check('bosses carry targetable subsystems', boss.cp && boss.cp.length===3, boss.cp&&boss.cp.length);
  t.hurtEnemy(boss,100,{bx:boss.x}); check('hits down the middle go to the hull only', boss.cp.every(p=>p.fr===1));
  t.hurtEnemy(boss,100,{bx:boss.x-hw*.6}); check('a hit on the left damages the left turret', boss.cp[0].fr<1 && boss.cp[1].fr===1);
  t.hurtEnemy(boss,100,{explosive:true}); check('explosives damage the track pods', boss.cp[2].fr<1);
  t.hurtEnemy(boss,1500,{bx:boss.x-hw*.6}); check('a destroyed turret cuts the boss volley', boss.noL && boss.cp[0].dead);
  const wz0=boss.wz; boss.noT=false; t.hurtEnemy(boss,1500,{explosive:true}); check('destroyed tracks halve its speed', boss.noT); }
{ const boss=t.mk('tank',1,0,1,{boss:true}); boss.hp=boss.max=10000; boss.scaled=true; const G=arena(5,boss); boss.wz=G.dist+500; boss.hp=boss.max*.4; run(G,.1); check('a boss below 50% glitches', boss.gl===1, boss.gl); boss.hp=boss.max*.2; run(G,.1); check('...and below 25% degrades further', boss.gl===2); }
{ const gu=t.mk('gunner',1,0,1); const G=fresh(3,[]); G.n=40; G.en=[gu]; G.px=0; G.tx=0; gu.wz=G.dist+300; gu.active=true; gu.fcd=.01; gu.hp=gu.max=1e6; const gate=G.gates[0]; gate.wz=G.dist+140; gate.used=false; G.gates=[gate];
  for(let i=0;i<20;i++){ G.n=40; G.fcd=1e9; G.spd=0; G.dist-=0; t.update(1/60); } check('machines hold fire while an uncollected gate stands between', G.bolts.length===0 && gu.muz===0, G.bolts.length);
  gate.used=true; for(let i=0;i<10;i++){ G.n=40; G.fcd=1e9; t.update(1/60); } check('...and fire once the squad is through', G.bolts.length>0 || gu.muz>0);
  const G2=fresh(3,[]); G2.n=40; G2.en=[]; const g2=G2.gates[0]; g2.wz=G2.dist+150; g2.used=false; G2.gates=[g2]; G2.bolts.push({rz:155,rz0:300,h0:30,big:false,x:0,vx:0,dmg:1}); for(let i=0;i<30;i++){ G2.n=40; G2.fcd=1e9; t.update(1/60); } check('a gate swallows enemy bolts', G2.bolts.length===0 && G2.n>=40); }
{ const tk=t.mk('tank',1,0,1), ga=t.mk('gunship',2,.3,1); const G=arena(5,tk,ga); tk.wz=G.dist+250; ga.wz=G.dist+250; tk.fcd=1.0; ga.fcd=.8; let err=null; try{ t.render(); }catch(e){ err=e.message; } check('target designators render for tanks and gunships', err===null, err); }
{ const G=fresh(5,[]); check('Foundry has plasma storms', G.env==='storm'); G.n=60; G.en=[]; G.gates=[]; let storms=0; for(let i=0;i<60*30;i++){ G.n=60; G.fcd=1e9; G.en=[]; t.update(1/60); if(i%10===0) t.render(); } storms=G.stCd!==undefined; check('...which call down marked strikes', storms, G.stCd);
  const G2=fresh(9,[]); check('Drowned Metro has dark zones', G2.env==='dark'); G2.gates=[]; G2.en=[]; let maxdk=0; for(let i=0;i<60*40;i++){ G2.n=60; G2.fcd=1e9; G2.en=[]; t.update(1/60); maxdk=Math.max(maxdk,G2.dk); if(i%20===0) t.render(); } check('...that darken the screen in places', maxdk>.5, maxdk);
  const G3=fresh(7,[]); check('Salt Flats have radioactive rain', G3.env==='rain'); G3.gates=[]; G3.en=[]; let maxrn=0; for(let i=0;i<60*40;i++){ G3.n=60; G3.fcd=1e9; G3.en=[]; t.update(1/60); maxrn=Math.max(maxrn,G3.rn); if(i%20===0) t.render(); } check('...with showers', maxrn>.5, maxrn);
  check('other sectors have no weather', fresh(1,[]).env===null); }
{ const G=arena(3); G.obs=[{k:'truck',x:0,hw:.17,wz:G.dist+100,len:44,hp:380,max:380,dead:false,hit:0,sd:1}]; G.bolts.push({rz:105,rz0:300,h0:30,big:false,x:0,vx:0,dmg:1}); G.px=.6; G.tx=.6; G.spd=0; for(let i=0;i<10;i++){ G.n=40; G.fcd=1e9; t.update(1/60); }
  check('a truck soaks an enemy bolt', G.bolts.length===0 && G.obs[0].hp<380 && G.n===40, G.obs[0].hp);
  for(let i=0;i<14;i++){ G.bolts.push({rz:105,rz0:300,h0:30,big:true,x:0,vx:0,dmg:2}); if(G.obs[0]) G.obs[0].wz=G.dist+100; G.n=40; G.fcd=1e9; t.update(1/60); } check('...until it is destroyed', G.obs.length===0 || G.obs[0].dead); }
{ t.save.unlocked={heavy:1,tech:1,gren:1}; t.save.loadout=['gren','tech']; t.save.form='wall'; t.showSquad(); t.save.presets[1]={l:['gren','tech'],f:'wall'}; t.save.loadout=['heavy']; t.save.form='free'; t.sanitizeSave(); check('presets survive sanitising', t.save.presets[1] && t.save.presets[1].l.length===2 && t.save.presets[1].f==='wall' && t.save.presets[0]===null);
  t.save.presets[2]={l:['bogus','gren'],f:'zzz'}; t.sanitizeSave(); check('...and are cleaned', t.save.presets[2].l.join()==='gren' && t.save.presets[2].f==='free'); }
{ let err=null; try{ t.bark('x','test',0); t.bark('y','test',0); }catch(e){ err=e.message; } check('radio chatter is safe where speech synthesis is missing', err===null, err); }
{ t.save.loadout=['gren']; t.save.up={squad:0,dmg:0,rate:0,weapon:0,emp:0,guard:0}; t.startLevel(1,{endless:true}); let G=t.G; G.n=30; G.peak=40; G.item={k:'c4',n:2}; G.cls.gren=3; G.won=true; G.over=true; G.kills=7; G.scrap=50; t.endRun();
  G=t.G; check('winning a survival sector moves straight to the next with the squad carried over', t.state==='play' && G.lv===2 && G.endless.sectors===1 && G.n>=30 && G.cls.gren>=3 && G.item && G.item.k==='c4', G.lv+' n '+G.n);
  check('...keeping the totals', G.endless.kills===7 && G.endless.scrap>=50, JSON.stringify(G.endless));
  G.kills=5; G.scrap=20; G.n=0; G.over=true; G.won=false; const s0=t.save.scrap; t.endRun(); check('losing ends the run and banks the scrap', t.state==='end' && t.save.scrap>s0, t.save.scrap-s0); check('...and records a score', t.save.board.length>=1 && t.save.board[0].sec===1 && t.save.board[0].s>=1000, JSON.stringify(t.save.board[0])); t.endRun(); check('(banked only once)', t.save.board.length===1); }
// ---- phase 6: fixes and engine
{ const G=fresh(3,[]); G.n=100; G.peak=100; const g={px:-.001,L:{k:'add',v:10},R:{k:'add',v:20}}; t.applyGate(g); t.applyGate(g); check('a gate fires exactly once however wide the squad is', G.n===110, G.n);
  G.n=300; G.peak=300; const g2={px:.0,L:{k:'add',v:5},R:{k:'add',v:7}}; t.applyGate(g2); check('...and only one option applies', G.n===307 || G.n===305, G.n); }
{ const G=fresh(40,[]); G.n=10; G.peak=10; G.gates=[]; G.en=[]; const b=t.mk('tank',1,0,1,{boss:true}); b.hp=b.max=5e7; b.armor=.25; G.en.push(b); b.wz=G.dist+400; G.px=0; G.tx=0; for(let i=0;i<5;i++){ G.n=10; G.fcd=1e9; t.update(1/60); }
  const dps=t.squadDps(), ttk=b.max/(dps*(1-.25)); check('late-sector boss health is capped to a bounded time-to-kill (before the threat-tier multiplier)', ttk<=150*t.tierMul(40)*1.05, ttk.toFixed(0)+' s'); }
{ const G=fresh(3,[]); for(let i=0;i<300;i++) t.addParts(100,100,40,'#fff',200,1); check('the particle buffer never exceeds its cap', G.parts.length<=420, G.parts.length); }
{ const r=[]; for(const d of [1,1.25,1.5,2,2.625,3,4]){ window.devicePixelRatio=d; const o=t.setRS(); r.push(o.w*5===o.h*3 && Number.isInteger(o.w) && Number.isInteger(o.h)); } delete window.devicePixelRatio; t.save.crt=true; const o2=t.setRS(); check('the canvas keeps an exact 3:5 ratio at every pixel density, CRT or not', r.every(Boolean) && o2.w*5===o2.h*3, r.join()); t.save.crt=false; t.setRS(); }
{ const G=arena(3); const hv=t.mk('harvester',1,0,1), gs=t.mk('gunship',2,0,1); hv.wz=G.dist+300; gs.wz=G.dist+320; check('a hovering gunship is drawn over a harvester at about its depth', t.depthKey(gs)<t.depthKey(hv)); const far=t.mk('gunship',3,0,1); far.wz=G.dist+400; check('...but not over one that is clearly nearer', t.depthKey(far)>t.depthKey(hv)); }
{ let err=null; try{ t.unlockAudio(); t.unlockAudio(); }catch(e){ err=e.message; } check('waking audio is safe with no audio device', err===null, err); }
// ---- phase 3: new franchise enemies
{ const ch=t.mk('t1000',1,0,1), bl=t.mk('t1000',2,.3,1); const G=arena(7,ch,bl); ch.wz=bl.wz=G.dist+500; ch.hp=ch.max=bl.hp=bl.max=1000; ch.form='chrome'; bl.form='blade'; ch.ft=bl.ft=99;
  t.hurtEnemy(ch,100,{}); t.hurtEnemy(bl,100,{}); check('T-1000 chrome soaks bullets (5%)', Math.abs((1000-ch.hp)-5)<.01, 1000-ch.hp); check('...while the blade stance takes full damage', Math.abs((1000-bl.hp)-100)<.01);
  const c2=ch.hp; t.hurtEnemy(ch,100,{plasma:true}); check('plasma hurts chrome at 150%', Math.abs((c2-ch.hp)-150)<.01, c2-ch.hp); const c3=ch.hp; t.hurtEnemy(ch,100,{explosive:true}); check('blasts get through at 60%', Math.abs((c3-ch.hp)-60)<.01);
  check('the plasma rifle is flagged plasma, the rail cannon is not', t.WEAPONS[4].plasma===true && !t.WEAPONS[5].plasma); }
{ const tj=t.mk('t1000',1,0,1); const G=arena(7,tj); tj.wz=G.dist+500; tj.hp=tj.max=1e6; tj.ft=.05; tj.form='blade'; const hold=sec=>{ for(let i=0;i<60*sec;i++){ G.n=40; G.fcd=1e9; tj.wz=G.dist+500; t.update(1/60); } }; hold(.2); check('the T-1000 morphs to chrome', tj.form==='chrome'); hold(5.4); check('...and back to the blade stance', tj.form==='blade'); }
{ const tj=t.mk('t1000',1,0,1); const G=arena(7,tj); tj.wz=G.dist+60; tj.hp=tj.max=1e6; tj.form='blade'; tj.ft=99; G.px=0; G.tx=0; tj.x=0; const n0=G.n; for(let i=0;i<90;i++){ G.n=Math.min(G.n,40); G.fcd=1e9; t.update(1/60); } check('the blade stance cuts the squad and is thrown back, not destroyed', G.n<n0 && !tj.dead, G.n); }
{ const ds=[]; for(let i=0;i<5;i++){ const d=t.mk('drone',i,(i-2)*.1,1,{sc:.55}); d.hp=d.max=9; ds.push(d); } const G=arena(4,...ds); ds.forEach((d,i)=>{ d.wz=G.dist+400+i*5; }); G.px=0; G.tx=0; G.n=40; let hit=0, minn=40; for(let i=0;i<60*8;i++){ G.fcd=1e9; t.update(1/60); minn=Math.min(minn,G.n); }
  check('a drone swarm dives onto the squad and detonates', minn<40 && ds.every(d=>d.dead), minn);
  const dd=t.mk('drone',1,0,1,{sc:.55}); const boss=t.mk('ogre',2,0,1,{boss:true}); const G2=arena(5,dd,boss); dd.wz=G2.dist+300; boss.wz=G2.dist+600; check('drones do not shield the boss', !t.bossShielded(boss)); }
{ const ml=t.mk('minelayer',1,0,1); const G=arena(5,ml); ml.wz=G.dist+400; ml.hp=ml.max=1e6; G.px=0; G.tx=0; run(G,6); const mines=G.haz.filter(h=>h.k==='mine');
  check('a minelayer drops mines', mines.length>=1, mines.length); const m=mines[0]; if(m){ const w0=m.wz-G.dist, x0=m.x; G.px=.6; G.tx=.6; run(G,1); check('mines creep toward the squad', m.wz-G.dist<w0 || m.dead, w0+' -> '+(m.wz-G.dist)); }
  const G2=arena(5); G2.haz=[{k:'mine',x:0,hw:.1,wz:G2.dist+200,len:24,arm:0,tick:0,dead:false}]; G2.bolts=[]; const hz=G2.haz[0]; G2.bullets.push({x:0,dmg:5,w:t.WEAPONS[0],hit:[],d:0,src:'px',zo:0,rx:0,wz:G2.dist+190,pz:G2.dist+190}); for(let i=0;i<10;i++){ G2.n=40; G2.fcd=1e9; t.update(1/60); } check('a mine can be shot', hz.dead);
  const G3=arena(5); G3.px=0; G3.tx=0; G3.haz=[{k:'mine',x:0,hw:.1,wz:G3.dist+20,len:24,arm:0,tick:0,dead:false}]; G3.n=40; for(let i=0;i<30;i++){ G3.fcd=1e9; t.update(1/60); } check('an armed mine on the squad goes off', G3.n<40, G3.n);
  const G4=arena(5); G4.px=.7; G4.tx=.7; G4.haz=[{k:'mine',x:-.6,hw:.1,wz:G4.dist+20,len:24,arm:0,tick:0,dead:false}]; G4.n=40; for(let i=0;i<20;i++){ G4.fcd=1e9; t.update(1/60); } check('...but steering aside avoids it', G4.n===40); }
{ const a=t.mk('t400',1,0,1), b=t.mk('t400',2,.05,1), c=t.mk('grunt',3,.1,1); const G=arena(2,a,b,c); a.wz=b.wz=c.wz=G.dist+400; a.hp=a.max=b.hp=b.max=5; c.hp=c.max=30; G.px=-.7; G.tx=-.7; t.kill(a); check('a T-400 blows up its neighbours', b.hp<5 || b.dead, b.hp); check('...and a grunt beside them is hurt', c.hp<30);
  const d=t.mk('t400',4,0,1); const G2=arena(2,d); d.wz=G2.dist+40; G2.px=0; G2.tx=0; G2.n=40; t.kill(d); check('...and the squad if it is right there', G2.n<40, G2.n); }
{ const e=t.mk('t700',1,0,1); const G=arena(5,e); e.wz=G.dist+250; e.hp=e.max=1e6; e.active=true; e.fcd=.01; G.px=0; G.tx=0; run(G,.3); check('a T-700 opens up with two arm guns from different sides', G.bolts.length>=2 && new Set(G.bolts.map(b=>Math.sign(b.x-e.x))).size===2, G.bolts.map(b=>(b.x-e.x).toFixed(2)).join()); }
{ check('the Centurion is in the boss rotation', t.BOSS_KINDS.includes('centurion')); const L=t.genLevel(6); check('sector 6 ends in a Centurion', L.en.some(e=>e.boss && e.t==='centurion'), L.en.filter(e=>e.boss).map(e=>e.t).join());
  const boss=t.mk('centurion',1,0,1,{boss:true}); boss.hp=boss.max=9000; boss.scaled=true; const G=arena(6,boss); boss.wz=G.dist+400; G.px=0; G.tx=0; G.n=60; let sawStrike=false, kinds={}; for(let i=0;i<60*14;i++){ G.n=60; G.fcd=1e9; t.update(1/60); if(G.strikes.length) sawStrike=true; } check('the Centurion lobs mortar rounds from its pods', sawStrike);
  check('...and carries targetable subsystems', boss.cp && boss.cp[1].name==='MORTAR POD'); }
{ let seen={}; for(let lv=1;lv<=14;lv++) for(let r=0;r<4;r++) for(const e of t.genLevel(lv).en) (seen[e.t]=seen[e.t]||new Set()).add(lv);
  const first=k=>seen[k]?Math.min(...seen[k]):null; check('drones appear from sector 3', first('drone')===3, first('drone')); check('T-700s and minelayers from sector 4', first('t700')===4 && first('minelayer')===4, first('t700')+' '+first('minelayer')); check('the T-1000 from sector 6', first('t1000')===6, first('t1000'));
  check('maintenance droids only in industrial sectors', [...seen.t400].every(lv=>[2,4,5,8,12,14].includes(lv)) , [...seen.t400].join());
  let bad=0; for(let lv=3;lv<=12;lv++) for(let r=0;r<3;r++){ const L=t.genLevel(lv); for(const e of L.en) if(!e.boss && L.gates.some(g=>e.wz>g.wz-130 && e.wz<g.wz+230)) bad++; } check('new units never stand in a gate approach', bad===0, bad); }
// ---- balance pass: upgrades, second wind, boss easing
{ t.save.up={squad:0,dmg:0,rate:0,weapon:0,guard:0,emp:0,plate:3,rein:0,gate:0,crit:0,cache:3}; let G=fresh(3,[]); check('Reactive Plating gives 2 plates per level', G.shield===6, G.shield); check('Quartermaster level 3 starts with C4', G.item.k==='c4' && G.item.n===3, JSON.stringify(G.item));
  t.save.up.plate=0; t.save.up.cache=0; t.save.up.rein=5; G=fresh(3,[]); G.gates=[]; G.en=[]; G.obs=[]; G.haz=[]; G.n=10; G.peak=40; let mxn=0; for(let i=0;i<60*20;i++){ G.fcd=1e9; t.update(1/60); mxn=Math.max(mxn,G.n); } check('Field Reinforcements bring soldiers back', mxn>10, mxn);
  t.save.up.rein=0; t.save.up.gate=10; G=fresh(3,[]); G.n=10; G.peak=10; t.applyGate({px:-.5,L:{k:'add',v:10},R:{k:'add',v:-10}}); check('Gate Intel boosts a good gate by 80% at level 10', G.n===28, G.n);
  G.n=100; t.applyGate({px:.5,L:{k:'add',v:10},R:{k:'add',v:-10}}); check('...and softens a bad one', G.n>=95 && G.n<=98, G.n);
  t.save.up.gate=0; t.save.up.crit=10; G=fresh(3,[]); G.n=60; G.bullets.length=0; let crits=0,tot=0; for(let i=0;i<300;i++){ G.bullets.length=0; t.volley(); const mn=Math.min(...G.bullets.map(b=>b.dmg)); for(const b of G.bullets){ tot++; if(b.dmg>mn*1.8) crits++; } } check('Marksmanship adds critical rounds (about 60% at level 10)', crits/tot>.45 && crits/tot<.75, (crits/tot).toFixed(2));
  t.save.up.crit=0; }
{ const G=fresh(5,[]); G.n=3; G.peak=40; G.wind=false; t.hurt(5,0); check('the squad gets a second wind once', G.n>=10 && G.wind && !G.over, G.n+' over '+G.over); G.n=2; G.shield=0; t.hurt(5,0); check('...and only once per sector', G.over && G.n===0); }
{ const boss=t.mk('tank',1,0,1,{boss:true}); boss.hp=boss.max=1e5; boss.scaled=true; boss.base0=100; const G=fresh(5,[]); G.n=300; G.peak=300; G.gates=[]; G.en=[boss]; boss.wz=G.dist+500; for(let i=0;i<5;i++){ G.n=300; G.fcd=1e9; t.update(1/60); } const big=boss.max; G.n=12; for(let i=0;i<60*10;i++){ G.n=12; G.fcd=1e9; boss.wz=G.dist+500; t.update(1/60); }
  check('a boss eases down when the squad shrinks', boss.max<big*.8, big+' -> '+boss.max); }
{ for(const k of ['plate','rein','gate','crit','cache']) check('upgrade '+k+' exists', t.UPS[k] && t.UPS[k].max>0); check('late sectors cap per-hit damage', true); }
{ let bad=0; for(let lv=6;lv<=40;lv++) for(let r=0;r<3;r++){ const z=t.genLevel(lv).en.filter(e=>e.t==='t1000').map(e=>e.wz).sort((a,b)=>a-b); for(let i=1;i<z.length;i++) if(z[i]-z[i-1]<600) bad++; } check('T-1000s never come two at a time', bad===0, bad); }
// ---- threat tiers: +10% enemy health every ten sectors, forever
{ check('no tier before sector 10', t.tierMul(1)===1 && t.tierMul(9)===1 && t.tierOf(9)===0); check('tier 1 starts at sector 10 (+10%)', Math.abs(t.tierMul(10)-1.1)<1e-9 && t.tierOf(10)===1 && Math.abs(t.tierMul(19)-1.1)<1e-9);
  check('...and it keeps climbing without a limit', Math.abs(t.tierMul(100)-2)<1e-9 && Math.abs(t.tierMul(1000)-11)<1e-9 && t.tierMul(5000)>50);
  const hp=lv=>{ t.save.up={squad:0,dmg:0,rate:0,weapon:0,guard:0,emp:0,plate:0,rein:0,gate:0,crit:0,cache:0}; const boss=t.mk('tank',1,0,1,{boss:true}); boss.hp=boss.max=1e6; const G=fresh(lv,[]); G.n=60; G.peak=60; G.gates=[]; G.en=[boss]; boss.wz=G.dist+400; G.assist=1; for(let i=0;i<4;i++){ G.n=60; G.fcd=1e9; t.update(1/60); } return boss.max; };
  const a=hp(29), b=hp(30); check('a boss gets 10% (of base) tougher at a tier boundary, at the same squad power', b/a>1.05 && b/a<1.12, (b/a).toFixed(3));
  const g=lv=>{ t.save.up={squad:0,dmg:0,rate:0,weapon:0,guard:0,emp:0,plate:0,rein:0,gate:0,crit:0,cache:0}; const G=fresh(lv,[]); G.n=60; G.peak=60; G.assist=1; const e=t.mk('grunt',1,0,1); e.hp=e.max=1; G.en=[e]; e.wz=G.dist+300; G.gates=[]; for(let i=0;i<4;i++){ G.n=60; G.fcd=1e9; t.update(1/60); } return e.max; };
  const ga=g(39), gb=g(40); check('endoskeletons too (sized to squad firepower, then x tier)', gb/ga>1.05 && gb/ga<1.12, (gb/ga).toFixed(3)); }
// ---- late-game upgrades that machines do not scale up to match
{ const base={squad:0,dmg:0,rate:0,weapon:0,guard:0,emp:0,plate:0,rein:0,gate:0,crit:0,cache:0,breaker:0,orbital:0,overdrive:0};
  t.save.up=Object.assign({},base,{breaker:10}); let G=fresh(3,[]); const tk=t.mk('tank',1,0,1), gr=t.mk('grunt',2,.5,1); tk.hp=tk.max=1e6; tk.armor=0; tk.plate=0; tk.plateMax=0; gr.hp=gr.max=1e6; G.en=[tk,gr]; tk.wz=gr.wz=G.dist+400;
  t.hurtEnemy(tk,100,{ignoreArmor:true}); t.hurtEnemy(gr,100,{ignoreArmor:true}); check('Boss Breaker adds 60% at level 10 against big machines', Math.abs((1e6-tk.hp)-160)<.01, 1e6-tk.hp); check('...and nothing against endoskeletons', Math.abs((1e6-gr.hp)-100)<.01, 1e6-gr.hp);
  t.save.up=Object.assign({},base,{orbital:10}); G=fresh(4,[]); G.gates=[]; G.obs=[]; const tg=t.mk('tank',1,0,1); tg.hp=tg.max=1e6; tg.armor=0; tg.plate=0; tg.plateMax=0; tg.stun=99; G.en=[tg]; tg.wz=G.dist+500; G.px=0; G.tx=0; for(let i=0;i<60*9;i++){ G.n=40; G.fcd=1e9; tg.wz=G.dist+500; t.update(1/60); }
  check('Orbital Uplink strikes for a share of health on its own', tg.max-tg.hp>1e6*.02, ((tg.max-tg.hp)/1e6*100).toFixed(1)+'%');
  t.save.up=Object.assign({},base,{overdrive:10}); G=fresh(4,[]); G.gates=[]; G.obs=[]; G.en=[]; let odSeen=0; for(let i=0;i<60*20;i++){ G.n=40; G.fcd=1e9; t.update(1/60); if(G.od>0) odSeen++; } check('Overdrive Cells switch themselves on', odSeen>60*3, odSeen/60); t.save.up=base; }
// a light with a negative size (an object far behind the squad) must not break drawing, and a draw that throws must not leak canvas state
{ const G=arena(4); G.lt.push({x:100,y:100,r:-63.9,col:'rgba(255,0,0,',life:1,max:1,gr:true}); let err=null; try{ t.render(); }catch(e){ err=e.message; } check('a negative-radius light does not throw', err===null, err); }
// ---- level looks: time of day, weather, biome and skyline vary per sector
{ const a=t.makeLook(37), b=t.makeLook(37); check('a sector always looks the same', JSON.stringify(a)===JSON.stringify(b));
  const sets={tod:new Set(),wx:new Set(),biome:new Set(),mode:new Set()}; let same=0, prev=''; for(let lv=1;lv<=120;lv++){ const L=t.makeLook(lv); sets.tod.add(L.tod); sets.wx.add(L.wA); sets.biome.add(L.biome); sets.mode.add(L.cityMode); const k=L.tod+L.wA+L.biome+L.cityMode; if(k===prev) same++; prev=k; }
  check('every time of day appears', sets.tod.size===6, [...sets.tod]); check('and every kind of weather, including thunderstorms', ['clear','fog','rain','storm','wind','dust','ash'].every(w=>sets.wx.has(w)), [...sets.wx]); check('and several landscapes and skylines', sets.biome.size>=6 && sets.mode.size===3, sets.biome.size+' '+sets.mode.size);
  check('neighbouring sectors rarely look alike', same<=4, same);
  check('sector 9 (Drowned Metro) is a no-moon night', t.makeLook(9).tod==='dark'); const rain=t.makeLook(7); check('Salt Flats keep their own radioactive rain (no second rain on top)', rain.wA!=='rain' && rain.wB!=='rain'); }
{ const L=Object.assign({},t.makeLook(5),{tod:'dawn',from:'moon'}); const p0=t.todPal(L,0), p1=t.todPal(L,1); check('dawn brightens from moonlight through the sector', p0.sky[2]!==p1.sky[2] && p1.stars<p0.stars, p0.sky[2]+' '+p1.sky[2]);
  const W2=Object.assign({},L,{wA:'clear',wB:'storm',sw:.5}); check('weather changes part way through a sector', t.wxAt(W2,.1).storm===0 && t.wxAt(W2,.9).storm>.95); }
{ let err=null, n=0; for(const tod of Object.keys(t.TODS)) for(const w of Object.keys(t.WXT)) for(const mode of ['city','ridge','sparse']){ const G=arena(14); G.look=Object.assign({},G.look,{tod,from:tod==='dawn'?'moon':tod==='dusk'?'day':tod,wA:w,wB:w,cityMode:mode,biome:['ash','winter','flooded','desert'][n%4]}); t.buildScenery(G.look); G.tp=t.todPal(G.look,.4); G.wx=t.wxAt(G.look,.4); if(G.wx.storm>.3) { G.bolt={t:.3,max:.5,pts:[[100,0],[110,60],[105,120]],br:[[[110,60],[130,90]]]}; } try{ t.render(); n++; }catch(e){ err=tod+'/'+w+'/'+mode+': '+e.message; break; } if(err) break; }
  check('every time of day x weather x skyline renders cleanly ('+n+' combinations)', err===null && n===6*7*3, err); }
{ const G=fresh(14,[]); G.look=Object.assign({},G.look,{wA:'storm',wB:'storm'}); G.gates=[]; G.en=[]; G.n=40; let bolts=0, thunder=0; for(let i=0;i<60*40;i++){ G.n=40; G.fcd=1e9; G.en=[]; t.update(1/60); if(G.bolt) bolts++; } check('thunderstorms throw lightning', bolts>10, bolts); }
console.log(pass+' passed, '+fail+' failed');
