// Simule trois niveaux de joueur et mesure place, ecarts et progression.
const fs=require('fs'), stub=require('./stub');
const js=fs.readFileSync(process.argv[2]||__dirname+'/../src/index.html','utf8').match(/<script>([\s\S]*)<\/script>/)[1];
function boot(){
  stub.install(1280,720);
  let G=null;
  new Function('__t',js+'\n; __t({step:step,go:go,keys:keys,segAt:segAt,PLZ:PLZ,MAXS:MAXS,prog:prog,place:place,TRACKLEN:TRACKLEN,getP:function(){return P;},getRC:function(){return RC;},getMode:function(){return mode;},setMode:function(m){mode=m;}});')(g=>G=g);
  return G;
}
function course(rateJump, chutes, nom){
  const G=boot(); G.go(); G.setMode(2);
  const P=G.getP(), RC=G.getRC();
  let t=0, g=0, prochaineChute=chutes?25:1e9, faites=0, hist=[];
  while(G.getMode()===2 && g++<60*400){
    const s=G.segAt(P.z+G.PLZ);
    const w=Math.max(-1,Math.min(1,s.c*0.22-P.x*2));
    G.keys.arrowleft=w<-0.15?1:0; G.keys.arrowright=w>0.15?1:0;
    const ah=G.segAt(P.z+G.PLZ+2500);
    let saut=false;
    if(ah.hd){ const c=ah.hd===2?-0.55:ah.hd===3?0.55:0, hw=ah.hd===1?1.1:0.52;
      if(Math.abs(P.x-c)<hw+0.1) saut = (ah.n*7919%100)/100 < rateJump; }
    G.keys.arrowup=saut?1:0;
    if(t>prochaineChute&&faites<chutes){ P.x=1.5; faites++; prochaineChute=t+28; }
    G.step(1/60); t+=1/60;
    if(g%120===0) hist.push(G.place(P));
  }
  const cl=RC.slice().sort((a,b)=>G.prog(b)-G.prog(a));
  const ecart=(G.prog(cl[0])-G.prog(P))/11000;
  const dernier=(G.prog(P)-G.prog(cl[5]))/11000;
  console.log(nom.padEnd(34)+'place '+(cl.indexOf(P)+1)+'/6   temps '+t.toFixed(1)+'s'+
    '   ecart au 1er '+ecart.toFixed(1)+'s   avance sur le dernier '+dernier.toFixed(1)+'s');
  return hist;
}
console.log('reussite des sauts / chutes volontaires');
const h1=course(1.00,0,'expert : 100 % de sauts, 0 chute');
course(0.80,1,'bon joueur : 80 % de sauts, 1 chute');
course(0.55,2,'moyen : 55 % de sauts, 2 chutes');
course(0.30,4,'debutant : 30 % de sauts, 4 chutes');
console.log('\nprogression de l expert dans le peloton (place toutes les 2 s) :');
console.log('  '+h1.filter((_,i)=>i%3===0).join(' '));
