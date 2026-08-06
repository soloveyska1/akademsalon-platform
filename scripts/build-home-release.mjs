import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const cssSources = [
  'assets/css/styles.css',
  'assets/css/chrome.css',
  'assets/css/polish15-chrome.css',
  'assets/css/extras.css',
  'assets/css/polish15-home.css',
  'assets/css/commission-zero.css',
  'assets/css/home-intro.css',
  'assets/css/home-ecosystem.css',
  'assets/css/mobile.css',
  'assets/css/home-story.css',
  'assets/css/home-guided.css',
  'assets/css/home-guided-flow.css',
];
const jsSources = [
  'assets/js/app.js',
  'assets/js/polish15-chrome.js',
  'assets/js/extras.js',
  'assets/js/home-intro.js',
  'assets/js/home-ecosystem.js',
  'assets/js/home-guided-flow.js',
];
const esbuildVersion = '0.28.1';
const purgeCssVersion = '7.0.2';
const temp = mkdtempSync(join(tmpdir(), 'akademsalon-home-'));

function joinSources(sources, extension) {
  const target = join(temp, `home-release.${extension}`);
  const body = sources.map((source) => {
    const content = readFileSync(join(root, source), 'utf8');
    return `/* source:${source} */\n${content}`;
  }).join('\n');
  writeFileSync(target, body);
  return target;
}

function build(input, output, loader) {
  const result = spawnSync(
    'npx',
    [
      '--yes',
      `esbuild@${esbuildVersion}`,
      input,
      '--minify',
      '--charset=utf8',
      '--target=es2018',
      `--loader:.${loader}=${loader}`,
      `--outfile=${join(root, output)}`,
    ],
    { cwd: root, encoding: 'utf8', stdio: 'inherit' },
  );
  if (result.status !== 0) {
    throw new Error(`esbuild failed for ${output} with status ${result.status}`);
  }
}

/* Классы, которые JS собирает склейкой: purge их не видит. */
const RUNTIME_CLASSES = [
  'mnote', 'mnote--call', 'mnote--echo',
  'is-stamp', 'is-wax', 'is-verify', 'is-new', 'is-in',
  'stamp-burst', 'ml-row', 'cf-lamp', 'fcl-dot', 'night',
  'site-header--account',
];

function purgeCss(input) {
  const outputDir = join(temp, 'purged');
  mkdirSync(outputDir);
  const result = spawnSync(
    'npx',
    [
      '--yes',
      `purgecss@${purgeCssVersion}`,
      '--css',
      input,
      '--content',
      join(root, 'index.html'),
      ...jsSources.map((source) => join(root, source)),
      /* Purge ищет имена классов как ЦЕЛЫЕ строки в HTML и JS. Имя, собранное
         склейкой, он не находит и правило выбрасывает. Так с главной пропала
         раскладка карточки уведомления:

           el.className = 'mnote mnote--' + (loud ? 'call' : 'echo') +
                          ' is-' + (o.tone || 'stamp');            // app.js:1309

         Строк `mnote--call` и `is-stamp` в исходниках нет, есть только куски.
         Карточка на главной рисовалась блоком без отступов: печать «¶»
         упиралась в верхнюю кромку, а крестик уезжал под кнопки. На остальных
         89 страницах `extras.css` подключён напрямую, и дефекта там не было.

         Регулярные выражения CLI не принимает — `--safelist` это список точных
         имён, поэтому перечисляем их полностью. Проверку держит
         tests/mobile-shell.test.js. */
      '--safelist',
      ...RUNTIME_CLASSES,
      '--output',
      outputDir,
    ],
    { cwd: root, encoding: 'utf8', stdio: 'inherit' },
  );
  if (result.status !== 0) {
    throw new Error(`PurgeCSS failed with status ${result.status}`);
  }
  return join(outputDir, basename(input));
}

try {
  build(purgeCss(joinSources(cssSources, 'css')), 'assets/css/home-release.min.css', 'css');
  build(joinSources(jsSources, 'js'), 'assets/js/home-release.min.js', 'js');
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log(`Home release built from ${cssSources.length} CSS and ${jsSources.length} JS sources.`);
