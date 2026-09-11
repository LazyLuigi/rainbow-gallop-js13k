// Analyse musicale : chaque note de melodie est-elle consonante avec son accord ?
const fs=require('fs');
const js=fs.readFileSync(process.argv[2]||__dirname+'/../labs/03-music-tracks.html','utf8').match(/<script>([\s\S]*)<\/script>/)[1];
function param(){ return {value:0,setValueAtTime(){return this},linearRampToValueAtTime(){return this},
  exponentialRampToValueAtTime(){return this}}; }
function node(){ return { connect(){},gain:param(),frequency:param(),detune:param(),Q:param(),
  playbackRate:param(),delayTime:param(),start(){},stop(){},type:'',buffer:null }; }
global.AudioContext=function(){ return { currentTime:0,sampleRate:44100,state:'running',
  destination:node(),resume(){},createGain:node,createOscillator:node,createBiquadFilter:node,
  createDelay:node,createBufferSource:node,createBuffer:()=>({getChannelData:()=>new Float32Array(8)}) }; };
global.window={AudioContext:global.AudioContext};
function el(){ return { style:{},className:'',classList:{add(){},remove(){},toggle(){}},
  set innerHTML(v){}, get innerHTML(){return ''}, appendChild(){}, setAttribute(){},
  getAttribute:()=>'false', textContent:'', value:100, addEventListener(){},
  querySelector:()=>el(), querySelectorAll:()=>[],
  getContext:()=>new Proxy({},{get:()=>()=>({addColorStop(){}})}), width:680,height:150 }; }
global.document={ getElementById:()=>el(), createElement:()=>el(), addEventListener(){} };
global.requestAnimationFrame=()=>{}; global.setInterval=()=>{};
let A=null;
new Function('__t', js+'\n; __t({TRK:TRK,SCA:SCA,ci:ci,boot:boot});')(a=>A=a);
const NOMS=['do','do#','re','re#','mi','fa','fa#','sol','sol#','la','la#','si'];
const nom=m=>NOMS[((m%12)+12)%12];
console.log('titre                    notes  tenues  ambitus     dissonances sur temps fort');
A.TRK.forEach(k=>{
  const L=k.M.length, notes=[]; let held=0;
  for(let i=0;i<L;i++){
    const c=k.M.charAt(i);
    if(c==='-'){ held++; continue; }
    if(c==='.') continue;
    const bar=(i>>4)%(L/16), q=i&15;
    const pitch=A.SCA[A.ci(c)], r=k.R[bar], ty=k.T[bar];
    const ton=[(r)%12,(r+(ty===1?3:4))%12,(r+7)%12,(r+(ty===2?10:12))%12];
    const fort=(q%4===0);
    notes.push({i,q,pitch,bar,cons:ton.indexOf(pitch%12)>=0,fort});
  }
  const mauv=notes.filter(n=>n.fort&&!n.cons);
  const ps=notes.map(n=>n.pitch);
  console.log(k.n.padEnd(24),
    String(notes.length).padStart(5), String(held).padStart(7),
    ' '+(nom(ps[0])+'..'+nom(Math.max(...ps))).padEnd(11),
    String(mauv.length).padStart(3),
    mauv.length? '  -> mes.'+[...new Set(mauv.map(n=>n.bar+1))].join(',') : '  aucune');
  // controle du contour : trop de repetitions d'une meme note d'affilee ?
  let rep=1,maxrep=1;
  for(let j=1;j<notes.length;j++){ if(notes[j].pitch===notes[j-1].pitch){rep++;maxrep=Math.max(maxrep,rep);} else rep=1; }
  const saut=Math.max(...notes.slice(1).map((n,j)=>Math.abs(n.pitch-notes[j].pitch)));
  if(maxrep>5) console.log('      ! '+maxrep+' notes identiques consecutives');
  if(saut>16) console.log('      ! saut de '+saut+' demi-tons (peu chantable)');
});
