const fs=require('fs');
const noop=()=>{};
const ctx=new Proxy({}, {get:(t,k)=>(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop:noop}):k==='getImageData'?()=>({data:new Uint8ClampedArray(336*560*4)}):(k==='measureText'?()=>({width:20}):(k in t?t[k]:noop)), set:(t,k,v)=>{t[k]=v;return true}});
const el=()=>({getContext:()=>ctx,addEventListener:noop,style:{},set innerHTML(v){},getBoundingClientRect:()=>({left:0,top:0,width:480,height:800}),setPointerCapture:noop});
global.document={getElementById:el,addEventListener:noop,hidden:false,querySelectorAll:()=>[]};
global.window={addEventListener:noop};
global.localStorage={getItem:()=>null,setItem:noop};
global.performance={now:()=>Date.now()};
let rafcb;global.requestAnimationFrame=f=>{rafcb=f};
global.setTimeout=()=>{};
let src=fs.readFileSync((process.argv[2]||require('path').join(__dirname,'..','game.js')),'utf8')+`
;globalThis.__t={render,showMenu,update,startLevel,useItem,fireEMP,CLS,get save(){return save},get G(){return G},get state(){return state},ET,activateGuard,applyGate};`;
eval(src); const t=globalThis.__t;
const nargs=(k,d)=>{ const i=process.argv.indexOf('--'+k); return i<0?d:+process.argv[i+1]; };
const MAXSOAK=nargs('max-sector',12);   // sectors are drawn at random from 1..N (node tests/soak.js '' <seed> <runs> --max-sector 120)
let seed=nargs('seed',+process.argv[3]||777); const R=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
Math.random=R;
const bad=[]; const report=(m)=>{ if(bad.length<25) bad.push(m); };
const stats={runs:0,won:0,lost:0,timeout:0,maxBul:0,maxEn:0,maxParts:0};
const fin=x=>Number.isFinite(x); let stuck=0; const ET0={};
for(let run=0;run<nargs('runs',+process.argv[4]||40);run++){
  const lv=1+Math.floor(R()*MAXSOAK); t.save.unlocked={heavy:1,tech:1,medic:1,shot:1,mark:1,officer:1,signal:1};
  t.save.loadout=t.CLS.filter(()=>R()<.45).slice(0,3); t.save.up={squad:Math.floor(R()*16),dmg:Math.floor(R()*21),rate:Math.floor(R()*21),weapon:Math.floor(R()*5),emp:Math.floor(R()*11),guard:Math.floor(R()*11)};
  t.save.vib=true;
  try{
    t.startLevel(lv); const G=t.G; const style=Math.floor(R()*3); let steer=0, frames=0;
    for(let i=0;i<60*220&&t.state==='play';i++){ frames++;
      if(i%90===0) steer=style===0?0:(R()*1.7-.85);
      if(style===2&&R()<.01) steer=G.px;
      G.tx=Math.max(-.88,Math.min(.88,steer));
      if(R()<.006){ G.item={k:['pulse','c4','flare','spike','cannon','nuke'][Math.floor(R()*6)],n:3}; t.useItem(); } if(R()<.003&&G.en.length){ const e=G.en[Math.floor(R()*G.en.length)]; e.hp=Math.min(e.hp,1); } if(R()<.002&&G.n<400) G.n+=5;
      if(R()<.0015&&!G.over&&G.pups.length) t.activateGuard();
      t.update(1/60); if(i%4===0) t.render();
      // invariants
      if(G.spd<2&&!G.over&&G.en.every(e=>e.dead||e.wz-G.dist>600||ET0[e.t]&&0)){ stuck=(stuck||0)+1; if(stuck===300) report(`run ${run} lv${lv} STUCK at dist ${G.dist.toFixed(0)} px ${G.px.toFixed(2)} slow ${G.slow} obs ${G.obs.filter(o=>Math.abs(o.wz-G.dist)<150).map(o=>o.k+'@'+Math.round(o.wz-G.dist)+'x'+o.x.toFixed(2)).join(',')} gates ${G.gates.filter(g=>!g.used).slice(0,1).map(g=>Math.round(g.wz-G.dist))}`); } else stuck=0;
      if(!fin(G.n)||G.n<0||G.n>999) report(`run ${run} lv${lv} n=${G.n}`);
      if(!fin(G.px)||!fin(G.dist)||!fin(G.spd)||!fin(G.ts)) report(`run ${run} nonfinite px/dist/spd/ts ${G.px} ${G.dist} ${G.spd} ${G.ts}`);
      if(G.cls){ let tot=0; for(const k of t.CLS){ if(G.cls[k]<0||!fin(G.cls[k])) report(`run ${run} cls ${k}=${G.cls[k]}`); tot+=G.cls[k]; } if(tot>G.n+1e-9) report(`run ${run} cls total ${tot} > n ${G.n}`); }
      for(const e of G.en){ if(!fin(e.x)||!fin(e.wz)||!fin(e.hp)){ report(`run ${run} enemy ${e.t} nonfinite x=${e.x} wz=${e.wz} hp=${e.hp}`); break; } if(Math.abs(e.x)>.95) report(`run ${run} enemy ${e.t} x out of lane ${e.x}`); }
      for(const b of G.bullets){ if(!fin(b.x)||!fin(b.wz)){ report(`run ${run} bullet nonfinite`); break; } }
      if(G.bullets.length>3000) report(`run ${run} too many bullets ${G.bullets.length}`);
      if(G.gates.some(g=>!g.used&&g.wz<G.dist-1)) report(`run ${run} gate skipped at ${G.dist}`);
      stats.maxBul=Math.max(stats.maxBul,G.bullets.length); stats.maxEn=Math.max(stats.maxEn,G.en.length); stats.maxParts=Math.max(stats.maxParts,G.parts.length);
      if(G.over&&G.won===false&&G.n>0&&G.endT>0&&false) report('x');
      if(G.won&&G.n<=0) report(`run ${run} won with an empty squad`);
    }
    if(t.state==='play'){ stats.timeout++; const near=G.en.filter(e=>!e.dead).sort((a,b)=>a.wz-b.wz).slice(0,3).map(e=>`${e.t}${e.boss?'*':''}@${Math.round(e.wz-G.dist)} x${e.x.toFixed(2)} hp${Math.round(e.hp)}`); console.log('  over',G.over,'won',G.won,'sweep',G.sweep,'endT',G.endT,'paused',G.paused,'ts',G.ts,'guard',JSON.stringify(G.guard),'boss',G.en.filter(e=>e.boss).map(e=>`${e.t}@${Math.round(e.wz-G.dist)}`).join(','),'gates',G.gates.filter(g=>!g.used).map(g=>Math.round(g.wz-G.dist)).join(',')); console.log('TIMEOUT run',run,'lv',lv,'style',style,'dist',Math.round(G.dist),'/',G.L,'n',G.n,'spd',G.spd.toFixed(1),'tx',G.tx.toFixed(2),'px',G.px.toFixed(2),near.join(' ; ')); } else if(G.won) stats.won++; else stats.lost++;
    stats.runs++;
  }catch(err){ report(`run ${run} lv? EXCEPTION ${err.stack.split('\n').slice(0,3).join(' | ')}`); }
}
console.log(JSON.stringify(stats)); console.log(bad.length?bad.join('\n'):'no invariant violations');
