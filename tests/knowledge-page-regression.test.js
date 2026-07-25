const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const knowledge = fs.readFileSync(path.join(root, 'knowledge.html'), 'utf8');
const knowledgeJs = fs.readFileSync(path.join(root, 'assets/js/knowledge.js'), 'utf8');
const libraryCss = fs.readFileSync(path.join(root, 'assets/css/polish15-library.css'), 'utf8');
const readingJs = fs.readFileSync(path.join(root, 'assets/js/polish15-reading.js'), 'utf8');
const readingCss = fs.readFileSync(path.join(root, 'assets/css/polish15-reading.css'), 'utf8');
const extrasJs = fs.readFileSync(path.join(root, 'assets/js/extras.js'), 'utf8');
const extrasCss = fs.readFileSync(path.join(root, 'assets/css/extras.css'), 'utf8');
const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
const guides = fs.readdirSync(root).filter((file) => /^guide-.*\.html$/.test(file)).sort();
const legalPages = [
  'privacy.html', 'terms.html', 'oferta.html', 'academic-integrity.html',
  'refunds.html', 'requisites.html', 'consent-request.html', 'consent-analytics.html',
  'consent-marketing.html', 'consent-publication.html', 'consent.html', 'loyalty.html'
];

function jsonLd(html) {
  return [...html.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
}

test('хаб содержит полный уникальный каталог и обычные crawlable-ссылки', () => {
  assert.equal(guides.length, 25);
  const entries = [...knowledge.matchAll(/<article class="article-card"[^>]*data-guide[\s\S]*?<a href="(guide-[^"]+\.html)"/g)]
    .map((match) => match[1]);
  assert.equal(entries.length, 25);
  assert.equal(new Set(entries).size, 25);
  assert.deepEqual([...entries].sort(), guides);
  entries.forEach((href) => assert.ok(fs.existsSync(path.join(root, href)), `missing ${href}`));
});

test('поиск и фильтры доступны и сохраняют состояние в URL', () => {
  assert.match(knowledge, /data-kb-topic="all"/);
  assert.ok((knowledge.match(/data-kb-topic="/g) || []).length >= 6);
  assert.match(knowledge, /type="search"[^>]+data-kb-search/);
  assert.match(knowledge, /aria-live="polite"/);
  assert.match(knowledgeJs, /url\.searchParams\.set\('q', query\)/);
  assert.match(knowledgeJs, /url\.searchParams\.set\('topic', currentTopic\)/);
  assert.match(knowledgeJs, /window\.addEventListener\('popstate'/);
  assert.match(knowledgeJs, /entry\.hidden = !matches \|\| \(compactCatalog && index >= limit\)/);
});

test('финальный каталог компактен и раскрывает оставшиеся материалы по запросу', () => {
  assert.equal((knowledge.match(/data-catalog-index="/g) || []).length, 25);
  assert.equal((knowledge.match(/data-catalog-index="(?:1[2-9]|2[0-4])"[^>]* hidden/g) || []).length, 13);
  assert.match(knowledge, /data-kb-more>Показать остальные — 13/);
  assert.match(knowledgeJs, /var expanded = false/);
  assert.match(knowledgeJs, /max-width: 620px/);
  assert.match(knowledgeJs, /\? 8 : 12/);
  assert.match(knowledgeJs, /expanded = true/);
  assert.match(knowledgeJs, /found - limit/);
  assert.match(libraryCss, /@media\(max-width:600px\)[\s\S]*?\.article-grid\{[\s\S]*?display:grid/);
});

test('старый журнал и прежняя композиция не попадают в финальный интерфейс', () => {
  assert.doesNotMatch(knowledge, /Журнал мастерской/i);
  assert.doesNotMatch(knowledge, /data-kb-journal/);
  assert.doesNotMatch(knowledge, /class="kb-entry"/);
  assert.doesNotMatch(knowledge, /class="pf-footer"/);
  assert.doesNotMatch(knowledgeJs, /initJournal|data-kb-journal|Журнал мастерской/i);
  assert.match(knowledge, /class="library-tools"/);
  assert.match(libraryCss, /\.article-card/);
  assert.match(libraryCss, /\.library-tools/);
});

test('«Ляссе» — единый фирменный и доступный расчётный лист', () => {
  assert.match(extrasJs, /box\.setAttribute\('aria-labelledby', 'lqTitle'\)/);
  assert.match(extrasJs, /<fieldset class="lq-group"/);
  assert.match(extrasJs, /<legend><b>01<\/b><span>Направление работы<\/span><\/legend>/);
  assert.match(extrasJs, /class="lq-result"/);
  assert.match(extrasJs, /Расчёт сохранится/);
  assert.match(extrasCss, /\.lq-body\{display:grid/);
  assert.match(extrasCss, /\.lq-ribbon\{/);
  assert.match(extrasCss, /\.lq-row button:focus-visible/);
  assert.match(extrasCss, /@media\(max-width:480px\)/);
});

test('метаданные хаба компактны, canonical и CollectionPage согласованы', () => {
  const title = knowledge.match(/<title>([^<]+)<\/title>/)[1];
  const description = knowledge.match(/<meta name="description" content="([^"]+)"/)[1];
  assert.ok(title.length <= 80, `title too long: ${title.length}`);
  assert.ok(description.length <= 160, `description too long: ${description.length}`);
  assert.match(knowledge, /<link rel="canonical" href="https:\/\/akademsalon\.ru\/knowledge\.html"/);
  assert.match(knowledge, /name="robots" content="index,follow,max-image-preview:large"/);
  const collection = jsonLd(knowledge).find((item) => item['@type'] === 'CollectionPage');
  assert.ok(collection);
  assert.equal(collection.mainEntity.numberOfItems, 25);
  assert.equal(collection.mainEntity.itemListElement.length, 25);
  assert.equal(collection.mainEntity.itemListElement[2].name, 'Как написать введение к ВКР');
});

test('каждый гайд подключает финальный читательский слой и полную Article-разметку', () => {
  for (const file of guides) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /assets\/css\/polish15-reading\.css\?v=[^"]+/, `${file}: css`);
    assert.match(html, /assets\/js\/polish15-reading\.js\?v=[^"]+/, `${file}: js`);
    assert.doesNotMatch(html, /assets\/(?:css|js)\/knowledge\.(?:css|js)/, `${file}: no legacy runtime`);
    const article = jsonLd(html).find((item) => item['@type'] === 'Article');
    assert.ok(article, `${file}: Article`);
    assert.equal(article.image, 'https://akademsalon.ru/assets/img/og-cover-v2.png', `${file}: image`);
    assert.equal(article.author.url, 'https://akademsalon.ru/about.html', `${file}: author`);
    assert.equal(article.publisher.url, 'https://akademsalon.ru/', `${file}: publisher`);
    assert.equal(article.url, `https://akademsalon.ru/${file}`, `${file}: url`);
    assert.match(sitemap, new RegExp(`<loc>https://akademsalon\\.ru/${file.replace('.', '\\.')}`), `${file}: sitemap`);
  }
});

test('правовые страницы используют тот же финальный runtime без старой оболочки', () => {
  for (const file of legalPages) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /assets\/css\/polish15-reading\.css\?v=[^"]+/, `${file}: css`);
    assert.match(html, /assets\/js\/polish15-reading\.js\?v=[^"]+/, `${file}: js`);
    assert.doesNotMatch(html, /assets\/(?:css|js)\/knowledge\.(?:css|js)/, `${file}: no legacy runtime`);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://akademsalon\\.ru/${file.replace('.', '\\.')}`));
    assert.equal((html.match(/<h1\b/g) || []).length, 1, `${file}: one source h1`);
  }
});

test('читательский runtime создаёт оглавление, якоря, прогресс, таблицы и печать', () => {
  assert.match(readingJs, /function uniqueHeadingIds\(/);
  assert.match(readingJs, /function makeToc\(/);
  assert.match(readingJs, /heading\.id = id/);
  assert.match(readingJs, /data-source-scroll/);
  assert.match(readingJs, /progress\.dataset\.readingProgress/);
  assert.match(readingJs, /--reading-progress/);
  assert.match(readingJs, /function wrapTables\(/);
  assert.match(readingJs, /wrapper\.className = 'source-table-wrap'/);
  assert.match(readingJs, /table\.setAttribute\('aria-describedby'/);
  assert.match(readingJs, /window\.print\(\)/);
  assert.match(readingCss, /\.article-layout/);
  assert.match(readingCss, /\.legal-shell/);
  assert.match(readingCss, /@media print/);
});

test('спецификация совпадает с отдельным утверждённым экраном', () => {
  const html = fs.readFileSync(path.join(root, 'specifikaciya.html'), 'utf8');
  assert.match(html, /body class="polish15-specification specification-page"/);
  assert.match(html, /data-specification-view="exact"/);
  assert.match(html, /data-specification-id="AS-SPEC-02"/);
  assert.match(html, /data-specification-version="1\.0"/);
  assert.equal((html.match(/data-specification-download/g) || []).length, 2);
  assert.equal((html.match(/class="spec-page-head"/g) || []).length, 1);
  assert.equal((html.match(/class="spec-paper"/g) || []).length, 1);
  assert.equal((html.match(/class="spec-notes"/g) || []).length, 1);
  assert.doesNotMatch(html, /class="(?:doc|doc-wrap|doc-crumb)"/);
});

test('редакционные исправления убирают самые рискованные обещания и фиктивные советы', () => {
  const diary = fs.readFileSync(path.join(root, 'guide-dnevnik-praktiki.html'), 'utf8');
  const supervisor = fs.readFileSync(path.join(root, 'guide-otzyv-rukovoditelya-vkr.html'), 'utf8');
  const practiceProfile = fs.readFileSync(path.join(root, 'guide-harakteristika-s-praktiki.html'), 'utf8');
  const intro = fs.readFileSync(path.join(root, 'guide-vvedenie-kursovoy.html'), 'utf8');
  const norm = fs.readFileSync(path.join(root, 'guide-normocontrol.html'), 'utf8');
  assert.doesNotMatch(diary, /вечер сойдёт за две недели|возврат гарантирован/i);
  assert.doesNotMatch(supervisor, /комиссия ждёт 1–2 недостатка/i);
  assert.doesNotMatch(practiceProfile, /выглядит написанным занятым руководителем|добавляет достоверности/i);
  assert.doesNotMatch(intro, /64%|78% российских компаний|принял с первого раза/i);
  assert.doesNotMatch(norm, /работу принимают с первого раза/i);
});

test('новый JavaScript синтаксически валиден', () => {
  new vm.Script(knowledgeJs, { filename: 'assets/js/knowledge.js' });
  new vm.Script(readingJs, { filename: 'assets/js/polish15-reading.js' });
  new vm.Script(extrasJs, { filename: 'assets/js/extras.js' });
});
