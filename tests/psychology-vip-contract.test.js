const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('psychology page exposes four truthful levels with one action owner', () => {
  const html = read('diplomnaya-po-psihologii.html');
  const offers = [...html.matchAll(/<input[^>]+name="psychology-offer"[^>]+>/g)].map((match) => match[0]);

  assert.equal(offers.length, 4);
  for (const value of ['diagnostic', 'editing', 'support', 'psychologyvip']) {
    assert.ok(offers.some((tag) => tag.includes(`value="${value}"`)), `missing ${value}`);
  }
  for (const price of ['3 500–5 000 ₽', '29 000–40 500 ₽', '48 500–68 000 ₽', '91 000 ₽']) {
    assert.match(html, new RegExp(price.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.equal((html.match(/id="psychologyOfferCta"/g) || []).length, 1);
  assert.match(html, /data-offer-href="configurator\.html\?service=pv&amp;work=diplom&amp;discipline=psychology&amp;situation=draft&amp;result=support&amp;route=service"/);
  assert.doesNotMatch(html, /правк[аи] без ограничений|неограниченн/i);
});

test('VIP price has one canonical service identity and bounded economics', () => {
  const app = read('assets/js/app.js');
  const configurator = read('configurator.html');
  const html = read('diplomnaya-po-psihologii.html');

  assert.match(app, /id:'psychologyvip',[\s\S]*?from:91000[\s\S]*?code:'pv',[\s\S]*?fixed:true/);
  assert.match(configurator, /ensurePsychologyVipService[\s\S]*?service\.id === 'psychologyvip'[\s\S]*?from:91000[\s\S]*?code:'pv',[\s\S]*?fixed:true/);
  assert.match(html, /до трёх консолидированных циклов замечаний/);
  assert.match(html, /Один полный нормоконтроль и одна повторная сверка/);
  assert.match(html, /Новая тема после фиксации, новые данные, методики, выборка или замечания после установленной даты рассчитываются отдельно/);
  for (const stage of ['27 300 ₽', '36 400 ₽']) assert.match(html, new RegExp(stage));
});

test('VIP remains A2 from configurator through cart and case context', () => {
  const source = read('configurator.html');
  const cart = read('assets/js/cart.js');
  const admin = read('assets/js/admin.js');

  assert.match(source, /psychologyvip:\s*'custom'/);
  assert.match(source, /service\.id === 'psychologyvip' \? 'support'/);
  assert.match(source, /psychologyvip:'psychology_full_vip'/);
  assert.match(source, /service && service\.id === 'psychologyvip'\) return 'A2'/);
  assert.match(source, /academicSubmode:svc\.id === 'author' \? '' : \(svc\.id === 'psychologyvip' \? 'A2' : 'A1'\)/);
  assert.match(source, /authorParticipation:svc\.id === 'psychologyvip' && !!\(caseContext && caseContext\.author_participation\)/);
  assert.match(source, /state\.result === 'support'[\s\S]*?data-concept-authorship/);
  assert.match(source, /psychologyVipSubmit[\s\S]*?activeCart\.materializeCurrent\(\{ silent:true \}\)/);
  assert.match(cart, /scopeCode:'psychology_full_vip'/);
  assert.match(cart, /payment_plan_request:[\s\S]*?stages:3[\s\S]*?percentages:\[30,40,30\]/);
  assert.match(admin, /requestedStages[\s\S]*?payment_plan_request\.stages/);
  assert.match(admin, /iterations:Math\.max\(1, parseInt\(row\.iterations/);
  assert.match(admin, /payment_stage_allocations:Array\.isArray\(row\.payment_stage_allocations\)/);
});

test('psychology materials are gated by explicit de-identification', () => {
  const source = read('configurator.html');

  assert.match(source, /function isPsychologyMaterials\(\)/);
  assert.match(source, /service && service\.id === 'psychologyvip'/);
  assert.match(source, /state\.discipline === 'psychology'/);
  assert.match(source, /data-clinical-data-confirmed/);
  assert.match(source, /ФИО, контакты, номера карт, названия учреждений/);
  assert.match(source, /privacyBlocked \? 'disabled aria-disabled="true"/);
  assert.match(source, /serviceQuestionsComplete\(\) && sourceEvidenceReady\(\) && clinicalPrivacyReady\(\)/);
  assert.match(source, /Подтвердите, что описание и файлы обезличены/);
});

test('research passport and search language cover the real psychology request', () => {
  const html = read('diplomnaya-po-psihologii.html');
  const app = read('assets/js/app.js');
  const chrome = read('assets/js/polish15-chrome.js');

  for (const label of ['Гипотеза', 'Переменные', 'Группы', 'Предпосылки', 'Критерий', 'Эффект', 'Интерпретация', 'Ограничение']) {
    assert.match(html, new RegExp(`>${label}<`));
  }
  assert.match(html, /Манна–Уитни не выбираем заранее/);
  for (const term of ['клиническая психология', 'корреляционный анализ', 'манн уитни', 'сравнение групп', 'детектор ии']) {
    assert.match(app, new RegExp(term));
  }
  assert.match(chrome, /\['манна уитни', 'манн уитни'\]/);
});
