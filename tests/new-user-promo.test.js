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

test('rescue reason matrix gives the existing discount only to the price objection', () => {
  const reasons = ['price', 'materials', 'unclear', 'deadline'];
  const decisions = reasons.map((reason) => campaign.rescueDecision(reason));
  assert.deepEqual(decisions.map((decision) => decision.id), reasons);
  assert.deepEqual(
    decisions.filter((decision) => decision.kind === 'discount').map((decision) => decision.id),
    ['price'],
  );
  assert.equal(decisions.filter((decision) => decision.requestRetention).length, 1);
  assert.equal(campaign.rescueDecision('free text'), null);
});

test('campaign assets are isolated, versioned and never preloaded for suppressed users', () => {
  const home = read('index.html');
  const configurator = read('configurator.html');
  const script = read('assets/js/promo-campaign.js');
  for (const html of [home, configurator]) {
    assert.match(html, /assets\/css\/promo-campaign\.css\?v=20260825rescue2/);
    assert.match(html, /assets\/js\/promo-campaign\.js\?v=20260829rescue3/);
  }
  assert.doesNotMatch(home, /<img[^>]+promo-salon-welcome/u);
  assert.doesNotMatch(configurator, /<img[^>]+promo-salon-welcome/u);
  assert.match(script, /assets\/img\/promo-salon-welcome\.webp\?v=20260825promo3/);
  assert.match(script, /assets\/img\/promo-salon-welcome\.png/);
  assert.match(script, /\/promo\/eligibility/);
  assert.match(script, /credentials:\s*'include'/);
  assert.match(script, /owner_preview/);
  assert.match(script, /salon_analytics_owner_device_v1/);
  assert.match(script, /salon:analytics-exclusion/);
  assert.match(script, /Предпросмотр владельца · код не выдан · скидка не активирована/u);
  assert.match(script, /node\.hidden \|\| node\.inert/);
  assert.match(script, /!node\.hidden && !node\.closest\('\[hidden\]'\)/);
  assert.match(script, /getAttribute\('aria-hidden'\) === 'true'/);
  assert.match(script, /style\.display !== 'none' && style\.visibility !== 'hidden'/);
});

