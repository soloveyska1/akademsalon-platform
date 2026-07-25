/* Страховка от «мёртвой кнопки»: вызов необъявленной функции.
   Такой вызов кидает ReferenceError синхронно — до того, как навешаны .then/.catch,
   поэтому обработчик ошибки не срабатывает, кнопка остаётся disabled, и отказ
   выглядит как «ничего не произошло». Именно так молча ломалась публикация
   защищённой версии клиенту (admin.js, #agHandoffPublish → busyPost).

   Проверка идёт по всем скриптам assets/js: собираем объявленные имена
   (функции, var/let/const, параметры, catch) и сверяем с именами, которые
   где-то вызываются как голый идентификатор. Зависимостей нет — только node. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const JS_DIR = path.join(__dirname, '..', 'assets', 'js');

/* стандартные глобальные объекты браузера и языка — вызовов этих имён ждать нормально */
const GLOBALS = new Set([
  'fetch', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame', 'queueMicrotask', 'structuredClone',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
  'encodeURI', 'decodeURI', 'atob', 'btoa', 'alert', 'confirm', 'prompt',
  'matchMedia', 'getComputedStyle', 'escape', 'unescape', 'require', 'import',
  /* методы window, которые в коде зовут без префикса */
  'addEventListener', 'removeEventListener', 'dispatchEvent', 'scrollTo', 'scrollBy',
  'requestIdleCallback', 'cancelIdleCallback', 'getSelection', 'postMessage', 'reportError',
  'open', 'close', 'focus', 'blur', 'print', 'stop',
  'Promise', 'JSON', 'Math', 'Date', 'Array', 'Object', 'String', 'Number', 'Boolean',
  'RegExp', 'Error', 'TypeError', 'RangeError', 'Map', 'Set', 'WeakMap', 'WeakSet',
  'Symbol', 'Proxy', 'Reflect', 'BigInt', 'Function', 'URL', 'URLSearchParams',
  'FormData', 'File', 'Blob', 'FileReader', 'AbortController', 'Uint8Array', 'Int8Array',
  'Float32Array', 'ArrayBuffer', 'DataView', 'Intl', 'Image', 'Audio', 'Option',
  'CustomEvent', 'Event', 'MouseEvent', 'KeyboardEvent', 'IntersectionObserver',
  'MutationObserver', 'ResizeObserver', 'PerformanceObserver', 'DOMParser',
  'XMLHttpRequest', 'WebSocket', 'Response', 'Request', 'Headers', 'Notification',
  'MediaRecorder', 'AudioContext', 'webkitAudioContext', 'SpeechSynthesisUtterance',
  'ClipboardItem', 'TextEncoder', 'TextDecoder', 'Worker', 'BroadcastChannel'
]);

/* Убирает комментарии и содержимое строковых/регулярных литералов, сохраняя длину
   структуры кода. Нужно, чтобы русский текст внутри строк (со скобками и кавычками)
   не попал ни в объявления, ни в вызовы. */
function stripLiterals(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '/' && next === '/') {                    // // комментарий
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {                    // /* комментарий */
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {          // строка
      const quote = c;
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') i++;
        i++;
      }
      i++;
      out += '""';
      continue;
    }
    if (c === '/') {                                     // возможный regex-литерал
      let j = out.length - 1;
      while (j >= 0 && /\s/.test(out[j])) j--;
      const prev = j >= 0 ? out[j] : '';
      /* regex может стоять только там, где ожидается значение, а не после операнда */
      if (prev === '' || '(,=:[!&|?{};+-*%~^<>'.indexOf(prev) >= 0) {
        i++;
        let inClass = false;
        while (i < n && (inClass || src[i] !== '/')) {
          if (src[i] === '\\') i++;
          else if (src[i] === '[') inClass = true;
          else if (src[i] === ']') inClass = false;
          else if (src[i] === '\n') break;
          i++;
        }
        i++;
        out += '/x/';
        continue;
      }
    }
    out += c;
    i++;
  }
  return out;
}

function declaredNames(code) {
  const names = new Set();
  const add = (m, g) => { let x; const re = new RegExp(m, 'g'); while ((x = re.exec(code))) names.add(x[g]); };
  add('function\\s+([A-Za-z_$][\\w$]*)', 1);                       // function foo()
  add('\\b(?:var|let|const)\\s+([A-Za-z_$][\\w$]*)', 1);           // var foo =
  add('[,{]\\s*([A-Za-z_$][\\w$]*)\\s*=(?!=)', 1);                 // var a = 1, foo = ...
  add('catch\\s*\\(\\s*([A-Za-z_$][\\w$]*)', 1);                   // catch (e)
  /* параметры функций — и объявлений, и выражений */
  let m;
  const fnRe = /function\s*[A-Za-z_$][\w$]*\s*\(([^)]*)\)|function\s*\(([^)]*)\)/g;
  while ((m = fnRe.exec(code))) {
    (m[1] || m[2] || '').split(',').forEach(p => {
      const t = p.trim().replace(/=.*$/, '').trim();
      if (/^[A-Za-z_$][\w$]*$/.test(t)) names.add(t);
    });
  }
  return names;
}

const KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'new',
  'delete', 'void', 'in', 'of', 'do', 'else', 'try', 'throw', 'case', 'with', 'instanceof'
]);

function calledNames(code) {
  const names = new Set();
  const re = /(^|[^.\w$'"])([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(code))) {
    const name = m[2];
    if (!KEYWORDS.has(name)) names.add(name);
  }
  return names;
}

const files = fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js')).sort();

test('в assets/js не вызывается ни одна необъявленная функция', () => {
  assert.ok(files.length > 0, 'скрипты не найдены');
  const problems = [];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(JS_DIR, file), 'utf8');
    const code = stripLiterals(raw);
    const declared = declaredNames(code);
    const lines = code.split('\n');

    for (const name of calledNames(code)) {
      if (declared.has(name) || GLOBALS.has(name)) continue;
      const at = lines.findIndex(l => new RegExp('(^|[^.\\w$])' + name + '\\s*\\(').test(l));
      problems.push(file + ':' + (at + 1) + ' — ' + name + '() не объявлена');
    }
  }

  assert.deepStrictEqual(problems, [],
    'вызов необъявленной функции = ReferenceError и молча «мёртвая» кнопка:\n' + problems.join('\n'));
});

test('публикация защищённой версии клиенту использует существующий помощник api()', () => {
  const admin = fs.readFileSync(path.join(JS_DIR, 'admin.js'), 'utf8');

  const at = admin.indexOf("t.closest('#agHandoffPublish')");
  assert.ok(at > 0, 'обработчик #agHandoffPublish не найден');

  /* тело обработчика: от заголовка до конца цепочки .catch(...) */
  const call = admin.slice(at, admin.indexOf('});', admin.indexOf('.catch(', at)));
  assert.match(call, /\bapi\(/,
    'публикация должна идти через api() — он держит мьютекс st.busy и не реджектит');
  assert.ok(!/busyPost/.test(admin),
    'busyPost нигде не объявлена: её вызов кидает ReferenceError до навешивания .catch');

  /* кнопка гасится до запроса — при неуспехе её обязательно надо вернуть,
     иначе повторная публикация недоступна до перезагрузки админки */
  assert.match(call, /if \(!r\.ok\) pb\.disabled = false/,
    'при неуспехе кнопка публикации должна снова становиться активной');
});
