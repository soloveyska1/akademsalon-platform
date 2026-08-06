const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const story = fs.readFileSync(path.join(root, 'assets/css/home-story.css'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'assets/css/styles.css'), 'utf8');
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const darkLayer = story.slice(story.lastIndexOf('DARK THEME'));

test('dark theme uses a true black canvas with warm high-contrast type', () => {
  assert.match(darkLayer, /--canvas:#050505/);
  assert.match(darkLayer, /--sheet:#141210/);
  assert.match(darkLayer, /--ink:#f6efe5/);
  assert.match(darkLayer, /--wax:#f05a3c/);
  assert.match(darkLayer, /color-scheme:dark/);
});

test('home-owned surfaces and the situation drawer share the dark palette', () => {
  assert.match(darkLayer, /:root\[data-theme="dark"\] \.home-case\{/);
  assert.match(darkLayer, /:root\[data-theme="dark"\] \.home-case \.case-file\{/);
  assert.match(darkLayer, /:root\[data-theme="dark"\] \.home-case \.case-final\{/);
  assert.match(darkLayer, /:root\[data-theme="dark"\] \.case-scope-drawer\{/);
  assert.match(darkLayer, /:root\[data-theme="dark"\] \.case-scope-drawer__list button\{/);
});

test('browser chrome follows the redesigned black theme', () => {
  assert.match(home, /setAttribute\('content', '#15110e'\)/);
  assert.match(home, /home-release\.min\.css\?v=20260806shell120/);
  assert.match(darkLayer, /:root\[data-theme="dark"\] body \.site-header\{/);
});

// Старый слой главной всё ещё содержит глубокий #050505, но авторитетный guided
// слой поднимает фон до тёплого #15110e. Остальные страницы используют канонический
// --paper:#14120E из styles.css (так зафиксировано в docs/HOME-BRAND-CONCEPT.md).
// --paper:#14120E; app.js выбирает отдельный theme-color только для index.html.
test('site-wide dark canvas stays the canonical one, not the home black', () => {
  assert.match(styles, /:root\[data-theme="dark"\][\s\S]*?--paper:\s*#14120E/);
});
