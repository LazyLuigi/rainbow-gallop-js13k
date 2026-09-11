// Autopilot for record-gif.py: called once per frame, before the game advances.
// It does not fake keyboard events, it writes straight into the `keys` object
// that playerStep() reads, which is what the game actually consumes.
//
// What it plays: it holds the lane matching its own colour (worth 8% speed),
// jumps full-width hurdles, aims for rings and item boxes, sidesteps partial
// hurdles, and fires whenever it is holding something.
window.__drive = function () {
  var P = window.P, k = window.keys, segs = window.segs;
  var NS = window.NS, SEGL = window.SEGL, PLZ = window.PLZ;
  if (!P || !segs || !segs.length) return;

  if (window.mode === 0) {                 // attract loop: start the race
    if (!window.__started) { window.__started = 1; window.go(); }
    return;
  }
  if (window.mode !== 2) return;           // countdown or results: touch nothing

  var z = P.z + PLZ, base = (z / SEGL) | 0;
  var spd = Math.max(P.spd, 2500);
  var tx = 0, jump = 0, i, s, tt;

  // Target lane: the one whose colour matches ours, read a little ahead so
  // there is time to get there. The pattern shifts by one lane every bar.
  var nA = ((base + 10) % NS + NS) % NS;
  for (i = 0; i < 3; i++) if (window.lidx(nA, i) === P.col) tx = (i - 1) * 0.667;

  // Sweep the obstacles ahead, converted to time before impact.
  for (i = 1; i <= 16; i++) {
    s = segs[((base + i) % NS + NS) % NS];
    tt = (i * SEGL) / spd;
    if (s.hd) {
      var hc = s.hd === 2 ? -0.55 : s.hd === 3 ? 0.55 : 0;
      var hw = s.hd === 1 ? 1.1 : 0.52;
      // A jump peaks at 900 units after 0.375 s, so it has to start about
      // 0.2 s before the hurdle to clear it above HDH = 430.
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
