/* Инварианты сайта — то, что должно держаться при любом редизайне.

   Пришли на смену четырём наборам (plan-page, plan-service, reviews-page,
   knowledge-page), которые проверяли конкретную вёрстку: точные строки текста,
   имена data-атрибутов, форму <main id="main" tabindex="-1">. Редизайн эту
   вёрстку заменил, и тесты стали падать, хотя по существу ничего не сломалось.
   Здесь проверяется смысл, а не разметка: SEO-разметка, ориентиры доступности,
   отсутствие битых ссылок и валидность кода — по ВСЕМ страницам сразу, а не по
   трём избранным. Прежние наборы остались в истории git. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).sort();
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const src = new Map(pages.map((f) => [f, read(f)]));

/* служебные страницы вне поиска: у них своя разметка и свои правила */
const SERVICE = new Set(['404.html', '50x.html', 'maintenance.html', 'admin.html',
  'admin-covers.html', 'dashboard.html', 'zayavka.html', 'oplaceno.html', 'expertise.html']);

test('в каждой публичной странице ровно один ориентир <main>', () => {
  const bad = [];
  for (const [f, html] of src) {
    if (SERVICE.has(f)) continue;
    const n = (html.match(/<main[\s>]/g) || []).length;
    if (n !== 1) bad.push(`${f}: <main> встречается ${n} раз`);
  }
  assert.deepStrictEqual(bad, [], 'без единственного <main> ломается переход к содержимому:\n' + bad.join('\n'));
});

test('каждый гайд несёт Article-разметку — на ней держится выдача', () => {
  const guides = pages.filter((f) => f.startsWith('guide-'));
  assert.ok(guides.length >= 20, `гайдов найдено ${guides.length} — подозрительно мало`);

  const bad = guides.filter((f) => !/"@type"\s*:\s*"(Article|TechArticle|HowTo|FAQPage|BlogPosting)"/.test(src.get(f)));
  assert.deepStrictEqual(bad, [], 'гайды без Article-разметки:\n' + bad.join('\n'));
});

test('все блоки JSON-LD разбираются как корректный JSON', () => {
  const bad = [];
  for (const [f, html] of src) {
    const blocks = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
    blocks.forEach((b, i) => {
      const body = b.replace(/^[\s\S]*?>/, '').replace(/<\/script>$/i, '');
      try { JSON.parse(body); } catch (e) { bad.push(`${f} блок #${i}: ${e.message}`); }
    });
  }
  assert.deepStrictEqual(bad, [], 'битый JSON-LD поисковик молча выбрасывает:\n' + bad.join('\n'));
});

test('весь инлайн-JavaScript синтаксически валиден', () => {
  const bad = [];
  for (const [f, html] of src) {
    const blocks = html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi) || [];
    blocks.forEach((b, i) => {
      const tag = b.slice(0, b.indexOf('>') + 1);
      if (/ld\+json|speculationrules|importmap/i.test(tag)) return;
      const body = b.replace(/^[\s\S]*?>/, '').replace(/<\/script>$/i, '');
      try { new vm.Script(body); } catch (e) { bad.push(`${f} скрипт #${i}: ${e.message}`); }
    });
  }
  assert.deepStrictEqual(bad, [], 'синтаксическая ошибка убивает всю страницу:\n' + bad.join('\n'));
});

test('все внешние файлы assets/js синтаксически валидны', () => {
  const dir = path.join(ROOT, 'assets', 'js');
  const bad = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    try { new vm.Script(fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch (e) { bad.push(`${f}: ${e.message}`); }
  }
  assert.deepStrictEqual(bad, [], bad.join('\n'));
});

test('страницы не ссылаются на отсутствующие локальные файлы', () => {
  const bad = [];
  for (const [f, html] of src) {
    const refs = new Set();
    const add = (u) => {
      if (!u) return;
      u = u.trim().split('?')[0].split('#')[0];
      if (!u || /^(https?:|data:|mailto:|tel:|javascript:|\/\/)/i.test(u)) return;
      refs.add(u.replace(/^\//, ''));
    };
    for (const m of html.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)) add(m[1]);
    for (const m of html.matchAll(/srcset\s*=\s*["']([^"']+)["']/gi)) {
      m[1].split(',').forEach((part) => add(part.trim().split(/\s+/)[0]));
    }

    for (const r of refs) {
      /* только файлы: якорные и «чистые» маршруты сюда не попадают */
      if (!/\.[a-z0-9]{2,5}$/i.test(r)) continue;
      if (!fs.existsSync(path.join(ROOT, decodeURIComponent(r)))) bad.push(`${f} → ${r}`);
    }
  }
  assert.deepStrictEqual(bad, [], 'битые ссылки на локальные файлы:\n' + bad.join('\n'));
});

test('каждый URL из sitemap существует файлом и объявляет canonical', () => {
  const sitemap = read('sitemap.xml');
  const locs = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), (m) => m[1]);
  assert.ok(locs.length > 50, `в sitemap всего ${locs.length} адресов`);

  const missing = [], noCanonical = [];
  for (const loc of locs) {
    const rel = loc.replace(/^https?:\/\/[^/]+\//, '') || 'index.html';
    const file = rel === '' ? 'index.html' : rel;
    if (!fs.existsSync(path.join(ROOT, file))) { missing.push(file); continue; }
    if (!/<link[^>]+rel=["']canonical["']/i.test(read(file))) noCanonical.push(file);
  }
  assert.deepStrictEqual(missing, [], 'sitemap ведёт на несуществующие страницы:\n' + missing.join('\n'));
  assert.deepStrictEqual(noCanonical, [], 'страницы в sitemap без canonical:\n' + noCanonical.join('\n'));
});

test('хаб знаний ведёт на гайды обычными ссылками, а не только скриптом', () => {
  const html = src.get('knowledge.html');
  assert.ok(html, 'knowledge.html не найден');

  const links = new Set(Array.from(
    html.matchAll(/<a\b[^>]*href=["'](guide-[^"'#?]+\.html)["']/gi), (m) => m[1]));
  assert.ok(links.size >= 20,
    `crawlable-ссылок на гайды всего ${links.size} — поисковик не обойдёт каталог`);

  const dead = Array.from(links).filter((l) => !fs.existsSync(path.join(ROOT, l)));
  assert.deepStrictEqual(dead, [], 'ссылки на несуществующие гайды:\n' + dead.join('\n'));
});
