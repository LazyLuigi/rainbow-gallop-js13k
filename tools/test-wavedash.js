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
const minJs = fs.readFileSync(out, 'utf8');
fs.unlinkSync(tmp); fs.unlinkSync(out);
console.log('JS terse for the test:', minJs.length, 'bytes');

const stub = require('./stub.js');

// --- the fake SDK, as strict as the real one ------------------------------
function makeSdk(opts) {
  opts = opts || {};
  const log = { calls: [], typeErrors: [] };
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
      if (opts.lbFail) return Promise.resolve({ success: false });
      if (opts.lbReject) return Promise.reject(new Error('boom'));
      // The exact shape from the generated types: `id`, never `_id`.
      return Promise.resolve({ success: true, data: { id: 'lb-' + name, name, totalEntries: 0, created: true } });
    },
    uploadLeaderboardScore(id, score, keepBest) {
      vStr(id, 'uploadLeaderboardScore.id'); vNum(score, '.score'); vBool(keepBest, '.keepBest');
      log.calls.push('uploadLeaderboardScore:' + id + '=' + score);
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
    new Function('__api', minJs + '\n; try{ __api.award = typeof wdAward === "function" ? wdAward : null; ' +
      '__api.score = typeof wdScore === "function" ? wdScore : null; }catch(e){}')(api);
  } catch (e) { thrown = e; }
  console.error = realErr;
  return { label, thrown, consoleErrors, log: made && made.log, api };
}

let fails = 0;
function check(cond, msg) { console.log((cond ? '  OK   ' : '  FAIL ') + '  ' + msg); if (!cond) fails++; }

console.log('\n1. platform present: init() must fire, with no invalid type');
{
  const r = run('present', { known: [] });
  check(!r.thrown, 'the game loads without throwing' + (r.thrown ? ' (' + r.thrown.message + ')' : ''));
  check(r.log.calls.includes('init'), 'init() called');
  check(r.log.typeErrors.length === 0, 'no argument of an invalid type' +
    (r.log.typeErrors.length ? ' -> ' + r.log.typeErrors.join(', ') : ''));
}

console.log('\n2. off platform: the global is absent, nothing may break');
{
  const r = run('absent', null);
  check(!r.thrown, 'the game loads without throwing' + (r.thrown ? ' (' + r.thrown.message + ')' : ''));
  check(r.consoleErrors.length === 0, 'no console error');
}

console.log('\n3. broken SDK: missing methods, rejected promises');
{
  const r = run('missing', { known: [], missing: ['requestStats', 'getAchievement', 'setAchievement'] });
  check(!r.thrown, 'missing methods: the game still loads');
  const r2 = run('reject', { known: [], statsReject: true, lbReject: true, upReject: true });
  check(!r2.thrown, 'rejected promises: the game still loads');
}

console.log('\n' + (fails ? fails + ' FAILURE(S)' : 'ALL WAVEDASH TESTS PASS'));
process.exit(fails ? 1 : 0);
