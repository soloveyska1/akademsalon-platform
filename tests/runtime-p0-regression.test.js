const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('legacy configurator cart reads the concept context without crossing script scope', () => {
  const html = read('configurator.html');
  const legacyStart = html.indexOf('function initConf()');
  const conceptStart = html.indexOf('(function initConceptWizard()');
  const legacyScript = html.slice(legacyStart, conceptStart);

  assert.ok(legacyStart >= 0 && conceptStart > legacyStart);
  assert.doesNotMatch(legacyScript, /effectiveResult\(\)/);
  assert.doesNotMatch(legacyScript, /fileNames\(\)/);
  assert.match(
    legacyScript,
    /var caseContext = window\.SalonConceptWizard && window\.SalonConceptWizard\.context[\s\S]*?\? window\.SalonConceptWizard\.context\(\)[\s\S]*?: null;/,
  );
  assert.match(
    legacyScript,
    /var academicSubmode = caseContext && caseContext\.academic_submode === 'A2'[\s\S]*?state\.tier === 'vip' \? 'A2' : 'A1'/,
  );
});

test('320px supporting-page headings cannot expand their mobile grid tracks', () => {
  const css = read('assets/css/polish15-supporting.css');

  assert.match(
    css,
    /@media \(max-width:620px\)\{[\s\S]*?\.about-manifesto\{\s*grid-template-columns:minmax\(0,1fr\);[\s\S]*?\.about-manifesto>div:last-child h2\{\s*font-size:clamp\(34px,10\.8vw,39px\);\s*overflow-wrap:anywhere;/,
  );
  assert.match(
    css,
    /@media \(max-width:620px\)\{[\s\S]*?\.club-hero h1\{\s*font-size:clamp\(36px,11\.5vw,52px\);\s*overflow-wrap:anywhere;/,
  );
});

test('320px prologue heading keeps long Russian words inside the story shell', () => {
  const css = read('assets/css/polish15-operations.css');

  assert.match(
    css,
    /@media \(max-width:360px\) \{[\s\S]*?\.story-shell > header h1 \{\s*font-size: clamp\(30px, 9\.5vw, 34px\);\s*overflow-wrap: anywhere;/,
  );
});
