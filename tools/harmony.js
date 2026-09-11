// Controle d'harmonie de la musique EMBARQUEE : chaque note de la melodie
// tombe-t-elle juste sur l'accord de sa mesure ? Signale les demi-tons, les
// tritons, les tierces contraires au mode, et les quartes sur temps fort.
const fs=require('fs');
const src=fs.readFileSync(process.argv[2]||__dirname+'/../src/index.html','utf8');
const MEL=(src.match(/var MEL=([\s\S]*?);\n/)[1].match(/"[^"]*"/g)||[]).map(x=>x.slice(1,-1)).join('');
const MR=JSON.parse(src.match(/var MR=(\[[^\]]*\])/)[1]);
const MT=JSON.parse(src.match(/MT=(\[[^\]]*\])/)[1]);
const SCA=JSON.parse(src.match(/var SCA=(\[[^\]]*\])/)[1]);
const NOMS=['do','do#','re','re#','mi','fa','fa#','sol','sol#','la','la#','si'];
const nom=m=>NOMS[((m%12)+12)%12]+(Math.floor(m/12)-1);

console.log('melodie : '+MEL.length+' pas = '+(MEL.length/16)+' mesures, '+MR.length+' accords');
let fautes=0, notes=0, reg={A:[],B:[]};
for(let i=0;i<MEL.length;i++){
  const c=MEL.charAt(i); if(c==='.'||c==='-') continue;
  const bar=(i>>4), q=i&15, p=SCA[parseInt(c,36)], r=MR[bar], ty=MT[bar];
  const iv=((p-r)%12+12)%12, fort=(q%4===0);
  const grave = iv===1 || iv===6 || (ty!==1&&iv===3) || (ty===1&&iv===4);
  notes++; reg[bar<8?'A':'B'].push(60+p);
  if(grave||(fort&&iv===5)){
    fautes++;
    console.log('  faute mesure '+(bar+1)+' pas '+q+' : '+nom(60+p)+' sur accord '+nom(60+r));
  }
}
const amp=t=>reg[t].length?nom(Math.min(...reg[t]))+'..'+nom(Math.max(...reg[t])):'(vide)';
console.log('notes analysees : '+notes+'   fautes : '+fautes);
console.log('registre section A : '+amp('A'));
console.log('registre section B : '+amp('B')+'   (le B doit monter plus haut)');
process.exit(fautes?1:0);
