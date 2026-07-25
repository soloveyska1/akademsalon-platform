const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function count(source, pattern) {
  return (source.match(pattern) || []).length;
}

test('configurator keeps the approved facade as its only visual page', () => {
  const html = read('configurator.html');
  const css = read('assets/css/polish15-configurator.css');

  assert.equal(count(html, /<main\b/g), 1);
  assert.equal(count(html, /<\/main>/g), 1);
  assert.doesNotMatch(html, /service-v2\.css|<style\b|production-mechanics/);
  assert.match(html, /<section class="wizard-main concept-wizard-host" id="conceptWizard"/);
  assert.match(html, /<div class="mechanics-registry" id="order" hidden aria-hidden="true">/);
  assert.match(css, /\.configurator-task \.mechanics-registry,[\s\S]*display:none!important/);

  for (const id of [
    'typeGroup', 'discGroup', 'tierGroup', 'segTerm', 'svcAsk',
    'fTopic', 'fDeadline', 'fDetails', 'fFiles', 'fName', 'fContact',
    'fConsent', 'btnSubmit', 'attAdd', 'attList', 'confDone', 'doneNo',
    'promoApply', 'giftApply', 'tgLoginBtn', 'sendVeil'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing live hook #${id}`);
  }

  assert.match(html, /SalonCart\.init\(/);
  assert.match(html, /fetch\(S\.api\.base \+ '\/orders'/);
  assert.match(html, /\/orders\/' \+ attOrder\.id \+ '\/upload'/);
  assert.match(html, /S\.api\.post\('\/promo\/check'/);
  assert.match(html, /S\.api\.get\('\/gift\/check\?code='/);
  assert.match(html, /document\.getElementById\('btnSubmit'\)[\s\S]*submitButton\.click\(\)/);
  assert.match(css, /\.configurator-task \.send-veil\{/);
});

test('application page has one main and a non-visual payment registry', () => {
  const html = read('zayavka.html');

  assert.equal(count(html, /<main\b/g), 1);
  assert.equal(count(html, /<\/main>/g), 1);
  assert.doesNotMatch(html, /id="zkMain"|<style\b|СОБРАННАЯ ЗАЯВКА v2/);
  assert.match(html, /<main class="p15-operations standard-page" id="p15ZayavkaMain"/);
  assert.match(html, /<div class="p15-mechanics-registry" id="zkMechanics" hidden aria-hidden="true">/);
  assert.match(html, /var oldRoot = document\.getElementById\('zkMechanics'\)/);

  for (const id of [
    'zkDoc', 'zkReqStep', 'zkWait', 'zkDone', 'zkCold', 'zk404',
    'zkMail', 'zkPay', 'zkRqSend', 'zkRqBack', 'zkOpenCase',
    'zkTgShare', 'zkLinkBox', 'zkMctaBtn'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing payment hook #${id}`);
  }

  assert.match(html, /'\/offer\/' \+ encodeURIComponent\(state\.code\) \+ '\/pay'/);
  assert.match(html, /payBody\(\{ claim: 1 \}\)/);
  assert.match(html, /b\.pv = PAGE_VER/);
  assert.match(html, /b\.notify_to = mv/);
  assert.match(html, /b\.n = state\.nonce/);
  assert.match(html, /data-p15-offer-pay/);
  assert.match(html, /data-p15-claim/);
  assert.match(html, /data-p15-telegram-claim/);
});
