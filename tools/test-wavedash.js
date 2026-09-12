// Acceptance test for the Wavedash integration, run against the TERSER OUTPUT
// rather than the source: terser is what rewrites the code, so terser is what
// can break an API call without a word in the console.
//
// The stub imitates the one thing that matters here: the Wavedash SDK validates
// its argument types and throws on an unexpected one. A permissive stub would
// test nothing -- it would accept `setAchievement(id, 1)` where the real SDK
// refuses it. See the `booleans_as_integers` trap documented in the README.
//
//   node tools/test-wavedash.js [src/index.html]
const fs = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');

const srcPath = process.argv[2] || path.join(__dirname, '..', 'src', 'index.html');
const html = fs.readFileSync(srcPath, 'utf8');
const rawJs = html.match(/<script>([\s\S]*)<\/script>/)[1];

// Same options as build.sh, minus toplevel mangling: it renames the game's
// functions, which stops the test calling them. It does not change the
// semantics being checked here.
const tmp = path.join(require('os').tmpdir(), 'wd-in-' + process.pid + '.js');
const out = path.join(require('os').tmpdir(), 'wd-out-' + process.pid + '.js');
fs.writeFileSync(tmp, rawJs);
const terser = ['./node_modules/.bin/terser', 'terser'].find(p => { try { execFileSync(p, ['--version'], {stdio:'ignore'}); return true; } catch (e) { return false; } });
if (!terser) { console.error('terser not found: npm install'); process.exit(1); }
execFileSync(terser, [tmp, '-c', 'passes=3,unsafe=true', '-o', out]);
const minJs = process.env.WD_SOURCE ? rawJs : fs.readFileSync(out, 'utf8');
fs.unlinkSync(tmp); fs.unlinkSync(out);
console.log(process.env.WD_SOURCE ? 'Testing source:' : 'Testing Terser output:', Buffer.byteLength(minJs), 'bytes');

const stub = require('./stub.js');

// --- the fake SDK, as strict as the real one ------------------------------
function makeSdk(opts) {
  opts = opts || {};
  const log = { calls: [], typeErrors: [], boards: [], scores: [] };
  function vBool(v, where) {
    if (typeof v !== 'boolean') { log.typeErrors.push(where + ': ' + typeof v + ' ' + v); throw new Error(where + ': expected boolean'); }
  }
  function vStr(v, where) {
    if (typeof v !== 'string') { log.typeErrors.push(where + ': ' + typeof v); throw new Error(where + ': expected string'); }
  }
  function vNum(v, where) {
    if (typeof v !== 'number' || !isFinite(v)) { log.typeErrors.push(where + ': ' + typeof v); throw new Error(where + ': expected number'); }
  }
  const known = new Set(opts.known || []);
  const unlocked = new Set();
  const sdk = {
    init() { log.calls.push('init'); return true; },
    requestStats() {
      log.calls.push('requestStats');
      if (opts.statsReject) return Promise.reject(new Error('boom'));
      return Promise.resolve({ success: !opts.statsFail, data: !opts.statsFail });
    },
    getAchievement(id) { vStr(id, 'getAchievement.identifier'); log.calls.push('getAchievement:' + id); return unlocked.has(id); },
    setAchievement(id, storeNow) {
      vStr(id, 'setAchievement.identifier'); vBool(storeNow, 'setAchievement.storeNow');
      log.calls.push('setAchievement:' + id);
      if (!known.has(id)) return false;          // the real SDK ignores an unknown id, silently
      unlocked.add(id); return true;
    },
    getOrCreateLeaderboard(name, sort, display) {
      vStr(name, 'getOrCreateLeaderboard.name'); vNum(sort, '.sortOrder'); vNum(display, '.displayType');
      log.calls.push('getOrCreateLeaderboard:' + name);
      log.boards.push([name, sort, display]);
      if (opts.lbFail) return Promise.resolve({ success: false });
      if (opts.lbReject) return Promise.reject(new Error('boom'));
      // The exact shape from the generated types: `id`, never `_id`.
      return Promise.resolve({ success: true, data: { id: 'lb-' + name, name, totalEntries: 0, created: true } });
    },
    uploadLeaderboardScore(id, score, keepBest) {
      vStr(id, 'uploadLeaderboardScore.id'); vNum(score, '.score'); vBool(keepBest, '.keepBest');
      log.calls.push('uploadLeaderboardScore:' + id + '=' + score);
      log.scores.push([id, score, keepBest]);
      if (opts.upFail) return Promise.resolve({ success: false });
      if (opts.upReject) return Promise.reject(new Error('boom'));
      return Promise.resolve({ success: true });
    }
  };
  for (const m of opts.missing || []) delete sdk[m];
  return { sdk, log };
}

