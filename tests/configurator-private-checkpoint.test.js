const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'configurator.html'), 'utf8');

function namedFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `function ${name} must exist`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        const fnSource = source.slice(start, index + 1)
          .replace(`function ${name}`, 'function');
        return Function(`"use strict"; return (${fnSource});`)();
      }
    }
  }
  throw new Error(`unterminated function ${name}`);
}

test('legacy local drafts scrub old private residue and never write it again', () => {
  const scrub = namedFunction(html, 'scrubPrivateDraftFields');
  const marker = '@private_checkpoint_probe';
  const draft = {
    fields: {
      topic: 'Тема',
      deadline: 'Согласовать',
      details: 'Требования',
      name: marker,
      contact: marker,
      ct: 'tg',
    },
    concept: { step: 1 },
  };

  assert.equal(scrub(draft), true);
  assert.deepEqual(draft, {
    fields: {
      topic: 'Тема',
      deadline: 'Согласовать',
      details: 'Требования',
      ct: 'tg',
    },
    concept: { step: 1 },
  });
  assert.equal(scrub(draft), false, 'scrub must be idempotent');

  const saveDraft = html.slice(
    html.indexOf('function saveDraft()'),
    html.indexOf('var draftTimer = null'),
  );
  const restoreDraft = html.slice(
    html.indexOf('/* Восстанавливаем только рабочее описание'),
    html.indexOf('var CT_TAG ='),
  );
  assert.doesNotMatch(saveDraft, /\b(?:name|contact):\s*\$\('f(?:Name|Contact)'\)/);
  assert.doesNotMatch(restoreDraft, /f\.(?:name|contact)/);
  assert.match(html, /scrubStoredPrivateDraft\('salon_draft',\s*draft\)/);
  assert.match(html, /scrubStoredPrivateDraft\(SERVICE_DRAFT_KEY,\s*storedServiceDraft\)/);
});

test('one contact prerequisite predicate distinguishes lost source from valid resumes', () => {
  const missing = namedFunction(html, 'contactSourceMissing');
  assert.equal(missing('contact', true, false), true);
  assert.equal(missing('contact', true, true), false);
  assert.equal(missing('contact', false, false), false);
  assert.equal(missing('materials', true, false), false);

  const canContinue = html.slice(
    html.indexOf('function canContinue()'),
    html.indexOf('function blockReason()'),
  );
  const submit = html.slice(
    html.indexOf('function submit()'),
    html.indexOf('function next()'),
  );
  const go = html.slice(
    html.indexOf('function go(next,fromHistory)'),
    html.indexOf('function startAnother'),
  );
  const publicBridge = html.slice(
    html.indexOf('window.SalonConceptWizard = {'),
    html.indexOf('render();', html.indexOf('window.SalonConceptWizard = {')),
  );
  const cartCheckout = html.slice(
    html.indexOf('checkout:function ()'),
    html.indexOf('});\n  }\n\n  /* --- старт --- */'),
  );
  assert.match(canContinue, /contactSourceMissing/);
  assert.match(submit, /ensureContactPrerequisites/);
  assert.match(go, /ensureContactPrerequisites/);
  assert.match(publicBridge, /goToContact:[\s\S]*?return go\(target\) === true/);
  assert.match(
    cartCheckout,
    /goToContact\(\)[\s\S]*?data-concept-stage[\s\S]*?!== 'contact'\) return/,
    'cart checkout must not focus the hidden legacy contact after preflight rejects the visible step',
  );
});

test('restored file-only requests return to materials without losing commercial intent', () => {
  assert.match(html, /function ensureContactPrerequisites\(reason\)/);
  assert.match(html, /ensureContactPrerequisites\('restore'\)/);
  assert.match(html, /ensureContactPrerequisites\('continue'\)/);
  assert.match(html, /data-material-recovery/);
  assert.match(
    namedFunction(html, 'focusMaterialRecovery').toString(),
    /scrollIntoView/,
    'recovery explanation must be brought into the mobile viewport before focus',
  );
  assert.match(
    html,
    /Файлы не сохраняются после перезагрузки[\s\S]*?приложите материал заново[\s\S]*?минимум 40 знаков[\s\S]*?объём, срок и ориентир цены сохранены/,
  );
  assert.match(html, /state\.step\s*=\s*materialStep[\s\S]*?materialRecoveryReason/);
  assert.match(html, /saveSelections\(\)/);
  assert.match(
    html,
    /restoredMaterialPrerequisite[\s\S]*?render\(\);[\s\S]*?setTimeout\(focusMaterialRecovery,0\)/,
    'a restored file loss must focus its notice after the initial render',
  );
  assert.match(
    html,
    /salon:attachments[\s\S]*?sourceEvidenceReady\(\)[\s\S]*?materialRecoveryReason\s*=\s*''/,
    'reattaching a file must clear the now-stale recovery warning',
  );
});

test('the UI and conflict recovery state the same privacy boundary', () => {
  assert.match(html, /Контакты и файлы не сохраняются/);
  assert.doesNotMatch(html, /введённое сохранено в черновике/);
  assert.match(
    html,
    /Остальные ответы сохранены в черновике[\s\S]*?контакт и согласие нужно указать заново/,
  );
  assert.doesNotMatch(html, /sessionStorage\.setItem\([^\n]*(?:contact|fContact|name)/i);
});
