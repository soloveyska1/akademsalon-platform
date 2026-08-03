const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('home is an open editorial desk instead of a gated wizard or a long catalogue', () => {
  const home = read('index.html');
  const desk = home.slice(home.indexOf('<section class="guided-desk"'), home.indexOf('<section class="case-hero"'));
  const intro = desk.slice(desk.indexOf('<header class="guided-desk__intro">'), desk.indexOf('<section class="guided-desk__studio"'));
  const dossier = desk.slice(desk.indexOf('<section class="guided-desk__dossier"'));

  assert.match(home, /class="guided-desk"[^>]+data-guided-desk/);
  assert.match(home, /<body class="home-flow-page">/);
  assert.equal((desk.match(/data-desk-situation/g) || []).length, 3);
  assert.equal((intro.match(/class="guided-desk__button/g) || []).length, 0);
  assert.equal((dossier.match(/class="guided-desk__button/g) || []).length, 2);
  assert.match(desk, /id="deskStart"/);
  assert.match(desk, /data-desk-announcement/);
  assert.match(desk, /data-desk-artifact/);
  assert.match(home, /<section class="guided-process" aria-labelledby="guidedProcessTitle">/);
  assert.match(home, /<section class="guided-proof guided-shell" aria-labelledby="guidedProofTitle">/);
  assert.match(home, /<section class="guided-faq guided-shell" aria-labelledby="guidedFaqTitle">/);
  assert.match(home, /<section class="guided-final guided-shell" aria-labelledby="guidedFinalTitle">/);
  assert.match(home, /<section class="case-hero"[^>]+hidden>/);
});

test('editorial desk keeps normal scrolling, mobile flow and a persistent live choice', () => {
  const css = read('assets/css/home-guided-flow.css');
  const js = read('assets/js/home-guided-flow.js');
  const build = read('scripts/build-home-release.mjs');
  const home = read('index.html');

  assert.match(css, /body\.home-flow-page\{[\s\S]*?overflow-y:auto/);
  assert.match(css, /\.home-guided \.guided-desk\{[\s\S]*?min-height:calc\(100svh - 74px\)/);
  assert.doesNotMatch(css, /site-footer[\s\S]{0,100}display:none/);
  assert.match(css, /@media \(max-width:620px\)\{[\s\S]*?\.guided-desk__layout\{[\s\S]*?grid-template-columns:1fr/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(js, /text:\s*\{[\s\S]*?comments:\s*\{[\s\S]*?defense:\s*\{/);
  assert.match(js, /function selectSituation\(code, options\)/);
  assert.match(js, /localStorage\.setItem\('salon_home_situation', code\)/);
  assert.match(js, /localStorage\.getItem\('salon_home_situation'\)/);
  assert.match(js, /input\.addEventListener\('change'/);
  assert.doesNotMatch(js, /function show\(nextStep/);
  assert.match(build, /'assets\/css\/home-guided-flow\.css'/);
  assert.match(build, /'assets\/js\/home-guided-flow\.js'/);
  assert.match(home, /home-release\.min\.css\?v=20260803out003shell1/);
  assert.match(home, /home-release\.min\.js\?v=20260803out005services1/);
});

test('fresh visit waits for an explicit choice and restores only a real saved choice', () => {
  const home = read('index.html');
  const js = read('assets/js/home-guided-flow.js');

  assert.doesNotMatch(home, /data-desk-situation[^>]+checked/);
  assert.match(home, /data-desk-prompt/);
  assert.match(home, /data-desk-dossier[^>]+hidden/);
  assert.match(js, /var initial = ''/);
  assert.match(js, /if \(initial\) \{\s*selectSituation\(initial, \{ initial: true \}\)/);
  assert.match(js, /window\.requestAnimationFrame\(revealDossierOnCompactScreen\)/);
  assert.match(js, /mobilePrimary\.href = '#deskStart'/);
});

test('a new mobile choice overrides a stale draft route without deleting the draft', () => {
  const js = read('assets/js/home-guided-flow.js');

  assert.match(js, /var shouldSyncMobilePrimary = mobilePrimaryCanSync \|\| !options\.initial/);
  assert.match(js, /mobilePrimary\.href = route\.primary/);
  assert.match(js, /mobilePrimary\.removeAttribute\('data-resume-draft'\)/);
  assert.doesNotMatch(js, /localStorage\.removeItem\([^)]*draft/i);
});
