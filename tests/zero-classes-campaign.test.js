const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Zero Classes page states exact value, limits, dates and non-cash boundary', () => {
  const html = read('zero-classes.html');
  assert.match(html, /09:01/);
  assert.match(html, /13:01/);
  assert.match(html, /18:01/);
  assert.match(html, /скидк[ау] 1 000 ₽/i);
  assert.match(html, /заказ[ау]? от 5 000 ₽/i);
  assert.match(html, /до 21 сентября 2026 года, 23:59 МСК/);
  assert.match(html, /Не деньги, не депозит и не подарочный сертификат с балансом/);
  assert.match(html, /Один код выдаём на один Telegram-аккаунт/);
  assert.match(html, /сработает у того, кто первым применит его к заказу/);
  assert.doesNotMatch(html, /оплачено Кладовой|денежный сертификат|1 000 ₽ на балансе/i);
});

test('Zero Classes page delegates issuance to Kladovaya and reads only aggregate stock', () => {
  const html = read('zero-classes.html');
  const js = read('assets/js/zero-classes.js');
  assert.match(html, /https:\/\/studkladovaya\.ru\/zero/);
  assert.match(js, /\/api\/campaigns\/zero-classes-2026-09-01\/status/);
  assert.doesNotMatch(js, /\/claim|claimant_key|X-Zero-Signature/);
  assert.doesNotMatch(html + js, /NP26-[A-Z0-9-]+/);
});

test('campaign backend installer is hash-pinned and never prints promo codes', () => {
  const installer = read('backend/salon_bot/install_zero_classes_campaign.py');
  const service = read('backend/salon_bot/zero_campaign.py');
  const credentialUnit = read('backend/salon_bot/systemd/salon-bot-v2-zero-campaign.conf');
  assert.match(installer, /KNOWN_BEFORE/);
  assert.match(installer, /unknown source image/);
  assert.match(installer, /never codes/);
  assert.match(service, /DROP_QUOTA = 10/);
  assert.match(service, /AMOUNT = 1000/);
  assert.match(service, /MIN_PRICE = 5000/);
  assert.match(service, /BEGIN IMMEDIATE/);
  assert.match(service, /idx_zero_campaign_claimant/);
  assert.match(service, /idx_promo_claims_zero_code/);
  assert.match(service, /reserve_nonce/);
  assert.match(service, /authenticated_claim_payload/);
  assert.match(service, /CLAIM_RATE_GLOBAL = 120/);
  assert.doesNotMatch(installer, /zero_campaign_claim[\s\S]{0,300}_rate_ok\(_ip/u);
  assert.match(installer, /campaign code not issued/);
  assert.match(installer, /SELECT expires_at FROM zero_campaigns/);
  assert.match(installer, /--enable requires --restart and runtime preflight/);
  assert.match(installer, /campaign code already bound/);
  assert.match(installer, /issued codes exist; disable issuance instead of restoring/);
  assert.match(credentialUnit, /LoadCredential=zero_campaign_hmac:/);
});
