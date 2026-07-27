#!/usr/bin/env node

/* Отправка адресов в IndexNow — Яндекс и Bing забирают страницу по сигналу,
   а не ждут обхода. Ключ d485ac6cc21986723e6f627b37da7c5b и файл-подтверждение
   в корне лежали с самого начала, но ни один скрипт их не использовал: сайт
   публиковался и молча ждал краулера.

   По умолчанию скрипт НИЧЕГО не отправляет — печатает список и выходит.
   Отправка включается явным --submit, чтобы случайный запуск не расходовал
   лимит и не слал в поиск то, что ещё не выложено.

   Порядок в релизе: generate-sitemap.mjs проставляет lastmod → этот скрипт
   берёт из sitemap.xml адреса самой свежей даты и отдаёт их поиску. */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOST = 'akademsalon.ru';
const ORIGIN = `https://${HOST}`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';
/* потолок протокола на один запрос */
const MAX_URLS = 10000;

/* Ключ обязан лежать и в .indexnow-key, и в <ключ>.txt в корне: поиск
   скачивает второй файл и сверяет с тем, что пришло в запросе. Разошлись —
   приходит 403, причём молча, поэтому сверяем до отправки. */
export function readKey(base = root) {
  const keyPath = join(base, '.indexnow-key');
  if (!existsSync(keyPath)) throw new Error('нет .indexnow-key в корне репозитория');

  const key = readFileSync(keyPath, 'utf8').trim();
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(key)) {
    throw new Error(`ключ IndexNow должен быть 8–128 символов [a-zA-Z0-9-], получено: ${JSON.stringify(key)}`);
  }

  const proofPath = join(base, `${key}.txt`);
  if (!existsSync(proofPath)) {
    throw new Error(`нет файла-подтверждения ${key}.txt в корне — поиск ответит 403`);
  }
  const proof = readFileSync(proofPath, 'utf8').trim();
  if (proof !== key) {
    throw new Error(`${key}.txt содержит ${JSON.stringify(proof)}, а ключ — ${JSON.stringify(key)}`);
  }

  return { key, keyLocation: `${ORIGIN}/${key}.txt` };
}

/* sitemap.xml — единственный источник правды о том, что вообще индексируется:
   его собирает generate-sitemap.mjs, отбрасывая noindex и чужие canonical. */
export function readSitemap(base = root) {
  const xml = readFileSync(join(base, 'sitemap.xml'), 'utf8');
  const entries = [];
  const re = /<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>\s*<\/url>/g;
  let m;
  while ((m = re.exec(xml))) entries.push({ loc: m[1], lastmod: m[2] });
  if (!entries.length) throw new Error('в sitemap.xml не найдено ни одного <url>');
  return entries;
}

/* Свежая дата в карте = то, что изменил последний релиз. Это и есть разумное
   поведение по умолчанию: слать весь сайт на каждый деплой незачем. */
export function newestLastmod(entries) {
  return entries.reduce((max, e) => (e.lastmod > max ? e.lastmod : max), '');
}

export function selectUrls(entries, { since, all, urls } = {}) {
  if (urls && urls.length) {
    const foreign = urls.filter((u) => !u.startsWith(`${ORIGIN}/`) && u !== ORIGIN + '/');
    if (foreign.length) throw new Error(`адреса не с ${ORIGIN}: ${foreign.join(', ')}`);
    return urls;
  }
  if (all) return entries.map((e) => e.loc);
  const from = since || newestLastmod(entries);
  return entries.filter((e) => e.lastmod >= from).map((e) => e.loc);
}

export function buildPayload(urlList, { key, keyLocation }) {
  if (!urlList.length) throw new Error('пустой список адресов');
  if (urlList.length > MAX_URLS) {
    throw new Error(`${urlList.length} адресов — протокол принимает не больше ${MAX_URLS} за запрос`);
  }
  return { host: HOST, key, keyLocation, urlList };
}

/* Коды из спецификации IndexNow: 200/202 — принято, остальное разбираем
   словами, потому что тело ответа обычно пустое. */
export function describeStatus(status) {
  const known = {
    200: 'принято',
    202: 'принято, ключ ещё проверяется',
    400: 'некорректный запрос',
    403: 'ключ не принят — проверьте файл-подтверждение',
    422: 'адреса не принадлежат хосту или ключ не совпал',
    429: 'слишком часто — повторите позже'
  };
  return known[status] || `неожиданный ответ ${status}`;
}

export async function submit(payload, fetchImpl = globalThis.fetch) {
  const res = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload)
  });
  return { status: res.status, ok: res.status === 200 || res.status === 202, note: describeStatus(res.status) };
}

export function parseArgs(argv) {
  const opts = { submit: false, all: false, since: '', urls: [] };
  for (const arg of argv) {
    if (arg === '--submit') opts.submit = true;
    else if (arg === '--all') opts.all = true;
    else if (arg.startsWith('--since=')) opts.since = arg.slice(8);
    else if (arg.startsWith('--url=')) opts.urls.push(arg.slice(6));
    else throw new Error(`неизвестный аргумент ${arg}`);
  }
  if (opts.since && !/^\d{4}-\d{2}-\d{2}$/.test(opts.since)) {
    throw new Error('--since ожидает дату вида ГГГГ-ММ-ДД');
  }
  return opts;
}

async function main(argv) {
  const opts = parseArgs(argv);
  const { key, keyLocation } = readKey();
  const entries = readSitemap();
  const urlList = selectUrls(entries, opts);

  if (!urlList.length) {
    console.log('IndexNow: изменившихся адресов нет — отправлять нечего');
    return 0;
  }

  const scope = opts.urls.length ? 'указанные вручную'
    : opts.all ? 'весь sitemap'
    : `изменённые с ${opts.since || newestLastmod(entries)}`;
  console.log(`IndexNow: ${urlList.length} адрес(ов) — ${scope}`);
  urlList.forEach((u) => console.log(`  ${u}`));

  if (!opts.submit) {
    console.log('\nЭто предпросмотр. Отправка: node scripts/ping-indexnow.mjs --submit');
    return 0;
  }

  const payload = buildPayload(urlList, { key, keyLocation });
  const result = await submit(payload);
  console.log(`\nОтвет ${result.status}: ${result.note}`);
  return result.ok ? 0 : 1;
}

const isDirectRun = process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (err) => { console.error(`IndexNow: ${err.message}`); process.exitCode = 1; }
  );
}
