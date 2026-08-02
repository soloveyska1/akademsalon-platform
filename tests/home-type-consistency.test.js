const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const story = fs.readFileSync(path.join(root, 'assets/css/home-story.css'), 'utf8');

test('home uses one explicit three-font hierarchy', () => {
  assert.match(story, /--home-display:var\(--serif\)/);
  assert.match(story, /--home-body:var\(--sans\)/);
  assert.match(story, /--home-meta:var\(--mono\)/);
  assert.match(
    story,
    /\.home-case \.case-section-head h2,[\s\S]*?font-size:var\(--home-section-title\);[\s\S]*?font-weight:470;/,
  );
  assert.match(
    story,
    /\.home-case \.case-section-head>p,[\s\S]*?font-size:var\(--home-intro-copy\);[\s\S]*?line-height:1\.58;/,
  );
});

test('home metadata, supporting copy and actions share stable scales', () => {
  assert.match(story, /--home-meta-size:8\.5px/);
  assert.match(story, /--home-small-copy:11px/);
  assert.match(story, /--home-action-size:11\.5px/);
  assert.match(
    story,
    /\.home-case \.eyebrow,[\s\S]*?font-size:var\(--home-meta-size\);[\s\S]*?letter-spacing:\.13em;/,
  );
  assert.match(
    story,
    /\.home-case \.case-scope-trigger__action,[\s\S]*?font-size:var\(--home-action-size\);[\s\S]*?font-weight:620;/,
  );
});

test('mobile type scale stays compact without becoming microscopic', () => {
  assert.match(
    story,
    /@media\(max-width:920px\)\{[\s\S]*?--home-section-title:clamp\(40px,10\.8vw,52px\);[\s\S]*?--home-meta-size:8px;/,
  );
  assert.doesNotMatch(
    story.slice(story.indexOf('FINAL TYPE SYSTEM')),
    /--home-(?:meta|small-copy|action-size):(?:[0-7](?:\.\d+)?)px/,
  );
});
