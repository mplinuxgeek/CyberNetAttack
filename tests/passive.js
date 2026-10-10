const fs=require('fs');
const noop=()=>{};
const ctx=new Proxy({}, {get:(t,k)=>(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop:noop}):k==='getImageData'?()=>({data:new Uint8ClampedArray(336*560*4)}):(k==='measureText'?()=>({width:20}):(k in t?t[k]:noop)), set:(t,k,v)=>{t[k]=v;return true}});
const el=()=>({getContext:()=>ctx,addEventListener:noop,style:{},set innerHTML(v){},getBoundingClientRect:()=>({left:0,top:0,width:480,height:800}),setPointerCapture:noop});
global.document={getElementById:el,addEventListener:noop,hidden:false,querySelectorAll:()=>[]};
global.window={addEventListener:noop};global.localStorage={getItem:()=>null,setItem:noop};global.performance={now:()=>Date.now()};
let raf;global.requestAnimationFrame=f=>{raf=f};global.setTimeout=noop;
eval(fs.readFileSync((process.argv[2]||require('path').join(__dirname,'..','game.js')),'utf8')+";globalThis.__t={startLevel,update,get G(){return G},get state(){return state},activateGuard,save};");
const t=globalThis.__t;
function run(lv,mode){ t.startLevel(lv); const G=t.G; let tt=0; if(mode==='passive+unit'){ t.activateGuard(); mode='passive'; }
  for(let i=0;i<60*150&&t.state==='play';i++){
    G.fcd= G.fcd; 
    if(mode==='passive'){ G.tx=0; }
    else if(mode==='steer'){ // smart-ish: grab the better gate, dodge hazards/strikes, sweep toward the nearest enemy
      const sc=o=>o.k==='add'?o.v:o.k==='mul'?G.n*(o.v-1):o.k==='cls'?10:8;
      const g=G.gates.find(g=>!g.used&&g.wz-G.dist<500&&g.wz-G.dist>-5);
      const pu=(G.pups||[]).find(p=>p.wz-G.dist<500&&p.wz-G.dist>-5);
      let want=0;
      const en=G.en.filter(e=>!e.dead&&e.wz-G.dist>0&&e.wz-G.dist<600).sort((a,b)=>a.wz-b.wz)[0];
      if(en) want=en.x;
      if(g) want=sc(g.L)>sc(g.R)?-.5:.5;
      if(pu) want=pu.x;
      for(const h of G.haz){ const r=h.wz-G.dist; if(r>-60&&r<260&&Math.abs(want-h.x)<h.hw+.25) want=h.x>0?h.x-h.hw-.3:h.x+h.hw+.3; }
      const pend=G.strikes.filter(s=>!s.fire).map(s=>s.x).sort((a,b)=>a-b);
      if(pend.length){ const pts=[-.88,...pend,.88]; let bg=0,bc=0; for(let k=0;k<pts.length-1;k++){ if(pts[k+1]-pts[k]>bg){bg=pts[k+1]-pts[k];bc=(pts[k]+pts[k+1])/2;} } want=bc; }
      // dodge incoming plasma: sidestep any bolt predicted to land on the squad
      for(const b of G.bolts){ if(b.rz>0&&b.rz<230){ const bx=b.x+b.vx*(b.rz/170); if(Math.abs(bx-G.px)<.24){ want=G.px+(bx>G.px?-.4:.4); break; } } }
      G.tx=Math.max(-.85,Math.min(.85,want));
    }
    t.update(1/60); }
  return {won:G.won, n:G.n, dist:Math.round(G.dist), L:G.L};
}
const N=+process.argv[3]||12;
for(const lv of [1,2,3]){
  const r={passive:0,steer:0,'passive+unit':0};
  for(const mode of ['passive','passive+unit','steer']) for(let i=0;i<N;i++){ if(run(lv,mode).won) r[mode]++; }
  console.log('sector',lv,'wins of',N,'-> doing nothing:',r.passive,'| doing nothing WITH the unit:',r['passive+unit'],'| steering:',r.steer);
}
