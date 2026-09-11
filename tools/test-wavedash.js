// Recette de l'integration Wavedash, jouee sur la SORTIE TERSER et non sur la
// source : c'est terser qui reecrit le code, donc c'est lui qui peut casser un
// appel d'API sans que rien n'apparaisse dans la console.
//
// Le stub imite la seule chose qui compte ici : le SDK Wavedash valide le type
// de ses arguments et leve sur un type inattendu. Un stub permissif ne testerait
// rien -- il accepterait `setAchievement(id, 1)` la ou le vrai SDK refuse.
// Voir le piege `booleans_as_integers` documente dans le README.
//
//   node tools/test-wavedash.js [src/index.html]
const fs = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');

const srcPath = process.argv[2] || path.join(__dirname, '..', 'src', 'index.html');
const html = fs.readFileSync(srcPath, 'utf8');
const rawJs = html.match(/<script>([\s\S]*)<\/script>/)[1];

// Memes options que build.sh, mangle toplevel en moins : il renomme les
// fonctions du jeu, ce qui empeche de les appeler depuis le test. Il ne change
// pas la semantique qu'on verifie ici.
const tmp = path.join(require('os').tmpdir(), 'wd-in-' + process.pid + '.js');
const out = path.join(require('os').tmpdir(), 'wd-out-' + process.pid + '.js');
fs.writeFileSync(tmp, rawJs);
const terser = ['./node_modules/.bin/terser', 'terser'].find(p => { try { execFileSync(p, ['--version'], {stdio:'ignore'}); return true; } catch (e) { return false; } });
if (!terser) { console.error('terser introuvable : npm install'); process.exit(1); }
execFileSync(terser, [tmp, '-c', 'passes=3,unsafe=true', '-o', out]);
const minJs = fs.readFileSync(out, 'utf8');
fs.unlinkSync(tmp); fs.unlinkSync(out);
console.log('JS terse pour le test :', minJs.length, 'octets');

const stub = require('./stub.js');

// --- le faux SDK, aussi severe que le vrai -------------------------------
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
      if (!known.has(id)) return false;          // le vrai SDK ignore un id inconnu, sans un mot
      unlocked.add(id); return true;
    },
    getOrCreateLeaderboard(name, sort, display) {
      vStr(name, 'getOrCreateLeaderboard.name'); vNum(sort, '.sortOrder'); vNum(display, '.displayType');
      log.calls.push('getOrCreateLeaderboard:' + name);
      if (opts.lbFail) return Promise.resolve({ success: false });
      if (opts.lbReject) return Promise.reject(new Error('boom'));
      // La forme exacte des types generes : `id`, jamais `_id`.
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
function check(cond, msg) { console.log((cond ? '  OK   ' : '  ECHEC') + '  ' + msg); if (!cond) fails++; }

console.log('\n1. plateforme presente : init() doit partir, sans type invalide');
{
  const r = run('present', { known: [] });
  check(!r.thrown, 'le jeu se charge sans lever' + (r.thrown ? ' (' + r.thrown.message + ')' : ''));
  check(r.log.calls.includes('init'), 'init() appele');
  check(r.log.typeErrors.length === 0, 'aucun argument de type invalide' +
    (r.log.typeErrors.length ? ' -> ' + r.log.typeErrors.join(', ') : ''));
}

console.log('\n2. hors plateforme : le global est absent, rien ne doit casser');
{
  const r = run('absent', null);
  check(!r.thrown, 'le jeu se charge sans lever' + (r.thrown ? ' (' + r.thrown.message + ')' : ''));
  check(r.consoleErrors.length === 0, 'aucune erreur console');
}

console.log('\n3. SDK casse : methodes absentes, promesses rejetees');
{
  const r = run('missing', { known: [], missing: ['requestStats', 'getAchievement', 'setAchievement'] });
  check(!r.thrown, 'methodes manquantes : le jeu se charge quand meme');
  const r2 = run('reject', { known: [], statsReject: true, lbReject: true, upReject: true });
  check(!r2.thrown, 'promesses rejetees : le jeu se charge quand meme');
}

console.log('\n' + (fails ? fails + ' ECHEC(S)' : 'TOUS LES TESTS WAVEDASH PASSENT'));
process.exit(fails ? 1 : 0);
