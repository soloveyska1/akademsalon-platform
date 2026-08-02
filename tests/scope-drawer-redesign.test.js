const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const story = fs.readFileSync(path.join(root, 'assets/css/home-story.css'), 'utf8');
const finalLayer = story.slice(story.lastIndexOf('SCOPE DRAWER'));

test('drawer close control is a labeled capsule with its own wax mark', () => {
  assert.match(home, /case-scope-drawer__close-label">Закрыть<\/span>/);
  assert.match(home, /case-scope-drawer__close-mark" aria-hidden="true"><i><\/i><\/span>/);
  assert.match(finalLayer, /\.case-scope-drawer__close\{[\s\S]*?border-radius:999px/);
  assert.match(finalLayer, /\.case-scope-drawer__close \.case-scope-drawer__close-label\{[\s\S]*?font:620 9px/);
  assert.match(finalLayer, /\.case-scope-drawer__close \.case-scope-drawer__close-mark\{[\s\S]*?width:32px[\s\S]*?height:32px[\s\S]*?background:var\(--story-red/);
  assert.match(finalLayer, /\.case-scope-drawer__close \.case-scope-drawer__close-label\{[\s\S]*?transform:none/);
  assert.match(finalLayer, /\.case-scope-drawer__close:hover \.case-scope-drawer__close-label,[\s\S]*?transform:none/);
  assert.match(finalLayer, /\.case-scope-drawer__close:focus-visible\{/);
});

test('situations use a two-column card set with a phone list fallback', () => {
  assert.match(finalLayer, /\.case-scope-drawer__list\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(finalLayer, /\.case-scope-drawer__list button\{[\s\S]*?border-radius:10px/);
  assert.match(finalLayer, /@media\(max-width:620px\)\{[\s\S]*?grid-template-columns:1fr/);
});

test('drawer motion remains optional', () => {
  assert.match(finalLayer, /@keyframes scope-card-in/);
  assert.match(finalLayer, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(finalLayer, /animation:none!important/);
});
