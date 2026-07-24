const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const pages = [
  {
    file: 'proverka-istochnikov-vkr.html',
    canonical: 'https://akademsalon.ru/proverka-istochnikov-vkr.html',
    schema: 'WebApplication',
    service: 'rv',
  },
  {
    file: 'audit-temy-vkr.html',
    canonical: 'https://akademsalon.ru/audit-temy-vkr.html',
    schema: 'WebApplication',
    service: 'pl',
  },
  {
    file: 'redaktura-posle-ii.html',
    canonical: 'https://akademsalon.ru/redaktura-posle-ii.html',
    schema: 'Service',
    service: 'ai',
  },
  {
    file: 'dorabotka-otcheta-po-praktike.html',
    canonical: 'https://akademsalon.ru/dorabotka-otcheta-po-praktike.html',
    schema: 'Service',
    service: 'rv',
  },
];

function jsonLd(html, file) {
  return [...html.matchAll(
    /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi,
  )].map((match) => {
    assert.doesNotThrow(() => JSON.parse(match[1]), `${file}: JSON-LD parses`);
    return JSON.parse(match[1]);
  });
}

function typeIncludes(value, expected) {
  return Array.isArray(value) ? value.includes(expected) : value === expected;
}

test('growth pages have unique indexable metadata and valid schema', () => {
  const titles = new Set();
  const descriptions = new Set();
  for (const page of pages) {
    const html = read(page.file);
    const title = html.match(/<title>([^<]+)<\/title>/i)?.[1] || '';
    const description = html.match(
      /<meta\s+name="description"\s+content="([^"]+)"/i,
    )?.[1] || '';
    assert.ok(title.length >= 35 && title.length <= 90, `${page.file}: title length`);
    assert.ok(
      description.length >= 100 && description.length <= 190,
      `${page.file}: description length`,
    );
    assert.ok(!titles.has(title), `${page.file}: unique title`);
    assert.ok(!descriptions.has(description), `${page.file}: unique description`);
    titles.add(title);
    descriptions.add(description);

    assert.match(
      html,
      new RegExp(`<link rel="canonical" href="${page.canonical.replaceAll('.', '\\.')}"`),
      `${page.file}: canonical`,
    );
    assert.match(html, /name="robots" content="index,follow[^"]*max-image-preview:large"/i);
    assert.equal((html.match(/<h1\b/gi) || []).length, 1, `${page.file}: one H1`);
    assert.match(html, new RegExp(`property="og:url" content="${page.canonical.replaceAll('.', '\\.')}"`));
    assert.match(html, /property="og:image" content="https:\/\/akademsalon\.ru\//);
    assert.match(html, new RegExp(`configurator\\.html\\?service=${page.service}`));

    const schemas = jsonLd(html, page.file);
    assert.ok(
      schemas.some((node) => typeIncludes(node['@type'], page.schema)),
      `${page.file}: ${page.schema} schema`,
    );
    assert.ok(
      schemas.some((node) => typeIncludes(node['@type'], 'FAQPage')),
      `${page.file}: FAQ schema`,
    );
    assert.ok(
      schemas.some((node) => typeIncludes(node['@type'], 'BreadcrumbList')),
      `${page.file}: breadcrumb schema`,
    );
  }
});

test('free tools make explicit privacy and epistemic limitations', () => {
  const doi = read('proverka-istochnikov-vkr.html');
  assert.match(doi, /не доказательство[^<]*выдуман/i);
  assert.match(doi, /на сервер Академического Салона не передаются/i);
  assert.doesNotMatch(doi, /гарантированно определ|точно вымышлен|100% фейк/i);

  const topic = read('audit-temy-vkr.html');
  assert.match(topic, /анализируются локально/i);
  assert.match(topic, /эвристическ/i);
  assert.doesNotMatch(topic, /гарантированно утвердят|гарантия утверждения/i);

  const ai = read('redaktura-posle-ii.html');
  assert.match(ai, /не обещаем «обход» детекторов/i);
  assert.doesNotMatch(ai, /обойти антиплагиат|гарантируем[^<]*детектор/i);
});

