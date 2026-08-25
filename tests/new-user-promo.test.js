const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const campaign = require('../assets/js/promo-campaign.js');

test('reviewed schedules grow monotonically and keep exact boundaries', () => {
  const welcome = campaign.CAMPAIGNS.welcome;
  const retention = campaign.CAMPAIGNS.retention;
  assert.equal(campaign.discount(welcome, 2499), 0);
  assert.equal(campaign.discount(welcome, 2500), 300);
  assert.equal(campaign.discount(welcome, 5000), 600);
  assert.equal(campaign.discount(welcome, 10000), 1200);
  assert.equal(campaign.discount(welcome, 20000), 2400);
  assert.equal(campaign.discount(welcome, 41666), 5000);
  assert.equal(campaign.discount(welcome, 41667), 5000);
  assert.equal(campaign.discount(retention, 4999), 0);
  assert.equal(campaign.discount(retention, 5000), 500);
  assert.equal(campaign.discount(retention, 10000), 1000);
  assert.equal(campaign.discount(retention, 20000), 2000);
  assert.equal(campaign.discount(retention, 24999), 2500);
  assert.equal(campaign.discount(retention, 25000), 2500);
  const retentionCutoff = Date.parse(retention.issueEndsAt);
  assert.equal(campaign.retentionIssuable(null, retentionCutoff), true);
  assert.equal(campaign.retentionIssuable(null, retentionCutoff + 1), false);
  assert.equal(
    campaign.retentionIssuable({ retention_issue_end: '2026-09-18T20:59:59' }, retentionCutoff),
    true,
  );

  for (const schedule of [welcome, retention]) {
    let priorDiscount = 0;
    let priorFinal = schedule.minPrice - campaign.discount(schedule, schedule.minPrice);
    for (let price = 0; price <= 250000; price += 1) {
      const amount = campaign.discount(schedule, price);
      const finalPrice = price - amount;
      assert.ok(amount >= priorDiscount, `${schedule.id}: discount at ${price}`);
      if (price >= schedule.minPrice) {
        assert.ok(finalPrice >= priorFinal, `${schedule.id}: final at ${price}`);
        priorFinal = finalPrice;
      }
      assert.ok(amount <= schedule.cap, `${schedule.id}: cap at ${price}`);
      const maxShare = schedule === welcome ? 0.12 : 0.10;
      if (price >= schedule.minPrice) {
        assert.ok(amount <= Math.ceil(price * maxShare), `${schedule.id}: share at ${price}`);
      }
      priorDiscount = amount;
    }
  }
});

test('eligibility fails closed and owner mode is presentation-only', () => {
  assert.equal(campaign.canPresent({ state: 'eligible' }, { returning: false }), true);
  assert.equal(campaign.canPresent({ state: 'eligible' }, { returning: true }), false);
  assert.equal(campaign.canPresent({ state: 'provisional' }, { returning: false }), true);
  assert.equal(campaign.canPresent({ state: 'provisional' }, { returning: true }), false);
  assert.equal(campaign.canPresent({ state: 'existing' }, { returning: false }), false);
  assert.equal(campaign.canPresent({ state: 'unknown' }, { returning: false }), false);
  assert.equal(campaign.canPresent(null, { returning: false }), false);
  assert.deepEqual(campaign.presentationMode({ state: 'owner_preview' }), {
    show: true,
    previewOnly: true,
  });
});

test('retention payload is categorical and cannot carry draft or identity text', () => {
  assert.deepEqual(
    campaign.retentionPayload({
      stage: 'contact',
      activeSeconds: 146,
      itemCount: 3,
      quoteLow: 14000,
      topic: 'private title',
      contact: 'private@example.test',
    }),
    {
      campaign_id: 'retention-v1',
      stage: 'contact',
      active_seconds_bucket: '120_plus',
      item_count_bucket: '2_3',
      quote_band: '10_20k',
    },
  );
});

test('campaign assets are isolated, versioned and never preloaded for suppressed users', () => {
  const home = read('index.html');
  const configurator = read('configurator.html');
  const script = read('assets/js/promo-campaign.js');
  for (const html of [home, configurator]) {
    assert.match(html, /assets\/css\/promo-campaign\.css\?v=20260825promo3/);
    assert.match(html, /assets\/js\/promo-campaign\.js\?v=20260825promo3/);
  }
  assert.doesNotMatch(home, /<img[^>]+promo-salon-welcome/u);
  assert.doesNotMatch(configurator, /<img[^>]+promo-salon-welcome/u);
  assert.match(script, /assets\/img\/promo-salon-welcome\.webp\?v=20260825promo3/);
  assert.match(script, /assets\/img\/promo-salon-welcome\.png/);
  assert.match(script, /\/promo\/eligibility/);
  assert.match(script, /credentials:\s*'include'/);
  assert.match(script, /owner_preview/);
  assert.match(script, /Предпросмотр владельца · код не выдан · скидка не активирована/u);
  assert.match(script, /node\.hidden \|\| node\.inert/);
  assert.match(script, /getAttribute\('aria-hidden'\) === 'true'/);
  assert.match(script, /style\.display !== 'none' && style\.visibility !== 'hidden'/);
});

test('retention uses explicit intent or later return and never networks during unload', () => {
  const script = read('assets/js/promo-campaign.js');
  const configurator = read('configurator.html');
  assert.match(configurator, /window\.SalonPromoCampaignBridge\s*=\s*\{/);
  assert.match(configurator, /checkpoint:function/);
  assert.match(configurator, /submission:function/);
  assert.match(script, /pagehide/);
  assert.match(script, /\/promo\/retention/);
  assert.match(script, /\.tx-close,\s*\.tx-mobile-back,\s*\.wizard-close/);
  assert.match(script, /previewOnly \? 'Закрыть предпросмотр' : 'Сохранить и выйти'/u);
  assert.match(script, /Примените скидку сейчас — код будет действовать 72 часа/u);
  assert.doesNotMatch(script, /beforeunload|sendBeacon|mouseleave|mouseout/);
  const pagehide = script.slice(script.indexOf('function onPageHide'), script.indexOf('function postRetention'));
  assert.doesNotMatch(pagehide, /fetch\(|\.post\(|\.get\(/);
});

test('public terms state provisional authority, first-order scope and non-stacking', () => {
  const loyalty = read('loyalty.html');
  assert.match(loyalty, /ПЕРВЫЙЛИСТ/u);
  assert.match(loyalty, /12%/u);
  assert.match(loyalty, /2 500 ₽/u);
  assert.match(loyalty, /5 000 ₽/u);
  assert.match(loyalty, /10%/u);
  assert.match(loyalty, /2 500 ₽/u);
  assert.match(loyalty, /не позднее 18 сентября 2026 г\./u);
  assert.match(loyalty, /не складыва/u);
  assert.match(loyalty, /окончательн[^<]{0,80}сервер/u);
  assert.match(loyalty, /очистил все данные сайта/u);
});