function run(label, sdkOpts, after) {
  stub.install(1280, 720);
  const consoleErrors = [];
  const realErr = console.error; console.error = (...a) => consoleErrors.push(a.join(' '));
  let made = null;
  if (sdkOpts !== null) { made = makeSdk(sdkOpts); global.Wavedash = made.sdk; global.self.Wavedash = made.sdk; }
  else { delete global.Wavedash; delete global.self.Wavedash; }
  let thrown = null;
  const api = {};
  try {
    new Function('__api', minJs + '\n; __api.go=go; __api.step=step; __api.keys=keys; ' +
      '__api.getP=function(){return P;}; __api.getMode=function(){return mode;}; ' +
      '__api.setMode=function(m){mode=m;}; __api.segAt=segAt; __api.PLZ=PLZ; __api.award=award; ' +
      '__api.eval=function(s){return eval(s);}; __api.wdScore=wdScore; __api.wdFlush=wdFlush;')(api);
  } catch (e) { thrown = e; }
  console.error = realErr;
  return { label, thrown, consoleErrors, log: made && made.log, api };
}

// Plays a whole race on the terser output. This is what catches a misplaced
// guard: a static check sees the calls, only a full race proves they fire.
function race(r) {
  const { go, step, keys, getP, getMode, setMode, segAt, PLZ } = r.api;
  go(); setMode(2);
  const P = getP();
  for (let i = 0; i < 60 * 200 && getMode() === 2; i++) {
    const s = segAt(P.z + PLZ);
    const w = Math.max(-1, Math.min(1, s.c * 0.22 - P.x * 2));
    keys.arrowleft = w < -0.15 ? 1 : 0; keys.arrowright = w > 0.15 ? 1 : 0;
    const ah = segAt(P.z + PLZ + 2500);
    keys.arrowup = (ah.hd || ah.rg) ? 1 : 0;
    step(1 / 60);
    keys.arrowup = 0;
  }
  return getMode();
}

// The identifiers the portal must know. setAchievement() returns false without
// a word for anything absent from it, so the game, this list and the portal
// have to agree.
const definitions = require('../wavedash-achievements.json');
const IDS = definitions.achievements.map(a => a.identifier);
const LEADERBOARDS = ['race-v1', 'lap-v1', 'speed-v1', 'combo-v1'];

let fails = 0;
function check(cond, msg) { console.log((cond ? '  OK   ' : '  FAIL ') + '  ' + msg); if (!cond) fails++; }

// Lets the microtask queue drain: requestStats() resolves as a promise, and a
// whole race runs synchronously here, so without this the queued trophies have
// not been flushed yet. In a browser the promise settles long before the first
// trophy; this is what proves the queue is emptied afterwards.
const tick = () => new Promise(r => setImmediate(r));

