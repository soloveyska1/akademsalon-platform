#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const siteOrigin = 'https://akademsalon.ru';
const feedUrl = `${siteOrigin}/feed.xml`;

const russianMonths = new Map([
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

const htmlEntities = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['nbsp', '\u00a0'],
  ['ndash', '–'],
  ['mdash', '—'],
  ['hellip', '…'],
  ['laquo', '«'],
  ['raquo', '»']
]);

export function decodeHtml(value) {
  return String(value).replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
    const normalized = code.toLowerCase();
    if (normalized.startsWith('#x')) {
      const point = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
    }
    if (normalized.startsWith('#')) {
      const point = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
    }
    return htmlEntities.get(normalized) ?? entity;
  });
}

export function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cleanText(value) {
  return decodeHtml(value).replace(/\s+/g, ' ').trim();
}

function requiredMatch(html, pattern, label, file) {
  const match = html.match(pattern);
  if (!match) throw new Error(`${file}: missing ${label}`);
  return cleanText(match[1]);
}

function findArticle(node) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const article = findArticle(item);
      if (article) return article;
    }
    return null;
  }

  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
  if (types.includes('Article')) return node;

  for (const value of Object.values(node)) {
    const article = findArticle(value);
    if (article) return article;
  }
  return null;
}

function readArticle(html, file) {
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const article = findArticle(JSON.parse(match[1]));
      if (article) return article;
    } catch (error) {
      throw new Error(`${file}: invalid JSON-LD (${error.message})`);
    }
  }
  throw new Error(`${file}: missing Article JSON-LD`);
}

function isoDate(value, label, file) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) {
    throw new Error(`${file}: invalid ${label}`);
  }
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) throw new Error(`${file}: invalid ${label}`);
  return date;
}

function visibleDate(html, file) {
  const visibleText = cleanText(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  );
  const match = visibleText.match(
    /Обновлено\s*:?\s*(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{4})/i
  );
  if (!match) throw new Error(`${file}: missing visible update date`);

  const day = Number(match[1]);
  const month = russianMonths.get(match[2].toLowerCase());
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`${file}: invalid visible update date`);
  }
  return date;
}

function atomTimestamp(date) {
  return date.toISOString().replace('.000Z', 'Z');
}

function trackedGuideFiles() {
  const output = execFileSync('git', ['ls-files', '-z', '--', 'guide-*.html'], {
    cwd: root,
    encoding: 'utf8'
  });
  return output.split('\0').filter(Boolean);
}

export function readGuide(file) {
  const html = readFileSync(join(root, file), 'utf8');
  if (/<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*\bnoindex\b/i.test(html)) {
    return null;
  }

  const canonical = requiredMatch(
    html,
    /<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i,
    'canonical URL',
    file
  );
  const url = new URL(canonical);
  if (
    url.protocol !== 'https:' ||
    url.origin !== siteOrigin ||
    url.search ||
    url.hash ||
    url.pathname !== `/${file}`
  ) {
    throw new Error(`${file}: canonical URL must be the absolute production URL`);
  }

  const title = requiredMatch(html, /<title>([\s\S]*?)<\/title>/i, 'title', file);
  const description = requiredMatch(
    html,
    /<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    'description',
    file
  );
  const article = readArticle(html, file);
  const modified = isoDate(article.dateModified, 'dateModified', file);
  const published = isoDate(article.datePublished ?? article.dateModified, 'datePublished', file);
  const visibleModified = visibleDate(html, file);
  const updated = new Date(Math.max(modified.getTime(), visibleModified.getTime()));

  return {
    file,
    url: url.href,
    title,
    description,
    published,
    modified,
    visibleModified,
    updated
  };
}

export function buildFeed() {
  const guides = trackedGuideFiles()
    .map(readGuide)
    .filter(Boolean)
    .sort((left, right) => (
      right.updated.getTime() - left.updated.getTime() ||
      left.url.localeCompare(right.url, 'ru')
    ));

  if (!guides.length) throw new Error('No public tracked guide pages found');
  const latestUpdate = atomTimestamp(guides[0].updated);

  const entries = guides.flatMap((guide) => [
    '  <entry>',
    `    <title>${escapeXml(guide.title)}</title>`,
    `    <link rel="alternate" type="text/html" href="${escapeXml(guide.url)}"/>`,
    `    <id>${escapeXml(guide.url)}</id>`,
    `    <published>${atomTimestamp(guide.published)}</published>`,
    `    <updated>${atomTimestamp(guide.updated)}</updated>`,
    `    <summary type="text">${escapeXml(guide.description)}</summary>`,
    '  </entry>'
  ]);

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="ru">',
    '  <title>Академический Салон — полезные материалы</title>',
    '  <subtitle>Практические руководства по ВКР, курсовым, практике, оформлению и защите.</subtitle>',
    `  <link rel="alternate" type="text/html" href="${siteOrigin}/knowledge.html"/>`,
    `  <link rel="self" type="application/atom+xml" href="${feedUrl}"/>`,
    `  <id>${feedUrl}</id>`,
    `  <updated>${latestUpdate}</updated>`,
    '  <author>',
    '    <name>Редакция Академического Салона</name>',
    `    <uri>${siteOrigin}/about.html</uri>`,
    '  </author>',
    '  <rights>© Академический Салон</rights>',
    '  <generator uri="https://akademsalon.ru/">Академический Салон</generator>',
    ...entries,
    '</feed>',
    ''
  ];

  return { xml: lines.join('\n'), count: guides.length };
}

export function generateFeed() {
  const { xml, count } = buildFeed();
  writeFileSync(join(root, 'feed.xml'), xml, 'utf8');
  return count;
}

const isDirectRun = process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  const count = generateFeed();
  console.log(`feed.xml: ${count} public tracked guide entries`);
}
