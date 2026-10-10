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
let src=fs.readFileSync((process.argv[2]||require('path').join(__dirname,'..','game.js')),'utf8')+`;globalThis.__t={update,startLevel,get save(){return save},get G(){return G},get state(){return state},ET};`;
eval(src); const t=globalThis.__t; const res={};
for(const lv of (process.argv[3]||"3,5").split(",").map(Number)){ let w=0,l=0,to=0,tt=[];
  for(let k=0;k<6;k++){ t.save.loadout=['heavy','tech']; t.save.up={squad:6,dmg:6,rate:6,weapon:2,emp:3,guard:2}; t.startLevel(lv); const G=t.G; const boss=G.en.find(e=>e.boss);
    for(let i=0;i<60*400&&t.state==='play';i++){
      const sc=o=>o.k==='add'?o.v:o.k==='mul'?G.n*(o.v-1):o.k==='cls'?10:8; const g=G.gates.find(g=>!g.used&&g.wz-G.dist<500&&g.wz-G.dist>-5);
      const big=G.en.filter(e=>!e.dead&&(ET_block(e))&&e.wz-G.dist>0&&e.wz-G.dist<500).sort((a,b)=>a.wz-b.wz)[0];
      const en=G.en.filter(e=>!e.dead&&e.wz-G.dist>0&&e.wz-G.dist<600).sort((a,b)=>a.wz-b.wz)[0];
      let want=0; if(boss&&!boss.dead&&boss.wz-G.dist<600) want=boss.x; else if(big) want=big.x; else if(en) want=en.x; if(g) want=sc(g.L)>sc(g.R)?-.5:.5;
      for(const b of G.bolts){ if(b.rz>0&&b.rz<230){ const bx=b.x+b.vx*(b.rz/170); if(Math.abs(bx-G.px)<.2){ want=G.px+(bx>G.px?-.35:.35); break; } } }
      G.tx=Math.max(-.85,Math.min(.85,want)); t.update(1/60); }
    if(t.state==='play') to++; else if(G.won) {w++; tt.push(Math.round(G.t));} else l++; }
  res[lv]={won:w,lost:l,timeout:to,secs:tt.join(',')}; console.log('lv',lv,JSON.stringify(res[lv])); }
function ET_block(e){ return t.ET[e.t].block||t.ET[e.t].fly; }