test('DOI checker is bounded, concurrency-safe and renders metadata as text', () => {
  const js = read('assets/js/doi-checker.js');
  assert.match(js, /var MAX_DOIS = 20;/);
  assert.match(js, /var CONCURRENCY = 3;/);
  assert.match(js, /api\.crossref\.org\/works\//);
  assert.match(js, /mailto=support%40akademsalon\.ru/);
  assert.match(js, /AbortController/);
  assert.match(js, /textContent = text/);
  assert.doesNotMatch(js, /\.innerHTML\s*=/);
  assert.match(js, /Crossref не вернул запись/);
});

test('topic audit stays on-device and does not inject user HTML', () => {
  const html = read('audit-temy-vkr.html');
  const js = read('assets/js/topic-audit.js');
  assert.doesNotMatch(html, /<form\b|type="submit"/i);
  assert.match(html, /role="form"[^>]+data-topic-form/);
  assert.match(html, /type="button" data-topic-analyze/);
  assert.match(js, /navigator\.clipboard/);
  assert.match(js, /textContent/);
  assert.doesNotMatch(js, /\.innerHTML\s*=/);
  assert.doesNotMatch(js, /addEventListener\(['"]submit/);
  assert.match(js, /tasks\.length >= 3 && tasks\.length <= 7/);
});

test('quick Telegram acquisition links use the production one-message flow', () => {
  for (const page of pages) {
    const html = read(page.file);
    assert.match(
      html,
      /https:\/\/t\.me\/academic_saloon_bot\?start=webq_[a-z0-9_-]+/,
      `${page.file}: webq deep link`,
    );
  }
  assert.match(
    read('razbor-zamechaniy-nauchruka.html'),
    /start=webq_rv_comments/,
  );
  assert.match(read('index.html'), /start=webq_home_diplom/);
  assert.match(read('index.html'), /Отправить задачу одним сообщением/);
  assert.doesNotMatch(read('index.html'), /start=web"/);
  assert.match(read('assets/js/pereplet.js'), /start=webq_/);
});

test('sitemap and hub expose every new growth page', () => {
  const sitemap = read('sitemap.xml');
  const hub = read('knowledge.html');
  const app = read('assets/js/app.js');
  for (const page of pages) {
    assert.match(sitemap, new RegExp(`<loc>${page.canonical.replaceAll('.', '\\.')}</loc>`));
    assert.match(app, new RegExp(page.file.replaceAll('.', '\\.')));
  }
  for (const tool of ['proverka-istochnikov-vkr.html', 'audit-temy-vkr.html', 'check.html']) {
    assert.match(hub, new RegExp(`href="${tool.replaceAll('.', '\\.')}"`));
  }
});

test('style checker has crawlable guidance and truthful application schema', () => {
  const html = read('check.html');
  const mainText = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  assert.ok(mainText.split(' ').length > 350, 'check.html has substantive server HTML');
  assert.match(html, /Это детектор ChatGPT или ИИ\?/);
  assert.match(html, /обрабатывается локально/i);
  assert.doesNotMatch(html, /главный признак живого|узнаваемо человеческ|Текст выглядит живым/i);
  const schemas = jsonLd(html, 'check.html');
  assert.ok(schemas.some((node) => node['@type'] === 'WebApplication'));
  assert.ok(schemas.some((node) => node['@type'] === 'FAQPage'));
  assert.ok(schemas.some((node) => node['@type'] === 'BreadcrumbList'));
});

test('HTML preload matches the active core Cyrillic font instead of double-loading legacy WOFF2', () => {
  const htmlFiles = fs.readdirSync(root).filter((file) => file.endsWith('.html'));
  const legacyFont = 'literata-normal-300-700-cyrillic.woff2';
  const coreFont = 'literata-normal-300-700-cyrillic-core.woff2';
  assert.ok(fs.existsSync(path.join(root, 'assets', 'fonts', coreFont)));
  for (const file of htmlFiles) {
    const html = read(file);
    assert.doesNotMatch(html, new RegExp(`preload[^>]+${legacyFont.replaceAll('.', '\\.')}`), `${file}: no legacy preload`);
    assert.doesNotMatch(
      html,
      /assets\/(?:fonts\/fonts\.css|js\/app\.js)\?v=20260724seo1|assets\/css\/service-v2\.css\?v=20260724a/,
      `${file}: no stale cache key`,
    );
    if (/rel="preload"[^>]+as="font"/i.test(html)) {
      assert.match(html, new RegExp(coreFont.replaceAll('.', '\\.')), `${file}: core preload`);
    }
  }
});
