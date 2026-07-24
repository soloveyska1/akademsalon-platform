const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const knowledge = fs.readFileSync(path.join(root, 'knowledge.html'), 'utf8');
const knowledgeJs = fs.readFileSync(path.join(root, 'assets/js/knowledge.js'), 'utf8');
const knowledgeCss = fs.readFileSync(path.join(root, 'assets/css/knowledge.css'), 'utf8');
const extrasJs = fs.readFileSync(path.join(root, 'assets/js/extras.js'), 'utf8');
const extrasCss = fs.readFileSync(path.join(root, 'assets/css/extras.css'), 'utf8');
const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
const guides = fs.readdirSync(root).filter((file) => /^guide-.*\.html$/.test(file)).sort();

function jsonLd(html) {
  return [...html.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
}

test('хаб содержит полный уникальный каталог и обычные crawlable-ссылки', () => {
  assert.equal(guides.length, 25);
  const entries = [...knowledge.matchAll(/<a class="kb-entry" href="(guide-[^"]+\.html)"[^>]*data-guide/g)]
    .map((match) => match[1]);
  assert.equal(entries.length, 25);
  assert.equal(new Set(entries).size, 25);
  assert.deepEqual([...entries].sort(), guides);
  entries.forEach((href) => assert.ok(fs.existsSync(path.join(root, href)), `missing ${href}`));
});

test('поиск и фильтры доступны и сохраняют состояние в URL', () => {
  for (const topic of ['all', 'vkr', 'course', 'defense', 'gost', 'practice', 'publish', 'check']) {
    assert.match(knowledge, new RegExp(`data-kb-topic="${topic}"`));
  }
  assert.match(knowledge, /type="search"[^>]+data-kb-search/);
  assert.match(knowledge, /aria-live="polite"/);
  assert.match(knowledgeJs, /url\.searchParams\.set\('q', query\)/);
  assert.match(knowledgeJs, /url\.searchParams\.set\('topic', currentTopic\)/);
  assert.match(knowledgeJs, /window\.addEventListener\('popstate'/);
  assert.match(knowledgeJs, /entry\.hidden = !\(topicMatch && textMatch\)/);
});

test('виральные действия безопасны и не требуют регистрации', () => {
  assert.match(knowledge, /data-kb-share/);
  assert.match(knowledgeJs, /navigator\.share/);
  assert.match(knowledgeJs, /navigator\.clipboard/);
  assert.match(knowledgeJs, /salon_reading_shelf/);
  assert.doesNotMatch(knowledgeJs, /contact|phone|email|addressBook/i);
});

test('журнал загружает и текстовые, и визуальные посты и позволяет их листать', () => {
  assert.match(knowledge, /data-kb-journal-viewport/);
  assert.match(knowledge, /data-kb-journal-prev/);
  assert.match(knowledge, /data-kb-journal-next/);
  assert.match(knowledge, /aria-busy="true"/);
  assert.match(knowledgeJs, /post\.img/);
  assert.match(knowledgeJs, /\.slice\(0, 8\)/);
  assert.match(knowledgeJs, /event\.key === 'ArrowRight'/);
  assert.match(knowledgeJs, /viewport\.scrollTo/);
  assert.doesNotMatch(knowledgeJs, /trim\(\)\.length > 30/);
  assert.match(knowledgeCss, /scroll-snap-type:\s*x mandatory/);
  assert.match(knowledgeCss, /\.kb-journal-media\s*>\s*img/);
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

test('мини-смета не удаляет форму вопроса мастеру на гайдах', () => {
  assert.match(extrasJs, /box\.setAttribute\('data-guide-lead', ''\)/);
  assert.match(extrasJs, /legacy\.querySelector\('\[data-guide-lead\]'\)/);
  assert.match(extrasJs, /legacy\.parentNode\.insertBefore\(guideLead, legacy\)/);
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

test('каждый гайд подключает читательский шаблон и полную Article-разметку', () => {
  for (const file of guides) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /assets\/css\/knowledge\.css\?v=20260724a/, `${file}: css`);
    assert.match(html, /assets\/js\/knowledge\.js\?v=20260724a/, `${file}: js`);
    const article = jsonLd(html).find((item) => item['@type'] === 'Article');
    assert.ok(article, `${file}: Article`);
    assert.equal(article.image, 'https://akademsalon.ru/assets/img/og-cover-v2.png', `${file}: image`);
    assert.equal(article.author.url, 'https://akademsalon.ru/', `${file}: author`);
    assert.equal(article.publisher.url, 'https://akademsalon.ru/', `${file}: publisher`);
    assert.equal(article.url, `https://akademsalon.ru/${file}`, `${file}: url`);
    assert.match(sitemap, new RegExp(`<loc>https://akademsalon\\.ru/${file.replace('.', '\\.')}`), `${file}: sitemap`);
  }
});

test('читательский шаблон создаёт оглавление, якоря, прогресс, таблицы и печать', () => {
  assert.match(knowledgeJs, /querySelectorAll\('h2, h3'\)/);
  assert.match(knowledgeJs, /heading\.id = slugify/);
  assert.match(knowledgeJs, /className = 'guide-toc'/);
  assert.match(knowledgeJs, /IntersectionObserver/);
  assert.match(knowledgeJs, /--guide-progress/);
  assert.match(knowledgeJs, /createElement\('caption'\)/);
  assert.match(knowledgeJs, /cell\.setAttribute\('scope', 'col'\)/);
  assert.match(knowledgeJs, /window\.print\(\)/);
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
  new vm.Script(extrasJs, { filename: 'assets/js/extras.js' });
});
