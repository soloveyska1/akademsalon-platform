#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Moscow',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(new Date());

function git(args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function lastModified(file) {
  if (git(['status', '--porcelain', '--', file])) return today;
  return git(['log', '-1', '--format=%cs', '--', file]) || today;
}

const pages = readdirSync(root)
  .filter((file) => file.endsWith('.html'))
  .map((file) => {
    const html = readFileSync(join(root, file), 'utf8');
    const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i);
    const noindex = /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html);
    if (!canonical || noindex || !canonical[1].startsWith('https://akademsalon.ru/')) return null;
    return { file, loc: canonical[1], lastmod: lastModified(file) };
  })
  .filter(Boolean);

const preferred = [
  'https://akademsalon.ru/',
  'https://akademsalon.ru/configurator.html',
  'https://akademsalon.ru/tariffs.html',
  'https://akademsalon.ru/start.html',
  'https://akademsalon.ru/razbor-zamechaniy-nauchruka.html',
  'https://akademsalon.ru/normokontrol-vkr.html',
  'https://akademsalon.ru/about.html',
  'https://akademsalon.ru/knowledge.html'
];
const rank = new Map(preferred.map((loc, index) => [loc, index]));
pages.sort((a, b) => {
  const ar = rank.has(a.loc) ? rank.get(a.loc) : preferred.length;
  const br = rank.has(b.loc) ? rank.get(b.loc) : preferred.length;
  return ar - br || a.loc.localeCompare(b.loc, 'ru');
});

const lines = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...pages.map(({ loc, lastmod }) => `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod></url>`),
  '</urlset>',
  ''
];
writeFileSync(join(root, 'sitemap.xml'), lines.join('\n'));
console.log(`sitemap.xml: ${pages.length} indexable canonical URLs`);
