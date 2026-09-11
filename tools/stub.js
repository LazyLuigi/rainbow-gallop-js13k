// Bouchon DOM / canvas 2D minimal : permet d'executer le jeu sous node sans
// dependance native. Le contexte est un Proxy qui compte les appels et leve une
// erreur des qu'on lui affecte une valeur non finie (NaN, Infinity), ce qui
// attrape les divisions par zero de la projection avant qu'elles n'atteignent
// l'ecran. Aucun pixel n'est produit : pour un vrai rendu, voir README.
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
    if(typeof v==='number'&&!isFinite(v)) throw new Error('valeur non finie sur ctx.'+String(k)+': '+v);
    t[k]=v; return true; }});
}
function mkCanvas(){ return {width:1,height:1,style:{},getContext:()=>ctx(),
  addEventListener(){}, requestPointerLock(){}}; }

// Installe les globales attendues par le jeu, puis renvoie le compteur d'appels.
function install(W,H){
  const main=mkCanvas(); main.width=W||1280; main.height=H||720;
  global.document={ getElementById:()=>main, createElement:()=>mkCanvas(),
    head:{appendChild(){}}, addEventListener(){} };
  global.window={}; global.self=global;   // le jeu lit self.Wavedash, absent sous node
  global.innerWidth=main.width; global.innerHeight=main.height;
  global.devicePixelRatio=1; global.screen={};
  global.addEventListener=()=>{}; global.requestAnimationFrame=()=>{};
  global.setInterval=()=>{}; global.setTimeout=()=>{}; global.AudioContext=undefined;
  return calls;
}
module.exports={install,mkCanvas,ctx,calls};
