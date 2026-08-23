const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'assets/js/admin.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');

function namedFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `function ${name} must exist`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = bodyStart; i < source.length; i += 1) {
    const char = source[i];
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
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

const resolver = Function(
  `"use strict"; return (${namedFunction(admin, 'specificationAcademicSubmode')});`,
)();

const specificationLinesForPrice = Function(
  `"use strict";
   const SPEC_EXECUTOR_NAME = 'Исполнитель';
   ${namedFunction(admin, 'specificationContour')}
   ${namedFunction(admin, 'specificationAcademicSubmode')}
   ${namedFunction(admin, 'specificationAllocation')}
   ${namedFunction(admin, 'specificationLinesForPrice')}
   return specificationLinesForPrice;`,
)();

function rawPracticeRequest(item) {
  return {
    work_label: 'Отчёт по практике',
    cart: { schema_version: '2.0-request', items: [item] },
  };
}

test('explicit A1 outranks vip/support inference while legacy rows keep the A2 fallback', () => {
  const strongestA2Signals = {
    tier: 'vip',
    type: 'work_vip',
    case_context: { result: 'support' },
  };

  assert.equal(resolver({ ...strongestA2Signals, academic_submode: 'A1' }, 'A', 'work_vip'), 'A1');
  assert.equal(resolver({ ...strongestA2Signals, academicSubmode: 'А1' }, 'A', 'work_vip'), 'A1');
  assert.equal(resolver({ ...strongestA2Signals, academic_submode: 'A2' }, 'A', 'work_vip'), 'A2');
  assert.equal(resolver(strongestA2Signals, 'A', 'work_vip'), 'A2');
  assert.equal(resolver({}, 'A', 'practice'), 'A1');
  assert.equal(resolver({ academic_submode: 'A1' }, 'B1', 'author'), '');
});

test('all practice scope outputs remain distinct in the prepayment specification', () => {
  const diagnosticInputs = [
    'черновик или замечания преподавателя',
    'программа или методичка практики',
  ];
  const diagnostic = specificationLinesForPrice(rawPracticeRequest({
      id: 'practice-diagnostic', label: 'Отчёт по практике', type: 'practice', tier: 'base',
      result_code: 'diagnostic', scope_code: 'practice_draft_diagnostic', academic_submode: 'A1',
      legal_service_type: 'consultation',
      permitted_purpose: 'Письменный разбор предоставленного комплекта без внесения правок.',
      deliverable: 'Карта несоответствий, обязательных исправлений и приоритетов; редактор не вносит правки в документы.',
      inclusions: [
        'сверка переданного черновика или замечаний с программой и методичкой',
        'карта несоответствий и обязательных исправлений по приоритету',
        'оценка объёма и порядка следующего этапа',
      ],
      exclusions: ['правки в Word, дневник или приложения', 'исправленная версия комплекта'],
      scope: { required_inputs: diagnosticInputs },
  }), 2500)[0];

  assert.equal(diagnostic.academic_submode, 'A1');
  assert.equal(diagnostic.legal_service_type, 'consultation');
  assert.match(diagnostic.deliverable, /Карта несоответствий/);
  assert.match(diagnostic.deliverable, /не вносит правки/i);
  assert.match(diagnostic.exclusions.join(' '), /правки в Word/);
  assert.doesNotMatch(diagnostic.inclusions.join(' '), /видим\w* правк|исправленн\w* верси/i);
  assert.deepEqual(diagnostic.scope.required_inputs, diagnosticInputs);
  assert.deepEqual(diagnostic.customer_inputs.required_inputs, diagnosticInputs);
  assert.match(diagnostic.customer_inputs.description, /черновик или замечания преподавателя/);
  assert.match(diagnostic.dependencies.join(' '), /после получения полного комплекта исходников/i);

  const editingInputs = [
    'готовые черновики отчёта и дневника',
    'программа или методичка практики',
    'приложения и требования к подписям',
  ];
  const editing = specificationLinesForPrice(rawPracticeRequest({
      id: 'practice-editing', label: 'Отчёт по практике', type: 'practice', tier: 'turn',
      result_code: 'editing', scope_code: 'practice_draft_editing', academic_submode: 'A1',
      legal_service_type: 'editing',
      permitted_purpose: 'Редактура предоставленного фактического комплекта по практике.',
      deliverable: 'Word с видимыми правками, сверка с программой практики и чек-лист подписей и приложений.',
      inclusions: [
        'видимые редакторские правки в переданных отчёте и дневнике',
        'сверка комплекта с программой или методичкой практики',
        'чек-лист подписей и приложений',
      ],
      scope: { required_inputs: editingInputs },
  }), 8000)[0];

  assert.equal(editing.academic_submode, 'A1');
  assert.equal(editing.legal_service_type, 'editing');
  assert.match(editing.deliverable, /Word с видимыми правками/);
  assert.match(editing.deliverable, /сверка с программой практики/);
  assert.match(editing.deliverable, /чек-лист подписей и приложений/);
  assert.deepEqual(editing.scope.required_inputs, editingInputs);
  assert.deepEqual(editing.customer_inputs.required_inputs, editingInputs);
  assert.match(editing.dependencies.join(' '), /готовые черновики отчёта и дневника/);

  const suppliedPurpose = 'Редакторское сопровождение предоставленного Заказчиком черновика и связанных документов по практике.';
  const premiumDeliverable = 'Карта требований и план согласованных этапов; согласованные редакторские версии отчёта и дневника; итоговый чек-лист комплектности, подписей и приложений.';
  const premiumInclusions = [
    'карта требований и список недостающего по переданному комплекту',
    'план согласованных этапов и редакторская работа с версиями отчёта и дневника',
    'финальная сверка комплектности, подписей и приложений с итоговым чек-листом',
  ];
  const premiumInputs = [
    'программа или методичка практики',
    'черновики отчёта и дневника',
    'реальные даты, задачи и приложения',
  ];
  const exact = specificationLinesForPrice(rawPracticeRequest({
      id: 'practice-support',
      label: 'Отчёт по практике',
      type: 'practice',
      tier: 'vip',
      result_code: 'support',
      scope_code: 'practice_draft_support',
      academic_submode: 'A1',
      legal_service_type: 'editing',
      permitted_purpose: suppliedPurpose,
      deliverable: premiumDeliverable,
      inclusions: premiumInclusions,
      requirements: 'Есть черновик отчёта, дневник и приложения.',
      scope: { required_inputs: premiumInputs },
  }), 14000)[0];

  assert.equal(exact.academic_submode, 'A1');
  assert.equal(exact.legal_service_type, 'editing');
  assert.equal(exact.permitted_purpose, suppliedPurpose);
  assert.equal(exact.deliverable, premiumDeliverable);
  assert.deepEqual(exact.inclusions, premiumInclusions);
  assert.match(exact.deliverable, /Карта требований и план согласованных этапов/);
  assert.match(exact.deliverable, /версии отчёта и дневника/);
  assert.match(exact.deliverable, /итоговый чек-лист/);
  assert.doesNotMatch(exact.deliverable, /полный рабочий черновик/i);
  assert.doesNotMatch(exact.inclusions.join(' '), /исследовательская карта|источники и рабочий черновик/i);
  assert.deepEqual(exact.scope.required_inputs, premiumInputs);
  assert.deepEqual(exact.customer_inputs.required_inputs, premiumInputs);
  assert.match(exact.customer_inputs.description, /реальные даты, задачи и приложения/);
  assert.match(exact.dependencies.join(' '), /после получения полного комплекта исходников/i);
  assert.match(exact.dependencies.join(' '), /программа или методичка практики/);

  const generic = specificationLinesForPrice({
    work_label: 'Исследовательская работа',
    type: 'practice',
    tier: 'vip',
    contract_contour: 'A',
    academic_submode: 'A2',
    case_context: { result: 'support', scope_code: null, academic_submode: 'A2' },
    author_participation: {
      required: true,
      confirmed: true,
      checkpoints: ['утвердить задачу', 'проверить факты', 'подготовить финальную версию'],
    },
  }, 14000)[0];

  assert.equal(generic.academic_submode, 'A2');
  assert.equal(generic.legal_service_type, 'joint_research_development');
  assert.match(generic.deliverable, /полный рабочий черновик/i);
  assert.match(generic.inclusions.join(' '), /исследовательская карта/i);
  assert.equal(generic.author_participation.required, true);
  assert.equal(generic.author_participation.confirmed, true);
  assert.deepEqual(generic.scope.required_inputs, []);
  assert.deepEqual(generic.dependencies, []);
});

test('the admin specification runtime uses the practice continuity cache key', () => {
  assert.match(
    adminHtml,
    /assets\/js\/admin\.js[^"\n]*practice=20260823continuity1/,
  );
  assert.match(admin, /o\.cart && Array\.isArray\(o\.cart\.items\)/);
});
