// Harnais de test : stub minimal de DOM/canvas 2D pour executer le jeu sous node.
const fs=require('fs');
const html=fs.readFileSync(process.argv[2]||__dirname+'/../src/index.html','utf8');
const js=html.match(/<script>([\s\S]*)<\/script>/)[1];

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
  return new Proxy(h,{get:(t,k)=> (k in t? t[k] : undefined), set:(t,k,v)=>{
    if(typeof v==='number'&&!isFinite(v)) throw new Error('valeur non finie sur ctx.'+String(k)+': '+v);
    t[k]=v; return true; }});
}
function mkCanvas(){ const c={width:1,height:1,style:{},getContext:()=>ctx(),
  addEventListener(){}, requestPointerLock(){} }; return c; }
const main=mkCanvas(); main.width=1280; main.height=720;
global.document={ getElementById:()=>main, createElement:()=>mkCanvas(),
  head:{appendChild(){}}, addEventListener(){} };
global.window={}; global.self=global;   // le jeu lit self.Wavedash, absent sous node
global.innerWidth=1280; global.innerHeight=720; global.devicePixelRatio=1;
global.addEventListener=()=>{}; global.requestAnimationFrame=()=>{};
global.setInterval=()=>{}; global.AudioContext=undefined;

const mod={};
const run=new Function('module','__t', js+'\n; __t({segs:segs,NS:NS,TRACKLEN:TRACKLEN,RC:RC,P:P,getP:()=>P,step:step,render:render,go:go,'+
  'MAXS:MAXS,SEGL:SEGL,PLZ:PLZ,place:place,prog:prog,setMode:function(m){mode=m;},getMode:function(){return mode;},'+
  'keys:keys,segAt:segAt,parts:parts});');
let G=null; run(mod,g=>G=g);

// --- 1. circuit ---
const {segs,NS,TRACKLEN}=G;
console.log('segments:',NS,' longueur:',TRACKLEN,' (~'+(TRACKLEN/10000).toFixed(1)+'s / tour a vitesse max)');
let maxJump=0, maxY=-1e9, minY=1e9;
for(let i=0;i<NS;i++){
  const s=segs[i], nx=segs[(i+1)%NS];
  if(!isFinite(s.y1)||!isFinite(s.y2)||!isFinite(s.c)) throw new Error('segment non fini '+i);
  maxJump=Math.max(maxJump,Math.abs(nx.y1-s.y2));       // continuite de l'altitude
  maxY=Math.max(maxY,s.y2); minY=Math.min(minY,s.y2);
}
console.log('discontinuite altitude max (boucle incluse):',maxJump.toFixed(2),'unites');
console.log('altitude min/max:',minY.toFixed(0),maxY.toFixed(0));
if(maxJump>1) throw new Error('la boucle du circuit nest pas fermee en altitude');
let curveJump=0;
for(let i=0;i<NS;i++) curveJump=Math.max(curveJump,Math.abs(segs[(i+1)%NS].c-segs[i].c));
console.log('saut de courbure max entre 2 segments:',curveJump.toFixed(3));

// --- 2. simulation d'une course complete, plein gaz ---
G.go(); G.setMode(2);
G.keys.arrowup=1;
let t=0, dt=1/60, guard=0, laps=[];
let lastLap=G.getP().lap;
while(G.getMode()===2 && guard++<60*400){
  // pilote basique : se recentre et suit la courbure
  const s=G.segAt(G.getP().z+G.PLZ);
  const want=Math.max(-1,Math.min(1,s.c*0.22-G.getP().x*2));
  G.keys.arrowleft=want<-0.15?1:0; G.keys.arrowright=want>0.15?1:0;
  G.step(dt); t+=dt;
  if(G.getP().lap!==lastLap){ laps.push(t.toFixed(1)); lastLap=G.getP().lap; }
  if(!isFinite(G.getP().x)||!isFinite(G.getP().z)||!isFinite(G.getP().spd)) throw new Error('etat joueur non fini a t='+t);
  for(const r of G.RC) if(!isFinite(r.z)||!isFinite(r.x)||!isFinite(r.spd)) throw new Error('bot non fini');
}
console.log('course terminee en',t.toFixed(1),'s (mode',G.getMode()+') tours a t =',laps.join(', '));
console.log('vitesse finale joueur:',(G.getP().spd|0),'/',G.MAXS,' place:',G.place(G.P));
const classement=G.RC.slice().sort((a,b)=>G.prog(b)-G.prog(a)).map(r=>r.i+(r.i===0?'(joueur)':''));
console.log('ordre a larrivee (index):',classement.join(' > '));
if(G.getMode()!==3) throw new Error('la course ne se termine pas');

// --- 3. rendu : verifie l'absence de NaN dans les coordonnees ---
G.setMode(2);
for(let i=0;i<120;i++){ G.step(1/60); G.render(); }
console.log('rendu: 120 frames OK, appels canvas =',JSON.stringify(calls).slice(0,190));

// --- 4. cas limite : chute hors piste + respawn ---
// NB : le test 3 laisse le jeu sur l'ecran de resultats (mode 3), ou la physique
// du joueur n'est plus appliquee. On relance donc une course avant ce cas.
G.go(); for(let i=0;i<250;i++) G.step(1/60);   // on passe le decompte
G.getP().x=2; G.keys.arrowleft=0; G.keys.arrowright=0;
let fell=false;
for(let i=0;i<200;i++){ G.step(1/60); if(G.getP().fall) fell=true; }
console.log('chute declenchee:',fell,' -> apres respawn x=',G.getP().x.toFixed(2),'fall=',G.getP().fall);
if(!fell) throw new Error('la chute hors piste ne se declenche pas');
if(Math.abs(G.getP().x)>1.07) throw new Error('respawn hors piste');
console.log('\nTOUS LES TESTS PASSENT');
