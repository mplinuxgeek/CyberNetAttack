const fs=require('fs');
const noop=()=>{};
const ctx=new Proxy({}, {get:(t,k)=>(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop:noop}):k==='getImageData'?()=>({data:new Uint8ClampedArray(336*560*4)}):(k==='measureText'?()=>({width:20}):(k in t?t[k]:noop)), set:(t,k,v)=>{t[k]=v;return true}});
const el=()=>({getContext:()=>ctx,addEventListener:noop,style:{},set innerHTML(v){},getBoundingClientRect:()=>({left:0,top:0,width:480,height:800}),setPointerCapture:noop});
global.document={getElementById:el,addEventListener:noop,hidden:false,querySelectorAll:()=>[]};
global.window={addEventListener:noop};global.localStorage={getItem:()=>null,setItem:noop};global.performance={now:()=>Date.now()};
global.requestAnimationFrame=()=>{};global.setTimeout=noop;
eval(fs.readFileSync((process.argv[2]||require('path').join(__dirname,'..','game.js')),'utf8')+";globalThis.__t={startLevel,update,squadDps,get G(){return G},get state(){return state}};");
eval(fs.readFileSync((process.argv[2]||require('path').join(__dirname,'..','game.js')),"utf8")+";globalThis.__t={startLevel,update,get G(){return G},get state(){return state}};");
const t=globalThis.__t;
for(const lv of [2,5]){
 t.startLevel(lv); const G=t.G; G.n=500; G.tier=3; G.peak=500;
 const boss=G.en.find(e=>e.boss); let i=0;
 for(;i<60*400&&!boss.dead;i++){ G.n=Math.max(G.n,500);
  const en=G.en.filter(e=>!e.dead&&e.wz-G.dist>0&&e.wz-G.dist<600).sort((a,b)=>a.wz-b.wz)[0]; G.tx=en?en.x:0; t.update(1/60);}
 const d0=G.dist, s0=G.scrap, n0=G.scr.length;
 let j=0; for(;j<60*30&&t.state==='play';j++) t.update(1/60);
 console.log('lv',lv,'bossDead',boss.dead,'chunks at win',n0,'dist frozen',Math.abs(G.dist-d0)<1,'adv',Math.round(G.adv),'scrap gained',G.scrap-s0,'left',G.scr.length,'state',t.state,'sec',(j/60).toFixed(1));
}
