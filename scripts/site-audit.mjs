import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ignoredDirectories = new Set([
  '.git', 'backend', 'dist', 'node_modules', 'private_archive'
]);
const errors = [];
const warnings = [];

async function walk(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}

function lineNumber(source, index) {
  return source.slice(0, index).split('\n').length;
}

function report(collection, file, message, index = 0) {
  collection.push(`${relative(root, file)}:${lineNumber(cache.get(file) || '', index)} ${message}`);
}

function firstMatch(source, expression) {
  const match = source.match(expression);
  return match ? match[1].trim() : '';
}

function localTarget(raw) {
  if (!raw || /^(?:https?:|mailto:|tel:|data:|javascript:|#)/i.test(raw)) return null;
  const clean = raw.split('#')[0].split('?')[0];
  if (!clean) return null;
  return clean.startsWith('/') ? clean.slice(1) : clean;
}

const files = await walk(root);
const htmlFiles = files.filter((file) => extname(file).toLowerCase() === '.html');
const cache = new Map();
for (const file of htmlFiles) cache.set(file, await readFile(file, 'utf8'));

for (const file of htmlFiles) {
  const source = cache.get(file);
  const isUtility = /<(?:meta[^>]+name=["']robots["'][^>]+noindex|title>[^<]*(?:Админ|Оплачено|Ошибка|Maintenance))/i.test(source);
  const title = firstMatch(source, /<title>([^<]+)<\/title>/i);
  const description = firstMatch(source, /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
  const canonical = firstMatch(source, /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
  const h1Count = (source.match(/<h1(?:\s|>)/gi) || []).length;

  if (!title) report(errors, file, 'нет <title>');
  else if (title.length > 80) report(warnings, file, `title длиннее 80 символов (${title.length})`);
  if (!isUtility && !description) report(errors, file, 'нет meta description');
  else if (description.length > 180) report(warnings, file, `description длиннее 180 символов (${description.length})`);
  if (!isUtility && !canonical) report(errors, file, 'нет canonical');
  if (!isUtility && h1Count !== 1) report(errors, file, `ожидался один h1, найдено ${h1Count}`);

  const jsonLd = [...source.matchAll(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of jsonLd) {
    try {
      JSON.parse(match[1]);
    } catch (error) {
      report(errors, file, `невалидный JSON-LD: ${error.message}`, match.index);
    }
  }

  for (const match of source.matchAll(/(?:href|src)=["']([^"']+)["']/gi)) {
    const target = localTarget(match[1]);
    if (!target) continue;
    const resolved = resolve(dirname(file), target);
    if (!resolved.startsWith(root)) {
      report(errors, file, `ссылка выходит за корень: ${match[1]}`, match.index);
      continue;
    }
    try {
      await stat(resolved);
    } catch {
      report(errors, file, `не найден локальный ресурс: ${match[1]}`, match.index);
    }
  }
}

const redFlagPatterns = [
  ['«под ключ»', /под ключ/gi],
  ['«без вашего участия»', /без вашего участия/gi],
  ['«заказать готовую аттестационную работу»', /заказать\s+(?:готов\w+\s+)?(?:курсов\w+|диплом\w+|ВКР|диссертац\w+)/gi],
  ['«обход антиплагиата»', /об(?:ойти|ход\w*)\s+(?:систем\w+\s+)?антиплагиат/gi],
  ['«гарантия оценки/защиты»', /гарант\w{0,8}[^.!?<]{0,80}(?:оценк\w+|защит\w+|процент\w+|оригинальност\w+)/gi]
];
for (const file of htmlFiles) {
  const source = cache.get(file);
  for (const [label, expression] of redFlagPatterns) {
    for (const match of source.matchAll(expression)) {
      report(warnings, file, `проверьте контекст формулировки ${label}: ${match[0]}`, match.index);
    }
  }
}

const sitemapPath = join(root, 'sitemap.xml');
const sitemap = await readFile(sitemapPath, 'utf8');
const sitemapUrls = new Set(
  [...sitemap.matchAll(/<loc>https:\/\/akademsalon\.ru\/([^<]*)<\/loc>/g)]
    .map((match) => match[1] || 'index.html')
);
for (const file of htmlFiles) {
  const rel = relative(root, file).split('\\').join('/');
  const source = cache.get(file);
  if (/name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(source)) continue;
  if (rel.includes('/')) continue;
  if (!sitemapUrls.has(rel) && rel !== 'index.html') {
    report(warnings, file, 'indexable root page отсутствует в sitemap');
  }
}

for (const message of warnings) console.warn(`WARN ${message}`);
for (const message of errors) console.error(`ERROR ${message}`);
console.log(
  `Audit: ${htmlFiles.length} HTML; ${errors.length} errors; ${warnings.length} warnings.`
);
if (errors.length) process.exitCode = 1;
