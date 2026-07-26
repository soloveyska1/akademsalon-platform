const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const app = read('assets/js/app.js');
const cabinet = read('assets/js/cabinet.js');
const admin = read('assets/js/admin.js');
const extras = read('assets/js/extras.js');
const supporting = read('assets/js/polish15-supporting.js');
const configurator = read('configurator.html');
const zayavka = read('zayavka.html');
const analyticsConsent = read('consent-analytics.html');
const privacy = read('privacy.html');
const referral = read('referral.html');
const loyalty = read('loyalty.html');

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
      else if (char === '\\\\') escaped = true;
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
        const fnSource = source.slice(start, i + 1)
          .replace(`function ${name}`, 'function');
        return Function(`"use strict"; return (${fnSource});`)();
      }
    }
  }
  throw new Error(`unterminated function ${name}`);
}

test('UTM attribution keeps canonical non-PII codes only', () => {
  const code = namedFunction(app, 'code');
  for (const value of ['yandex', 'cpc', 'summer_2026', 'vk-ads', 'a1']) {
    assert.equal(code(value), value, `${value} should remain canonical`);
  }
  for (const value of [
    'name@example.com',
    '+7 999 123-45-67',
    '79991234567',
    'https://example.com/path',
    'www.example.com',
    '550e8400-e29b-41d4-a716-446655440000',
    'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3',
    ['sk', 'live', ['4eC39HqL', 'yjWDarjtT1zdp7dc'].join('')].join('_'),
    'Имя Клиента',
    'campaign/value',
  ]) {
    assert.equal(code(value), '', `${value} must be rejected, not cleaned`);
  }
  assert.match(app, /var PARAMS = \['utm_source','utm_medium','utm_campaign','utm_content','utm_term'\]/);
  assert.doesNotMatch(app, /PARAMS\s*=\s*\[[^\]]*(?:gclid|yclid)/);
  assert.match(app, /var KEY = 'salon_attr_v2'/);
  assert.match(app, /Salon\.store\.del\(OLD_KEY\)/);
  assert.match(app, /return 'external'/);
  assert.doesNotMatch(app, /document\.referrer[\s\S]{0,180}Salon\.store\.set/);
});

test('analytics consent describes the implementation without a server checksum promise', () => {
  assert.match(app, /var VERSION = 3/);
  assert.match(app, /document: 'analytics-consent-2\.2'/);
  assert.match(analyticsConsent, /Редакция 2\.2/);
  assert.match(analyticsConsent, /только в хранилище этого браузера/);
  assert.match(analyticsConsent, /Отдельная серверная запись согласия и контрольная сумма текста не создаются/);
  assert.doesNotMatch(analyticsConsent, /сервер[^<.]{0,100}(?:фиксирует|сохраняет)[^<.]{0,100}(?:согласие|контрольн)/i);
  assert.match(privacy, /Запись выбора об аналитике/);
  for (const source of [configurator, extras, supporting]) {
    assert.match(source, /privacy 3\.1/);
    assert.doesNotMatch(source, /privacy 3\.0/);
  }
});

test('referral contract consistently rewards the inviter after the first paid order', () => {
  for (const source of [extras, referral, loyalty]) assert.match(source, /200 бонус/);
  assert.match(extras, /полностью оплатишь первый заказ, мне начислят 200 бонусов/);
  assert.match(referral, /Пригласившему[^<\n]{0,140}первый заказ/);
  assert.match(loyalty, /пригласившему[^<\n]{0,140}первого полностью оплаченного заказа/);
  assert.match(referral, /Для приглашённого цена не меняется/);
  assert.match(loyalty, /приглашённому реферальные бонусы не начисляются/);
  assert.match(extras, /Для тебя цена от ссылки не меняется/);
  assert.doesNotMatch(extras, /Другу\s*[—-]\s*<b>200|200 бонусов[^.\n]{0,80}(?:другу|приглашённому)/i);
});

