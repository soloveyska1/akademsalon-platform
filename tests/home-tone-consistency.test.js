const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const story = fs.readFileSync(path.join(root, 'assets/css/home-story.css'), 'utf8');
const finalTone = story.slice(story.indexOf('FINAL TONE SYSTEM'));

test('home light scene uses one adjacent paper palette', () => {
  for (const token of [
    '--home-paper-light:#f7f0e6',
    '--home-paper:#efe5d6',
    '--home-paper-deep:#e7dac7',
    '--home-sheet:#fffaf2',
  ]) {
    assert.match(finalTone, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(
    finalTone,
    /:root:not\(\[data-theme="dark"\]\) \.home-case\{[\s\S]*?linear-gradient\(180deg,var\(--home-paper-light\)[\s\S]*?var\(--home-paper-deep\)/,
  );
});

test('trust strip is a warm bridge instead of a pasted black band', () => {
  assert.match(
    finalTone,
    /\.case-confidence-shell\{[\s\S]*?linear-gradient\(180deg,#e9decd 0%,#e2d4bf 100%\)/,
  );
  assert.match(
    finalTone,
    /\.case-confidence strong,[\s\S]*?color:var\(--story-ink\)/,
  );
});

test('dark chapters keep the graphite base and add deliberate oxblood scenes', () => {
  assert.match(
    finalTone,
    /\.case-dossier,[\s\S]*?\.case-final\{[\s\S]*?linear-gradient\(145deg,var\(--home-night-soft\)[\s\S]*?var\(--home-night-deep\)/,
  );
  assert.match(
    finalTone,
    /\.case-dossier::before,[\s\S]*?\.case-final::before\{[\s\S]*?background:var\(--story-red\)/,
  );
  assert.match(
    finalTone,
    /:root\[data-theme="dark"\] \.home-case \.case-confidence-shell,[\s\S]*?\.case-final\{[\s\S]*?border-top:1px solid rgba\(255,118,87,\.28\)/,
  );
  assert.match(
    finalTone,
    /\.case-results\{[\s\S]*?linear-gradient\(150deg,#2a0e09,#160806 68%,#0b0504\)/,
  );
  assert.match(
    finalTone,
    /\.case-final\{[\s\S]*?border-top:4px solid #ff6b4b;/,
  );
});
