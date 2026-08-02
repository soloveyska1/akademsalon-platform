const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'configurator.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/css/polish15-configurator.css'), 'utf8');
const wizard = html.slice(html.indexOf('function initConceptWizard'));
const legacy = html.slice(0, html.indexOf('function initConceptWizard'));

/*
  Отправку заявки выполняет скрытый легаси-движок, а видимый экран рисует
  визард по событию: легаси снимает hidden с #confDone, визард это замечает.

  Ловушка в том, что тот же #confDone показывается и при СБОЕ отправки —
  через fallbackPanel(). Раньше визард не различал исходы и рисовал
  «Задача получена» поверх несостоявшейся отправки: человек уходил уверенный,
  что заявка принята, а она не ушла. Честный запасной ход со сметой,
  копированием и повтором при этом оставался в скрытом контейнере.

  Эти проверки стерегут различение исходов.
*/

test('исход отправки помечается до того, как экран станет видимым', () => {
  const showDone = legacy.slice(legacy.indexOf('function showDone'));
  const markIndex = showDone.indexOf("setAttribute('data-submit-state'");
  const revealIndex = showDone.indexOf('done.hidden = false');
  assert.ok(markIndex > 0, 'showDone не помечает исход отправки');
  assert.ok(revealIndex > 0, 'showDone не снимает hidden');
  assert.ok(
    markIndex < revealIndex,
    'признак исхода выставляется после снятия hidden — наблюдатель успеет прочитать пустое значение',
  );
  assert.match(showDone.slice(0, revealIndex), /failed \? 'failed' : 'ok'/);
});

