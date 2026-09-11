// Pilote automatique pour record-gif.py : appele une fois par image, avant que
// le jeu n'avance. Il n'imite pas des evenements clavier, il ecrit directement
// dans l'objet `keys` que playerStep() lit, ce qui est ce que le jeu consomme.
//
// Ce qu'il joue : il tient la voie de sa couleur (8 % de vitesse), saute les
// haies pleines, vise les anneaux et les boites d'objets, se decale du cote
// libre sur les haies partielles, et tire quand il a de quoi.
window.__drive = function () {
  var P = window.P, k = window.keys, segs = window.segs;
  var NS = window.NS, SEGL = window.SEGL, PLZ = window.PLZ;
  if (!P || !segs || !segs.length) return;

  if (window.mode === 0) {                 // demo d'attente : on lance la course
    if (!window.__started) { window.__started = 1; window.go(); }
    return;
  }
  if (window.mode !== 2) return;           // decompte ou arrivee : on ne touche a rien

  var z = P.z + PLZ, base = (z / SEGL) | 0;
  var spd = Math.max(P.spd, 2500);
  var tx = 0, jump = 0, i, s, tt;

  // Couloir vise : celui dont la couleur est la mienne, lu un peu en avant pour
  // avoir le temps d'y arriver. Le motif se decale d'un couloir par mesure.
  var nA = ((base + 10) % NS + NS) % NS;
  for (i = 0; i < 3; i++) if (window.lidx(nA, i) === P.col) tx = (i - 1) * 0.667;

  // Balayage des obstacles proches, converti en temps avant impact.
  for (i = 1; i <= 16; i++) {
    s = segs[((base + i) % NS + NS) % NS];
    tt = (i * SEGL) / spd;
    if (s.hd) {
      var hc = s.hd === 2 ? -0.55 : s.hd === 3 ? 0.55 : 0;
      var hw = s.hd === 1 ? 1.1 : 0.52;
      // Le saut culmine a 900 unites apres 0,375 s ; il faut donc partir
      // environ 0,2 s avant la haie pour la franchir au-dessus de HDH=430.
      if (s.hd === 1) { if (tt > 0.14 && tt < 0.30) jump = 1; }
      else if (Math.abs(tx - hc) < hw + 0.12) tx = hc > 0 ? -0.62 : 0.62;
    }
    if (s.rg && tt > 0.14 && tt < 0.30) { tx = s.rg; jump = 1; }
    if (s.bo && tt < 0.55 && !P.it) tx = s.bo;
  }

  var dx = tx - P.x;
  k.arrowleft  = dx < -0.04 ? 1 : 0;
  k.arrowright = dx >  0.04 ? 1 : 0;
  k.arrowup    = jump ? 1 : 0;
  k[' ']       = (P.it && Math.random() < 0.05) ? 1 : 0;
};
