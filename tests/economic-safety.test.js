const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = process.env.SALON_PUBLIC_ROOT || path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

const deposit = read('deposit.html');
const referral = read('referral.html');
const loyalty = read('loyalty.html');
const refunds = read('refunds.html');
const oferta = read('oferta.html');
const extras = read('assets/js/extras.js');

test('deposit rebuilt calculator preserves published tiers and wallet route', () => {
  assert.match(deposit,/data-deposit-lab/);
  for(const [amount,rate] of [[20000,8],[30000,10],[45000,12],[60000,15]])assert.match(deposit,new RegExp('data-topup="'+amount+'"[^>]*><span>[^<]+</span><b>'+rate+'%'));
  assert.match(deposit,/href="dashboard\.html#deposit"/);
  assert.doesNotMatch(deposit,/временно (?:на паузе|недоступ)/i);
});

test('deposit copy promises an earned reserve, not immediately spendable points', () => {
  assert.match(deposit, /бонусы за использование/i);
  assert.match(deposit, /Резерв не доступен сразу/);
  assert.match(deposit, /После приёмки и 14 дней/);
  assert.match(loyalty, /Бонусный резерв не является доступным балансом в момент пополнения/);
  assert.match(loyalty, /Кэшбэк и депозитная ставка <strong>не складываются<\/strong>/);
  assert.match(loyalty, /редакции 1\.11 с 1 сентября 2026 г/);
  assert.doesNotMatch(deposit, /бонусы сверху сразу/i);
});

test('cash refund remains exact and never deducts an already used discount', () => {
  assert.match(refunds, /id="advances"/);
  assert.match(refunds, /номинал не вычитается из денежного остатка/);
  assert.match(oferta, /Неиспользованный денежный остаток возвращается по заявлению без штрафа/);
  assert.match(loyalty, /номинал ранее использованных промобонусов из денежного остатка не вычитаются/);
  assert.match(deposit, /Использованные скидки из него не вычитаются/);
  assert.match(refunds, /денежная часть снова становится доступна в кошельке/);
  assert.match(loyalty, /При полном возврате восстанавливаются все списанные/);
  assert.match(loyalty, /при частичном — только бонусная часть/);
});

test('referral storefront stays active and advertises exactly fixed 200 once', () => {
  assert.match(referral, /Пригласившему однократно начисляют 200 бонусов/);
  assert.match(referral, /Для приглашённого цена не меняется/);
  assert.match(referral, /href="https:\/\/t\.me\/academic_saloon_bot\?start=club"/);
  assert.match(loyalty, /пригласившему — 200 бонусов однократно/);
  assert.match(loyalty, /приглашённому реферальные бонусы не начисляются/);
  assert.doesNotMatch(referral, /5%|7%|реф-буст/i);
  assert.doesNotMatch(referral, /временно (?:на паузе|не оформляются)/i);
});

test('invite dialog rejects generic URLs without inventing a service pause', () => {
  assert.match(extras, /function personalReferral/);
  assert.match(extras, /\/academic_saloon_bot/);
  assert.match(extras, /Личная ссылка не загрузилась/);
  assert.doesNotMatch(extras, /links\.enabled/);
  assert.doesNotMatch(extras, /приглашения временно на паузе/i);
});

test('invite dialog is keyboard-modal without changing page geometry', () => {
  assert.match(extras, /entry\.node\.inert = true/);
  assert.match(extras, /e\.key !== 'Tab'/);
  assert.match(extras, /window\.scrollTo\(0, scrollY\)/);
  assert.match(extras, /el\.querySelector\('\.inv-x'\)\.focus\(\)/);
  assert.match(extras, /opener\.focus\(\)/);
});
