const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const feedPath = path.join(root, 'feed.xml');
const generatorPath = path.join(root, 'scripts/generate-feed.mjs');
const feed = fs.readFileSync(feedPath, 'utf8');

const months = new Map([
  ['января', 0],
  ['февраля', 1],
  ['марта', 2],
  ['апреля', 3],
  ['мая', 4],
  ['июня', 5],
  ['июля', 6],
  ['августа', 7],
  ['сентября', 8],
  ['октября', 9],
  ['ноября', 10],
  ['декабря', 11]
]);

function decode(value) {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function textTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`));
  assert.ok(match, `missing <${tag}>`);
  return decode(match[1]);
}

function articleFrom(html, file) {
  for (const match of html.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const value = JSON.parse(match[1]);
    if (value['@type'] === 'Article') return value;
  }
  assert.fail(`${file}: missing Article JSON-LD`);
}

function visibleDate(html, file) {
  const plain = html.replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
  const match = plain.match(
    /Обновлено\s*:?\s*(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{4})/i
  );
  assert.ok(match, `${file}: missing visible update date`);
  return new Date(Date.UTC(Number(match[3]), months.get(match[2].toLowerCase()), Number(match[1])));
}

function htmlDecode(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const trackedGuides = execFileSync('git', ['ls-files', '--', 'guide-*.html'], {
  cwd: root,
  encoding: 'utf8'
}).trim().split('\n').filter(Boolean);

const sourceGuides = trackedGuides.map((file) => {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i);
  const title = html.match(/<title>([\s\S]*?)<\/title>/i);
  const description = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
  assert.ok(canonical && title && description, `${file}: incomplete head metadata`);
  const article = articleFrom(html, file);
  assert.match(article.dateModified, /^\d{4}-\d{2}-\d{2}/, `${file}: dateModified`);

  const structured = new Date(`${article.dateModified.slice(0, 10)}T00:00:00Z`);
  const visible = visibleDate(html, file);
  return {
    file,
    url: canonical[1],
    title: htmlDecode(title[1]),
    description: htmlDecode(description[1]),
    published: `${article.datePublished.slice(0, 10)}T00:00:00Z`,
    updated: new Date(Math.max(structured.getTime(), visible.getTime())).toISOString().replace('.000Z', 'Z')
  };
}).sort((left, right) => (
  Date.parse(right.updated) - Date.parse(left.updated) ||
  left.url.localeCompare(right.url, 'ru')
));

const entries = [...feed.matchAll(/  <entry>\n([\s\S]*?)\n  <\/entry>/g)].map((match) => {
  const xml = match[1];
  const link = xml.match(/<link rel="alternate" type="text\/html" href="([^"]+)"\/>/);
  assert.ok(link, 'entry missing alternate link');
  return {
    title: textTag(xml, 'title'),
    url: textTag(xml, 'id'),
    link: decode(link[1]),
    published: textTag(xml, 'published'),
    updated: textTag(xml, 'updated'),
    description: textTag(xml, 'summary')
  };
});

test('Atom feed имеет валидные абсолютные метаданные канала', () => {
  assert.match(feed, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n/);
  assert.match(feed, /<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom" xml:lang="ru">/);
  assert.match(feed, /<title>Академический Салон — полезные материалы<\/title>/);
  assert.match(feed, /<subtitle>[^<]+<\/subtitle>/);
  assert.match(feed, /<link rel="alternate" type="text\/html" href="https:\/\/akademsalon\.ru\/knowledge\.html"\/>/);
  assert.match(feed, /<link rel="self" type="application\/atom\+xml" href="https:\/\/akademsalon\.ru\/feed\.xml"\/>/);
  assert.match(feed, /<id>https:\/\/akademsalon\.ru\/feed\.xml<\/id>/);
  assert.match(feed, /<author>\s*<name>Редакция Академического Салона<\/name>\s*<uri>https:\/\/akademsalon\.ru\/about\.html<\/uri>\s*<\/author>/);
  assert.doesNotMatch(feed, /&(?!amp;|lt;|gt;|quot;|apos;)/, 'unescaped ampersand');
});

test('feed содержит ровно все публичные tracked guide-страницы', () => {
  assert.equal(entries.length, trackedGuides.length);
  assert.equal(new Set(entries.map((entry) => entry.url)).size, entries.length);
  assert.deepEqual(entries.map((entry) => entry.url), sourceGuides.map((guide) => guide.url));
  for (const entry of entries) {
    assert.equal(entry.link, entry.url);
    const url = new URL(entry.url);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.origin, 'https://akademsalon.ru');
    assert.equal(url.search, '');
    assert.equal(url.hash, '');
  }
});

test('title, description и даты читаются из исходных HTML без потерь', () => {
  const byUrl = new Map(entries.map((entry) => [entry.url, entry]));
  for (const guide of sourceGuides) {
    const entry = byUrl.get(guide.url);
    assert.ok(entry, `${guide.file}: missing entry`);
    assert.equal(entry.title, guide.title, `${guide.file}: title`);
    assert.equal(entry.description, guide.description, `${guide.file}: description`);
    assert.equal(entry.published, guide.published, `${guide.file}: published`);
    assert.equal(entry.updated, guide.updated, `${guide.file}: updated`);
    assert.ok(Number.isFinite(Date.parse(entry.published)), `${guide.file}: invalid published`);
    assert.ok(Number.isFinite(Date.parse(entry.updated)), `${guide.file}: invalid updated`);
  }
});

test('дата канала равна самой свежей дате материалов', () => {
  const channelHead = feed.slice(0, feed.indexOf('  <entry>'));
  assert.equal(textTag(channelHead, 'updated'), sourceGuides[0].updated);
});

test('экранирование XML покрывает служебные символы и HTML-сущности', async () => {
  const module = await import(pathToFileURL(generatorPath).href);
  assert.equal(
    module.escapeXml(`ВКР & "ГОСТ" <2026> 'тест'`),
    'ВКР &amp; &quot;ГОСТ&quot; &lt;2026&gt; &apos;тест&apos;'
  );
  assert.equal(module.decodeHtml('Текст &amp; данные &#x2014; 2026'), 'Текст & данные — 2026');
});

test('генератор детерминирован и feed.xml не устарел', () => {
  const before = fs.readFileSync(feedPath, 'utf8');
  execFileSync(process.execPath, ['scripts/generate-feed.mjs'], { cwd: root });
  const after = fs.readFileSync(feedPath, 'utf8');
  assert.equal(after, before);
});
