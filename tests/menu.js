const fs=require('fs');
const noop=()=>{};
const ctx=new Proxy({}, {get:(t,k)=>(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop:noop}):(k==='measureText'?()=>({width:20}):(k in t?t[k]:noop)), set:(t,k,v)=>{t[k]=v;return true}});
const el=()=>({getContext:()=>ctx,addEventListener:noop,style:{},set innerHTML(v){},getBoundingClientRect:()=>({left:0,top:0,width:480,height:800}),setPointerCapture:noop});
global.document={getElementById:el,addEventListener:noop,hidden:false,querySelectorAll:()=>[]};
global.window={addEventListener:noop};global.localStorage={getItem:()=>null,setItem:noop};global.performance={now:()=>Date.now()};
let raf;global.requestAnimationFrame=f=>{raf=f};global.setTimeout=noop;
eval(fs.readFileSync((process.argv[2]||require('path').join(__dirname,'..','game.js')),'utf8')+";globalThis.__t={frame,get state(){return state}};");
let ts=0;for(let i=0;i<120;i++){ts+=16.7;__t.frame(ts);}
console.log('menu frames ok, state',__t.state);