test('retention outcome has a bounded editorial hierarchy instead of a full-width slab', () => {
  const script = read('assets/js/promo-campaign.js');
  const css = read('assets/css/promo-campaign.css');
  assert.match(script, /title:'Итог уже готов'/u);
  assert.doesNotMatch(script, /Вернёмся к предварительному итогу/u);
  assert.match(script, /promo-campaign--owner-preview/u);
  assert.match(
    css,
    /\.promo-campaign--retention h2\s*\{[\s\S]*?font-size:\s*clamp\(32px,\s*3\.2vw,\s*46px\);[\s\S]*?overflow-wrap:\s*anywhere;/u,
  );
  assert.match(
    css,
    /\.promo-campaign__rescue-outcome \.promo-campaign__actions\s*\{[\s\S]*?width:\s*min\(100%,\s*360px\);/u,
  );
  assert.match(
    css,
    /\.promo-campaign__rescue-outcome \.promo-campaign__primary\s*\{[\s\S]*?background:\s*var\(--promo-wax\);/u,
  );
  assert.match(
    css,
    /\.promo-campaign__rescue-outcome \.promo-campaign__secondary\s*\{[\s\S]*?color:\s*var\(--promo-muted\);/u,
  );
});

test('retention outcome preserves contrast in dark hover and forced-colors modes', () => {
  const css = read('assets/css/promo-campaign.css');
  assert.match(
    css,
    /:root\[data-theme="dark"\] \.promo-campaign__rescue-outcome \.promo-campaign__primary:hover:not\(:disabled\)\s*\{\s*color:\s*#171714;/u,
  );
  assert.match(
    css,
    /@media \(forced-colors:\s*active\)[\s\S]*?\.promo-campaign__rescue-outcome \.promo-campaign__primary:hover:not\(:disabled\)[\s\S]*?border-color:\s*CanvasText;[\s\S]*?background:\s*Canvas;[\s\S]*?color:\s*CanvasText;/u,
  );
  assert.match(
    css,
    /@media \(forced-colors:\s*active\)[\s\S]*?\.promo-campaign__rescue-outcome \.promo-campaign__secondary,[\s\S]*?background:\s*Canvas;[\s\S]*?color:\s*CanvasText;/u,
  );
});

test('retention asks a finite reason, keeps return neutral and never networks during unload', () => {
  const script = read('assets/js/promo-campaign.js');
  const configurator = read('configurator.html');
  assert.match(configurator, /window\.SalonPromoCampaignBridge\s*=\s*\{/);
  assert.match(configurator, /checkpoint:function/);
  assert.match(configurator, /submission:function/);
  assert.match(script, /pagehide/);
  assert.match(script, /\/promo\/retention/);
  assert.match(script, /\.tx-close,\s*\.tx-mobile-back,\s*\.wizard-close/);
  assert.match(script, /previewOnly \? 'Закрыть предпросмотр' : 'Сохранить и выйти'/u);
  assert.match(script, /Что мешает закончить заявку\?/u);
  assert.match(script, /Цена выше ожиданий/u);
  assert.match(script, /Не хватает материалов/u);
  assert.match(script, /Не понимаю состав/u);
  assert.match(script, /Нужно согласовать срок/u);
  assert.match(script, /Черновик на месте/u);
  assert.doesNotMatch(script, /Для сохранённой заявки доступны 10%/u);
  assert.doesNotMatch(script, /beforeunload|sendBeacon|mouseleave|mouseout/);
  const pagehide = script.slice(script.indexOf('function onPageHide'), script.indexOf('function postRetention'));
  assert.doesNotMatch(pagehide, /fetch\(|\.post\(|\.get\(/);
  assert.match(pagehide, /mode\.previewOnly/);
  assert.match(pagehide, /canPresent\(resolvedEligibility, resolvedFootprint\)/);
});

test('owner preview can inspect reason branches without storage, navigation or promo claim', () => {
  const script = read('assets/js/promo-campaign.js');
  const dialog = script.slice(
    script.indexOf('function retentionDialog'),
    script.indexOf('function onExplicitExit'),
  );
  assert.match(dialog, /if \(previewOnly\)[\s\S]{0,180}showReasons/u);
  assert.match(dialog, /if \(!previewOnly\)[\s\S]{0,220}storageWrite/u);
  assert.match(dialog, /decision\.requestRetention/u);
  assert.match(dialog, /claimRetention/u);
  assert.match(dialog, /bridge\.rescue/u);
  assert.match(dialog, /sheet\.scrollTop = 0/u);
  assert.doesNotMatch(dialog, /previewOnly \? 'Вернуться к причинам' : decision\.action/u);
  assert.match(dialog, /decision\.action \+ '<\/button>'/u);
});

test('owner analytics exclusion is separate from campaign footprint and entitlement state', () => {
  const script = read('assets/js/promo-campaign.js');
  const marker = script.slice(
    script.indexOf('function markOwnerAnalyticsExclusion'),
    script.indexOf('function endpoint'),
  );
  assert.match(marker, /salon_analytics_owner_device_v1/);
  assert.match(marker, /CustomEvent\('salon:analytics-exclusion'/);
  assert.doesNotMatch(marker, /WELCOME_SEEN|RETENTION_LEFT|promo|claim|entitlement/i);
});

test('promo dialog history sentinel preserves the configurator step and consumes Back first', () => {
  assert.deepEqual(
    campaign.dialogHistoryState({ conceptStep: 2, safe: 'kept' }, 'qa-token'),
    { conceptStep: 2, safe: 'kept', salonPromoDialog: 'qa-token' },
  );
  const script = read('assets/js/promo-campaign.js');
  const historyBlock = script.slice(
    script.indexOf('function clearDialogHistory'),
    script.indexOf('function wireDialog'),
  );
  assert.match(historyBlock, /history\.pushState\(sentinel/u);
  assert.match(historyBlock, /addEventListener\('popstate', layer\.__popHandler, true\)/u);
  assert.match(historyBlock, /event\.stopImmediatePropagation\(\)/u);
  assert.match(historyBlock, /onDismiss\('history'\)/u);
  assert.match(historyBlock, /win\.history\.back\(\)/u);
  assert.match(
    read('assets/css/promo-campaign.css'),
    /\.promo-campaign__reasons span \{ transition: none; \}/u,
  );
  assert.match(
    read('assets/css/promo-campaign.css'),
    /\.promo-campaign__reasons label:hover span \{ transform: none; \}/u,
  );
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