test('order capability tokens stay out of new upload/list query strings', () => {
  assert.match(configurator, /h\['X-Order-Token'\] = attOrder\.token/);
  assert.match(app, /'X-Order-Tokens': g\.join\(','\)/);
  assert.match(cabinet, /'X-Order-Token': t/);
  assert.match(cabinet, /'X-Order-Tokens': tokens\.join\(','\)/);
  for (const source of [app, cabinet, configurator, zayavka]) {
    assert.doesNotMatch(source, /\/orders[^'"\n]*[?&](?:token|tokens)=/);
  }
  assert.doesNotMatch(cabinet, /location\.search[^;\n]{0,160}claim/);
  assert.match(cabinet, /location\.hash\.match\(\/claim=/);
  assert.match(app, /dashboard\.html#claim=/);
});

test('browser secret storage is session-scoped and old persistent secrets are removed', () => {
  assert.match(app, /Salon\.secretStore\s*=/);
  assert.match(app, /sessionStorage\.setItem/);
  for (const key of ['salon_session', 'salon_user', 'salon_tokens']) {
    assert.match(app, new RegExp(`secretValue\\('${key}'`));
    assert.match(app, new RegExp(`Salon\\.store\\.del\\('${key}'\\)`));
  }
  assert.match(supporting, /Salon\.secretStore\.set\('salon_gift_buy'/);
  assert.doesNotMatch(supporting, /Salon\.store\.set\('salon_gift_buy'/);
});

test('normal authentication uses HttpOnly-cookie transport with CSRF protection', () => {
  assert.match(app, /credentials:\s*'include'/);
  assert.match(app, /cookieValue\('__Host-salon_csrf'\)/);
  assert.match(app, /h\['X-CSRF-Token'\]\s*=\s*csrf/);
  assert.match(app, /'X-Session-Mode':\s*'cookie'/);
  assert.match(app, /sessionHint\(\)\s*\?\s*'__cookie__'/);
  assert.match(app, /post\('\/auth\/migrate'/);
  assert.match(app, /get\('\/auth\/session'/);
  assert.match(app, /post\('\/auth\/logout'/);
  assert.match(app, /post\('\/auth\/poll',\s*\{\},\s*\{\s*'X-Auth-Poll':\s*cur\.pollState\s*\}/);

  for (const source of [cabinet, admin, configurator]) {
    assert.match(source, /S\.api\.headers\(/);
    assert.match(source, /credentials:\s*'include'/);
    assert.doesNotMatch(source, /Authorization\s*[:=]/);
  }
});

test('new cross-device order links are one-time exchanges and are scrubbed immediately', () => {
  assert.match(cabinet, /history\.replaceState\(null,\s*'',\s*location\.pathname\)/);
  assert.match(cabinet, /\/orders\/access\/exchange/);
  assert.match(cabinet, /'X-Claim-Exchange':\s*claimTok/);
  assert.match(cabinet, /\/\^cx1_\/\.test\(claimTok\)/);
  assert.match(configurator, /r\.claim_url/);
  assert.match(zayavka, /d\.claim_url/);
});

test('gift purchase secrets use a header and are removed from the visible address', () => {
  assert.match(supporting, /'X-Gift-Token':\s*state\.token/);
  assert.match(supporting, /history\.replaceState\(null,\s*'',\s*location\.pathname\)/);
  assert.doesNotMatch(supporting, /\/gift\/state[^'"\n]*[?&]t=/);
  assert.doesNotMatch(supporting, /giftPath\(path\)[^;\n]*[?&]t=/);
});

test('A2 offer issuance requires recorded participation and customer decisions', () => {
  assert.match(admin, /id="agOffAuthorConfirmed"/);
  assert.match(admin, /id="agOffAuthorDecisions"/);
  assert.match(admin, /confirmed:\s*authorConfirmed/);
  assert.match(admin, /customer_decisions_and_data:\s*authorDecisions/);
  assert.match(admin, /var incompleteA2 = offerSpecLines\.some/);
  assert.match(admin, /participation\.confirmed !== true/);
});

test('B1 and B2 offers require structured named rights provenance', () => {
  assert.match(admin, /var RIGHTS_SCHEMA_VERSION = 1/);
  assert.match(admin, /var RIGHTS_MODE_B1 = 'simple_license'/);
  assert.match(admin, /var RIGHTS_MODE_B2 = 'exclusive_right_alienation'/);
  assert.match(admin, /id="agOffRightsEvidence"/);
  assert.match(admin, /id="agOffRightsConfirmed"/);
  assert.match(admin, /actual_author_profile:\s*rights\.author_profile/);
  assert.match(admin, /rights_basis:\s*rights\.basis/);
  assert.match(admin, /performer_profiles:\s*rights\.performer_profiles/);
  assert.match(admin, /rights_chain:\s*rights\.chain/);
  assert.match(admin, /rights_confirmation:\s*rights\.confirmation/);
  assert.match(admin, /offerSpecLines\.some\(function \(line\) \{ return !rightsLineReady\(line\); \}\)/);
  assert.doesNotMatch(admin, /Исполнитель или указанный в строке привлечённый автор/);
});

test('AI specification keeps its canonical service id and source provenance', () => {
  assert.match(admin, /service_id:isAiEditing \? 'ai' : serviceId/);
  assert.match(admin, /var isAiLine = \/\^\(\?:ai\|svc_ai\)\$\//);
  assert.match(admin, /service_id: lineServiceId/);
  assert.match(admin, /source_material_provided:isAiEditing/);
  assert.match(admin, /customerInputs\.source_material_provided === true/);
  assert.match(admin, /inputs\.source_material_provided === true/);
  assert.match(admin, /original_prompt:isAiEditing/);
  assert.match(admin, /sources_disclosure:isAiEditing/);
  assert.match(admin, /sourceSpecLines = existingSpecLines\.length/);
});

test('Telegram receives a one-time login code, never an order capability token', () => {
  for (const source of [app, cabinet, admin, extras, configurator, zayavka]) {
    assert.doesNotMatch(source, /t\.me\/[^'"\n]*claim_/);
  }
  assert.match(app, /Вход через Telegram: код → t\.me\/бот\?start=auth_<код>/);
  assert.match(extras, /Привязка через Telegram одноразовая/);
  assert.match(cabinet, /Привязка через Telegram одноразовая/);
  assert.match(admin, /одноразовый код/);
  assert.doesNotMatch(admin, /bot_claim_url/);
});

test('sensitive entry pages suppress referrers', () => {
  for (const file of ['dashboard.html', 'configurator.html', 'zayavka.html', 'gift.html', 'admin.html']) {
    assert.match(read(file), /<meta name="referrer" content="no-referrer"\s*\/?>/);
  }
});