(async () => {

const sourceIds = [...rawJs.matchAll(/award\('([^']+)'\)/g)].map(m => m[1]);
check(IDS.length === 10 && new Set(IDS).size === 10, 'ten unique JSON identifiers');
check(JSON.stringify([...sourceIds].sort()) === JSON.stringify([...IDS].sort()), 'JSON exactly matches all game triggers');
check(definitions.stats.length === 0 && definitions.achievements.every(a => a.display_name && a.description && a.stat_requirement === null), 'portal import schema');

console.log('\n1. platform present: init() must fire, with no invalid type');
{
  const r = run('present', { known: IDS });
  await tick();
  check(!r.thrown, 'the game loads without throwing' + (r.thrown ? ' (' + r.thrown.message + ')' : ''));
  check(r.log.calls.includes('init'), 'init() called');
  check(r.log.calls.includes('requestStats'), 'requestStats() called, without which no trophy ever unlocks');
  check(r.log.typeErrors.length === 0, 'no argument of an invalid type' +
    (r.log.typeErrors.length ? ' -> ' + r.log.typeErrors.join(', ') : ''));
}

console.log('\n2. off platform: the global is absent, nothing may break');
{
  const r = run('absent', null);
  await tick();
  check(!r.thrown, 'the game loads without throwing' + (r.thrown ? ' (' + r.thrown.message + ')' : ''));
  check(r.consoleErrors.length === 0, 'no console error');
}

console.log('\n3. a full race: do the trophies and scores actually fire?');
{
  const r = run('race', { known: IDS });
  await tick();                      // requestStats resolves before the race
  const mode = race(r);
  await tick(); await tick();        // then the leaderboard promises settle
  check(mode === 3, 'the race reaches the results screen');
  const set = r.log.calls.filter(c => c.indexOf('setAchievement:') === 0).map(c => c.slice(15));
  check(set.indexOf('FIRST_GALLOP') >= 0, 'FIRST_GALLOP fires at the finish');
  check(set.length >= 2, 'more than one trophy fires (' + set.length + ': ' + set.join(', ') + ')');
  check(set.every(id => IDS.indexOf(id) >= 0), 'every identifier sent is one the portal knows' +
    ' -> ' + set.filter(id => IDS.indexOf(id) < 0).join(', '));
  const lb = r.log.calls.filter(c => c.indexOf('getOrCreateLeaderboard:') === 0).map(c => c.slice(23));
  check(LEADERBOARDS.every(n => lb.indexOf(n) >= 0), 'all 4 leaderboards are created (' + lb.join(', ') + ')');
  const up = r.log.calls.filter(c => c.indexOf('uploadLeaderboardScore:') === 0);
  check(up.length === LEADERBOARDS.length, 'all 4 scores are uploaded (' + up.length + ')');
  check(r.log.typeErrors.length === 0, 'no argument of an invalid type over a whole race' +
    (r.log.typeErrors.length ? ' -> ' + r.log.typeErrors.join(', ') : ''));
  check(r.consoleErrors.length === 0, 'no console error');
}

console.log('\n4. trophies won before the stats answer must not be lost');
{
  const r = run('queued', { known: IDS });   // no tick(): stats have not answered yet
  r.api.award('PERFECT_LEAP');
  check(r.log.calls.filter(c => c.indexOf('setAchievement') === 0).length === 0,
    'nothing is sent while the stats have not answered');
  await tick();
  check(r.log.calls.indexOf('setAchievement:PERFECT_LEAP') >= 0,
    'the queued trophy is flushed once they have');
}

console.log('\n5. broken SDK: missing methods, rejected promises, refusals');
{
  const r = run('missing', { known: IDS, missing: ['requestStats', 'getAchievement', 'setAchievement'] });
  await tick();
  check(!r.thrown, 'missing methods: the game still loads');
  const r2 = run('reject', { known: IDS, statsReject: true, lbReject: true, upReject: true });
  await tick(); race(r2); await tick(); await tick();
  check(!r2.thrown, 'rejected promises: a whole race still runs');
  check(r2.consoleErrors.length === 0, 'rejected promises: no console error');
  const r3 = run('refuse', { known: [], upFail: true, lbFail: true });
  await tick(); race(r3); await tick(); await tick();
  check(r3.consoleErrors.length === 0, 'unknown ids and {success:false}: no console error');
}

console.log('\n6. every trophy: actual gameplay conditions, thresholds and reset');
{
  const r = run('triggers', { known: IDS }); await tick();
  const e = r.api.eval;
  // Controlled fixtures exercise playerStep(), never award() directly.
  const setup = `reset(); mode=2; P.spd=6000; P.x=0; P.hz=-1;
    for(var j=1;j<6;j++){RC[j].z=20000+j*3000;RC[j].x=0.8;}
    var s=segAt(P.z+PLZ); s.c=0; s.hd=s.rg=s.a=s.bo=s.b=0;
    P.col=lidx(s.n,lane(P.x));`;
  const got = id => r.log.calls.includes('setAchievement:' + id);
  function scenario(id, code) {
    e(setup + code); check(got(id), id + ' triggered by gameplay');
  }
  scenario('PERFECT_LEAP', 's.hd=1; P.air=500; playerStep(0);');
  e(setup + 's.rg=0.1; P.x=0.1; P.air=500; P.rng=1; playerStep(0);');
  check(!got('RING_RUNNER'), 'two rings do not award RING_RUNNER');
  e('P.hz=-1; playerStep(0);'); check(got('RING_RUNNER'), 'third ring awards RING_RUNNER');
  e(setup + 'P.mt=10; playerStep(0);'); check(!got('TRUE_COLOURS'), 'exactly ten seconds is below colour threshold');
  e('playerStep(0.01);'); check(got('TRUE_COLOURS'), 'colour bonus over ten seconds awards TRUE_COLOURS');
  e(setup + 'P.boost=1; P.spd=15000; playerStep(0);'); check(!got('LIGHT_SPEED'), 'exactly 500 km/h is below speed threshold');
  e('P.spd=15001; playerStep(0);'); check(got('LIGHT_SPEED'), 'above 500 km/h awards LIGHT_SPEED');
  scenario('SLIPSTREAM_ACE', 'P.asp=0.995; RC[1].z=pz(P)+1000; RC[1].x=P.x; playerStep(0.01);');
  // Only the rhythm clock is faked; sound synthesis remains disabled.
  scenario('ON_THE_BEAT', 'snd=function(){}; AC={currentTime:0}; musG=1; mStep=0; mNext=0; P.cmb=4; keys.arrowup=1; playerStep(0); keys.arrowup=0; AC=0;');
  e(setup + 'P.z=TRACKLEN-1; P.lap=LAPS; raceT=100; lapT=30; best=32; playerStep(0.01);');
  for (const id of ['FIRST_GALLOP','PODIUM','RAINBOW_CROWN','CLEAN_SHEET']) check(got(id), id + ' at a clean winning finish');
  e('reset();'); check(e('P.rng===0 && P.mt===0 && P.top===0 && P.mxc===0 && P.cln===1'), 'race counters reset');
  e(setup + 's.hd=1; playerStep(0);'); check(e('P.cln===0'), 'hurdle invalidates clean sheet');
  e(setup + 'P.x=1.2; playerStep(0);'); check(e('P.cln===0'), 'fall invalidates clean sheet');
  await tick(); await tick();
  const contracts = [['race-v1',0,2],['lap-v1',0,2],['speed-v1',1,0],['combo-v1',1,0]];
  check(JSON.stringify(r.log.boards) === JSON.stringify(contracts), 'all leaderboard sort/display contracts');
  check(r.log.scores[0][1] === 100000 && r.log.scores[1][1] === 30000, 'race and best lap converted to milliseconds');
  check(r.log.scores[3][1] === 0, 'zero combo is uploaded');
  r.api.wdScore('speed-v1', 123.6, 1, 0); await tick();
  check(r.log.scores.at(-1)[1] === 124 && r.log.scores.every(s => s[2] === true), 'scores rounded and keepBest remains boolean true');
  IDS.forEach(id => r.api.award(id)); r.api.wdFlush();
  check(IDS.every(id => r.log.calls.filter(c => c === 'setAchievement:' + id).length === 1), 'all ten awards deduplicated');
  check(r.log.typeErrors.length === 0, 'no SDK type violation in targeted conditions');
}
console.log('\n7. upload rejection is tested independently from creation');
{
  const r = run('upload rejects', { known: IDS, upReject: true }); await tick();
  race(r); await tick(); await tick();
  check(r.log.scores.length === 4, 'four uploads reached despite rejected upload promises');
  const q = run('retry', { known: [] }); await tick();
  q.api.award('PERFECT_LEAP'); q.api.wdFlush();
  check(q.log.calls.filter(c => c === 'setAchievement:PERFECT_LEAP').length === 2, 'refused trophy retained for later flush');
}

console.log('\n' + (fails ? fails + ' FAILURE(S)' : 'ALL WAVEDASH TESTS PASS'));
process.exit(fails ? 1 : 0);

})();
