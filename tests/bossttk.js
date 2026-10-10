const fs=require('fs');
const noop=()=>{};
const ctx=new Proxy({}, {get:(t,k)=>(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop:noop}):k==='getImageData'?()=>({data:new Uint8ClampedArray(336*560*4)}):(k==='measureText'?()=>({width:20}):(k in t?t[k]:noop)), set:(t,k,v)=>{t[k]=v;return true}});
const el=()=>({getContext:()=>ctx,addEventListener:noop,style:{},set innerHTML(v){},getBoundingClientRect:()=>({left:0,top:0,width:480,height:800}),setPointerCapture:noop});
global.document={getElementById:el,addEventListener:noop,hidden:false,querySelectorAll:()=>[]};
global.window={addEventListener:noop};global.localStorage={getItem:()=>null,setItem:noop};global.performance={now:()=>Date.now()};
global.requestAnimationFrame=()=>{};global.setTimeout=noop;
eval(fs.readFileSync((process.argv[2]||require('path').join(__dirname,'..','game.js')),'utf8')+";globalThis.__t={startLevel,update,get G(){return G},get state(){return state}};");
const t=globalThis.__t;
function fight(lv,n,tier,dg,rg,aim){ t.startLevel(lv); const G=t.G; G.haz=[];G.gates=[];G.n=n;G.tier=tier;G.dmgG=dg;G.rateG=rg; G.guard=null;
  const b=G.en.find(e=>e.boss); b.wz=G.dist+420; b.active=true; G.en=[b]; G.peak=n;
  let tt=0, n0=n; for(let i=0;i<60*180&&t.state==='play'&&!b.dead;i++){ tt+=1/60;
    if(aim){
      const sh=.04*Math.sqrt(Math.min(G.n,40))+.035, hitR=sh+.1+.04;
      const inc=G.bolts.filter(bl=>bl.rz>0&&bl.rz<300).map(bl=>bl.x+bl.vx*(bl.rz/170));
      let want=Math.max(-.85,Math.min(.85,b.x));
      if(inc.length){ // nearest lane position (to the boss) that no predicted bolt will touch
        let best=null,bd=9; for(let c=-.85;c<=.851;c+=.05){ if(inc.every(bx=>Math.abs(bx-c)>hitR)){ const d=Math.abs(c-want)+Math.abs(c-G.px)*.3; if(d<bd){bd=d;best=c;} } }
        if(best!==null) want=best; }
      G.tx=want; }
    else G.tx=0;
    t.update(1/60); }
  return {killed:b.dead, sec:+tt.toFixed(0), left:G.n, hp:Math.round(b.max)}; }
console.log('boss fight length / squad left, steering+dodging:');
for(const lv of [1,3,5,8]) for(const [name,n,tier,dg,rg] of [['weak  (n=12 sidearm)',12,0,1,1],['mid   (n=40 rifle)',40,2,1.3,1.2],['strong(n=120 rail x2.5)',120,5,2.5,1.5]]){
  const r=fight(lv,n,tier,dg,rg,true); console.log(' sector',lv,name,'->',r.killed?'killed in '+r.sec+'s':'NOT killed in '+r.sec+'s','| squad left',r.left,'of',n,'| boss hp',r.hp); }
