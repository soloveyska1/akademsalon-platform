import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, '..');
const output = join(root, 'dist');
const allowedRootExtensions = new Set([
  '.html', '.txt', '.xml', '.ico', '.gif', '.webmanifest'
]);
const publicDirectories = ['assets', 'bimi'];
const excludedRelativePaths = new Set([
  'assets/img/vk',
  // Снятые демонстрационные фрагменты сохраняются в истории проекта,
  // но не публикуются: релиз показывает только результат редакторской помощи.
  'assets/img/samples',
  'assets/img/showcase',
  'assets/samples',
  'salon-promo.gif',
  // Внутренние инструменты генерации бренд-ассетов не нужны посетителю.
  'assets/brand/telegram/generate.py',
  'assets/brand/telegram/preview.html',
  'admin-covers.html',
  // Историческая OG-карточка содержит снятое с публикации позиционирование.
  // Оставляем её только в рабочей истории проекта, но не в релизном артефакте.
  'assets/img/og-cover.png'
]);
const explicitRootFiles = new Set([
  '.indexnow-key'
]);

if (basename(output) !== 'dist' || !output.startsWith(`${root}${sep}`)) {
  throw new Error(`Unsafe output directory: ${output}`);
}

function normalizedRelative(path) {
  return relative(root, path).split(sep).join('/');
}

function isExcluded(path) {
  const rel = normalizedRelative(path);
  return [...excludedRelativePaths].some(
    (excluded) => rel === excluded || rel.startsWith(`${excluded}/`)
  );
}

function stripReleaseExcludedBlocks(source, path) {
  const starts = (source.match(/<!--\s*RELEASE-EXCLUDE:START\b[^>]*-->/g) || []).length;
  const ends = (source.match(/<!--\s*RELEASE-EXCLUDE:END\s*-->/g) || []).length;
  if (starts !== ends) {
    throw new Error(`Unbalanced release-exclude markers: ${path}`);
  }
  return source.replace(
    /<!--\s*RELEASE-EXCLUDE:START\b[^>]*-->[\s\S]*?<!--\s*RELEASE-EXCLUDE:END\s*-->/g,
    ''
  );
}

async function copyTree(source, destination) {
  if (isExcluded(source)) return;
  const info = await stat(source);
  if (info.isSymbolicLink()) {
    throw new Error(`Symlinks are not allowed in the public artifact: ${source}`);
  }
  if (info.isDirectory()) {
    await mkdir(destination, { recursive: true });
    const entries = await readdir(source, { withFileTypes: true });
    for (const entry of entries) {
      await copyTree(join(source, entry.name), join(destination, entry.name));
    }
    return;
  }
  if (!info.isFile()) return;
  await mkdir(dirname(destination), { recursive: true });
  if (extname(source).toLowerCase() === '.html') {
    const html = await readFile(source, 'utf8');
    await writeFile(destination, stripReleaseExcludedBlocks(html, source), 'utf8');
  } else {
    await copyFile(source, destination);
  }
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const rootEntries = await readdir(root, { withFileTypes: true });
for (const entry of rootEntries) {
  if (!entry.isFile()) continue;
  const extension = extname(entry.name).toLowerCase();
  if (!allowedRootExtensions.has(extension) && !explicitRootFiles.has(entry.name)) continue;
  await copyTree(join(root, entry.name), join(output, entry.name));
}
for (const directory of publicDirectories) {
  await copyTree(join(root, directory), join(output, directory));
}

async function listFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}

const files = (await listFiles(output))
  .filter((path) => basename(path) !== 'release-manifest.json')
  .sort();

// Проверяем уже собранный артефакт, а не исходное дерево: исключённый файл
// не должен незаметно остаться ссылкой и превратиться в 404 после публикации.
const missingReferences = [];
for (const file of files.filter((path) => extname(path).toLowerCase() === '.html')) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/(?:href|src)=["']([^"']+)["']/gi)) {
    const raw = match[1];
    if (!raw || /^(?:https?:|mailto:|tel:|data:|javascript:|#)/i.test(raw)) continue;
    const clean = raw.split('#')[0].split('?')[0];
    if (!clean) continue;
    const target = clean.startsWith('/')
      ? resolve(output, clean.slice(1))
      : resolve(dirname(file), clean);
    if (target !== output && !target.startsWith(`${output}${sep}`)) {
      missingReferences.push(`${normalizedRelative(file)} -> ${raw} (outside artifact)`);
      continue;
    }
    try {
      await stat(target);
    } catch {
      missingReferences.push(`${normalizedRelative(file)} -> ${raw}`);
    }
  }
}
if (missingReferences.length) {
  throw new Error(
    `Public artifact contains missing local references:\n${missingReferences.join('\n')}`
  );
}

const manifest = {
  schema: 'akademsalon.release-manifest.v1',
  generated_at: new Date().toISOString(),
  excluded: [...excludedRelativePaths],
  files: []
};
for (const file of files) {
  const buffer = await readFile(file);
  manifest.files.push({
    path: relative(output, file).split(sep).join('/'),
    bytes: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex')
  });
}
await writeFile(
  join(output, 'release-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8'
);

console.log(
  `Public artifact: ${manifest.files.length} files; retired/private assets excluded.`
);
