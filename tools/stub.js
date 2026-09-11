// Minimal DOM / 2D canvas stub: enough to run the game under node with no
// native dependency. The context is a Proxy that counts calls and throws as
// soon as a non-finite value (NaN, Infinity) is assigned to it, which catches
// the divide-by-zero cases in the projection before they reach the screen.
// No pixel is produced: for real rendering, see README.
const calls={};
function ctx(){
  const h={};
  const names=['fillRect','clearRect','beginPath','moveTo','lineTo','closePath','fill','stroke',
    'arc','ellipse','drawImage','save','restore','translate','rotate','scale','fillText','strokeText',
    'quadraticCurveTo','setTransform','createLinearGradient','createRadialGradient','measureText'];
  for(const n of names) h[n]=function(){ calls[n]=(calls[n]||0)+1;
    if(n==='createLinearGradient'||n==='createRadialGradient') return {addColorStop(){}};
    if(n==='measureText') return {width:100};
  };
  return new Proxy(h,{get:(t,k)=>(k in t?t[k]:undefined), set:(t,k,v)=>{
    if(typeof v==='number'&&!isFinite(v)) throw new Error('non-finite value on ctx.'+String(k)+': '+v);
    t[k]=v; return true; }});
}
function mkCanvas(){ return {width:1,height:1,style:{},getContext:()=>ctx(),
  addEventListener(){}, requestPointerLock(){}}; }

// Installs the globals the game expects, then returns the call counter.
function install(W,H){
  const main=mkCanvas(); main.width=W||1280; main.height=H||720;
  global.document={ getElementById:()=>main, createElement:()=>mkCanvas(),
    head:{appendChild(){}}, addEventListener(){} };
  global.window={}; global.self=global;   // the game reads self.Wavedash, absent under node
  global.innerWidth=main.width; global.innerHeight=main.height;
  global.devicePixelRatio=1; global.screen={};
  global.addEventListener=()=>{}; global.requestAnimationFrame=()=>{};
  global.setInterval=()=>{}; global.setTimeout=()=>{}; global.AudioContext=undefined;
  return calls;
}
module.exports={install,mkCanvas,ctx,calls};