test('визард различает успех и сбой, а не только видимость экрана', () => {
  assert.match(
    wizard,
    /getAttribute\('data-submit-state'\) === 'failed'/,
    'наблюдатель не проверяет исход — сбой снова покажется как успех',
  );
  assert.match(wizard, /function renderSubmitFallback\(/);
});

test('экран сбоя не выдаёт себя за принятую заявку', () => {
  const fallback = wizard.slice(
    wizard.indexOf('function renderSubmitFallback'),
    wizard.indexOf('var done = document.getElementById(\'confDone\')'),
  );
  assert.doesNotMatch(fallback, /Задача получена/);
  assert.doesNotMatch(fallback, /Заявка отправлена/);
  assert.match(fallback, /Заявка пока не ушла/);
  assert.match(fallback, /concept-success--failed/);
});

test('запасной ход переносится живым узлом, а не копируется разметкой', () => {
  // у #fbBox обработчики навешаны в легаси прямо на узлы: копирование,
  // повтор и ссылки. Дубликат разметки был бы мёртвым.
  const fallback = wizard.slice(wizard.indexOf('function renderSubmitFallback'), wizard.indexOf('var done = document.getElementById(\'confDone\')'));
  assert.match(fallback, /getElementById\('fbBox'\)/);
  assert.match(fallback, /appendChild\(box\)/);
  assert.doesNotMatch(fallback, /fbCopy|fbRetry|fbText/, 'разметка запасного хода продублирована — кнопки окажутся без обработчиков');
});

test('повтор отправки возвращает форму, а не оставляет экран сбоя', () => {
  assert.match(
    wizard,
    /if \(done\.hidden\) \{[\s\S]{0,400}?concept-success--failed[\s\S]{0,200}?render\(\);/,
    'после «попробовать ещё раз» визард не перерисовывает форму',
  );
});

test('легаси по-прежнему строит запасной ход со всем необходимым', () => {
  const fb = legacy.slice(legacy.indexOf('function fallbackPanel'));
  for (const id of ['fbText', 'fbCopy', 'fbRetry', 'fbTg', 'fbVk', 'fbMax']) {
    assert.match(fb, new RegExp(id), `в запасном ходе пропал ${id}`);
  }
  assert.match(fb, /showDone\('черновик ' \+ id, true\)/, 'запасной ход должен помечать исход как сбой');
});

test('экран сбоя отличим от успеха визуально, а не только текстом', () => {
  assert.match(css, /\.concept-success--failed \.concept-success__mark\{/);
  assert.match(css, /\.concept-success--failed \.fb-sheet\{/);
  // смета должна быть читаемой и прокручиваемой, а не обрезанной
  assert.match(css, /\.concept-success--failed \.fb-sheet\{[\s\S]*?overflow:auto/);
  assert.match(css, /\.concept-success--failed \.fb-sheet pre\{[\s\S]*?white-space:pre-wrap/);
});

test('успешный экран честно подтверждает отправку и показывает номер заявки', () => {
  assert.match(wizard, /<h1 tabindex="-1">Заявка отправлена\.<\/h1>/);
  assert.match(wizard, /getElementById\('doneNo'\)/);
});

test('успех переносит живой статус вложений, блокирует уход во время upload и использует точную claim-ссылку', () => {
  assert.match(wizard, /getElementById\('doneFiles'\)/);
  assert.match(wizard, /filesSlot\.appendChild\(liveFiles\)/);
  assert.match(wizard, /getElementById\('doneCab'\)/);
  assert.match(wizard, /file\.status === 'wait' \|\| file\.status === 'up'/);
  assert.match(wizard, /waiting\.disabled = true/);
  assert.match(wizard, /claimCab\.getAttribute\('href'\)/);
  assert.doesNotMatch(wizard, /appendClaimLink\(claimBot/);
});

test('успех является терминальным состоянием и не позволяет создать дубль через Back', () => {
  assert.match(legacy, /var acceptedOrderId = ''/);
  assert.match(legacy, /if \(submitting \|\| acceptedOrderId\) return/);
  assert.match(legacy, /acceptedOrderId = String\(r\.id\)/);
  assert.match(wizard, /var terminalSuccess = false/);
  assert.match(wizard, /if \(terminalSuccess\) \{\s*location\.replace\('\/'\)/);
  assert.match(wizard, /if \(terminalSuccess\) return/);
});

test('черновик с вложениями очищается только после успешной загрузки каждого файла', () => {
  assert.match(legacy, /if \(!attQueue\.length\) clearSubmittedDrafts\(\)/);
  assert.match(legacy, /attQueue\.every\(function \(item\) \{ return item\.st === 'ok'; \}\)/);
  assert.match(legacy, /if \(delivered\) clearSubmittedDrafts\(\)/);
  assert.match(legacy, /data-att-retry/);
});

test('вложения ограничены документами и изображениями до добавления в очередь', () => {
  assert.match(legacy, /var ATT_ALLOWED_EXT =/);
  assert.match(legacy, /var ATT_ALLOWED_MIME =/);
  assert.match(legacy, /if \(!attAllowed\(f\)\) \{ bad\+\+; return; \}/);
  assert.match(html, /accept="\.doc,\.docx,\.pdf/);
});

test('заявка объявляет ожидаемые вложения, а повтор upload использует стабильный client_file_id', () => {
  assert.match(legacy, /function attClientId\(file\)/);
  assert.match(legacy, /payload\.attachments = attQueue\.map/);
  assert.match(legacy, /client_file_id:item\.clientId \|\| attClientId\(item\.f\)/);
  assert.match(legacy, /fd\.append\('client_file_id', a\.clientId \|\| attClientId\(a\.f\)\)/);
  assert.match(legacy, /window\.addEventListener\('beforeunload'/);
});

test('success requires both a 2xx status and a valid confirmed order id', () => {
  const success = legacy.slice(
    legacy.indexOf('function isSubmitSuccess'),
    legacy.indexOf('function submitFetch'),
  );
  assert.match(success, /return S\.orderContract\.isConfirmed\(attempt\)/);
  assert.equal(
    (legacy.match(/if \(isSubmitSuccess\(a[12]\)\)/g) || []).length,
    2,
    'both network attempts must use the same strict success predicate',
  );
  assert.doesNotMatch(legacy, /if \(a[12]\.r && a[12]\.r\.ok && a[12]\.r\.id\)/);
});

test('ambiguous retries keep one request id across reload until a definitive result', () => {
  assert.match(legacy, /S\.orderContract\.submit\('configurator', payload, timeoutMs\)/);
  assert.match(legacy, /attempt && attempt\.clientRequestId/);
  assert.match(legacy, /classify\(attempt\) === 'definitive_rejection'/);
  assert.doesNotMatch(legacy, /function onSubmitErr[\s\S]{0,120}?clearRequestId\(\);/);
});

test('service success removes its stale resume concept without deleting unrelated cart data', () => {
  const cleanup = legacy.slice(
    legacy.indexOf('function clearSubmittedDrafts'),
    legacy.indexOf('function onSubmitOk'),
  );
  assert.match(cleanup, /sentDraft\.concept\.mode === 'service'/);
  assert.match(cleanup, /delete sentDraft\.concept/);
  assert.match(cleanup, /S\.store\.set\('salon_draft',sentDraft\)/);
  assert.match(legacy, /function onSubmitOk\(r, attempt\)[\s\S]{0,500}?clearSubmittedDrafts\(\)/);
});

test('fallback copy does not promise an impossible ten-second recovery', () => {
  const fallback = legacy.slice(legacy.indexOf('function veilShow'), legacy.indexOf('function showDone'));
  assert.doesNotMatch(fallback, /10 секунд/);
  assert.match(fallback, /покажем резервный способ отправки/);
});
