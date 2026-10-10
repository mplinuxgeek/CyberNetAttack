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
let src=fs.readFileSync((process.argv[2]||require('path').join(__dirname,'..','game.js')),'utf8')+`;globalThis.__t={update,startLevel,mk,squadDps,get G(){return G},get save(){return save}};`;
eval(src); const t=globalThis.__t; t.save.loadout=[];
for(const [lv,n,tier] of [[1,8,0],[3,20,1],[5,40,2],[8,80,3],[10,150,4]]){
  t.save.up={squad:0,dmg:0,rate:0,weapon:0,emp:0,guard:0}; t.startLevel(lv); const G=t.G; G.n=n; G.tier=tier; G.gates=[]; G.en=[]; G.px=0; G.tx=0;
  const es=[]; for(let i=0;i<8;i++){ const e=t.mk('grunt',G.dist+700+i*8,(i-3.5)*.04,1+.2*(lv-1)); G.en.push(e); es.push(e); }
  let first=null, all=null; for(let i=0;i<60*30;i++){ G.n=n; G.spd=0; t.update(1/60); const dead=es.filter(e=>e.dead||e.t==='runner').length; const near=es[0]; if(first===null&&dead>=1) first=i/60; if(all===null&&dead>=8){ all=i/60; break; } }
  console.log(`lv${lv} n${n} tier${tier} dps ${Math.round(t.squadDps())}: first kill ${first&&first.toFixed(1)}s, 8 grunts dead ${all&&all.toFixed(1)}s, grunt hp ${es[0].max.toFixed(0)}`);
}
