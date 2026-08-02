const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const cabinet = fs.readFileSync(path.join(root, 'assets/js/cabinet.js'), 'utf8');
const accountCss = fs.readFileSync(path.join(root, 'assets/css/polish15-account.css'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');

test('full case history stays collapsed until the client asks for it', () => {
  assert.match(cabinet, /function stageFold\(o\)[\s\S]*?var open = false;/);
  assert.match(cabinet, /fold\('secStages', 'Ход дела', meta, stageRows\(o\), open\)/);
});

test('case help is a compact utility row with both contact paths intact', () => {
  assert.match(cabinet, /class="case-support case-support--compact"/);
  assert.match(cabinet, /data-chat-focus/);
  assert.match(cabinet, /data-tab="help"/);
  assert.doesNotMatch(cabinet, /class="fs-sec case-sec case-support"/);
});

test('desktop case uses one internal workspace scroll', () => {
  assert.match(cabinet, /data-account-case="' \+ \(caseVisible\(\) \? 'true' : 'false'\)/);
  assert.match(accountCss, /\.account-main\[data-account-case="true"\][\s\S]*?overflow:\s*hidden;/);
  assert.match(accountCss, /grid-template-rows:\s*auto auto auto minmax\(0, 1fr\) auto/);
  assert.match(accountCss, /\.case-body\s*\{[\s\S]*?overflow:\s*hidden auto;/);
  assert.match(accountCss, /\.case-body \.message-list\s*\{[\s\S]*?max-height:\s*none;[\s\S]*?overflow:\s*visible;/);
});

test('mobile case returns to one natural document flow', () => {
  assert.match(accountCss, /@media \(max-width: 920px\)[\s\S]*?\.account-main\[data-account-case="true"\][\s\S]*?overflow:\s*visible;/);
  assert.match(accountCss, /@media \(max-width: 920px\)[\s\S]*?\.case-body\s*\{[\s\S]*?overflow:\s*visible;/);
  assert.match(accountCss, /\.case-overview__facts > span:nth-child\(3\)[\s\S]*?display:\s*none;/);
});

test('mobile case keeps its active section visible and compresses the dossier title', () => {
  assert.match(cabinet, /var caseNav = root\.querySelector\('\.account-case-production \.case-secnav'\)/);
  assert.match(cabinet, /caseNav\.scrollLeft \+= cr\.left - nr\.left - \(nr\.width - cr\.width\) \/ 2/);
  assert.match(accountCss, /MOBILE CASE ORIENTATION[\s\S]*?\.case-file__title\s*\{[\s\S]*?grid-template-columns:\s*auto minmax\(0, 1fr\)/);
  assert.match(accountCss, /MOBILE CASE ORIENTATION[\s\S]*?\.case-secnav\s*\{[\s\S]*?scroll-padding-inline:\s*12px/);
});

test('mobile horizontal routes reveal hidden destinations without a permanent overlay', () => {
  assert.match(cabinet, /function bindOverflowCue\(nav\)/);
  assert.match(cabinet, /cueHost\.classList\.toggle\('has-more-right', hiddenRight > 6\)/);
  assert.match(accountCss, /\.has-more-right::after\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?pointer-events:\s*none;/);
});

test('terms use a desktop dossier spread and collapse to one mobile column', () => {
  assert.match(cabinet, /class="case-terms-layout"/);
  assert.match(cabinet, /class="case-terms-layout__main"/);
  assert.match(cabinet, /class="case-terms-layout__aside"/);
  assert.match(accountCss, /\.case-terms-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1\.45fr\) minmax\(250px, \.55fr\)/);
  assert.match(accountCss, /@media \(max-width: 920px\)[\s\S]*?\.case-terms-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test('documents form a compact card index with one toolbar', () => {
  assert.match(cabinet, /class="case-files__tools"/);
  assert.match(cabinet, /aria-hidden="true">↗/);
  assert.match(accountCss, /data-case-section="files"\] \.case-files\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2/);
});

test('desktop conversation pins the composer and owns a single message scroll', () => {
  assert.match(cabinet, /data-case-section="' \+ esc\(caseSecOf\(o\)\)/);
  assert.match(accountCss, /data-case-section="chat"\]\s*\{[\s\S]*?overflow:\s*hidden;/);
  assert.match(accountCss, /data-case-section="chat"\] #secChat\s*\{[\s\S]*?grid-template-rows:\s*auto minmax\(0, 1fr\) auto/);
  assert.match(accountCss, /data-case-section="chat"\] \.message-list\s*\{[\s\S]*?overflow:\s*hidden auto;/);
});

test('payment separates the current action from the payment journal', () => {
  assert.match(cabinet, /function payWorkspace\(main, history, state\)/);
  assert.match(cabinet, /class="case-pay__main"/);
  assert.match(cabinet, /class="case-pay__history"/);
  assert.match(cabinet, /class="case-pay__workspace case-pay__workspace--/);
  assert.match(accountCss, /\.case-pay__workspace\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1\.35fr\) minmax\(250px, \.65fr\)/);
});

test('payment keeps no more than three equal method buttons and demotes help to a link', () => {
  const payStart = cabinet.indexOf('function payBlock(o)');
  const payEnd = cabinet.indexOf("/* part='decide'", payStart);
  const paySource = cabinet.slice(payStart, payEnd);
  assert.match(paySource, /class="case-pay__help"/);
  assert.match(paySource, /class="line-link" data-chat-focus/);
  assert.doesNotMatch(paySource, /class="btn btn-line" data-chat-focus/);
});

test('settled payment state says clearly that no payment is due', () => {
  assert.match(cabinet, /case-pay--settled/);
  assert.match(cabinet, /к оплате сейчас: 0 ₽/);
  assert.match(cabinet, /Текущий этап оплачен/);
  assert.match(accountCss, /\.case-pay__settled\s*\{/);
});

test('case comfort assets are cache-busted', () => {
  assert.match(dashboard, /ui=comfort97/);
  assert.match(dashboard, /ui=telegram-primary-hall97/);
});

test('browser history restores both the case URL and its orders workspace', () => {
  assert.match(cabinet, /function caseHistoryState\(\)/);
  assert.match(cabinet, /var originTab = history\.state && history\.state\.accountTab/);
  assert.match(cabinet, /history\.pushState\(caseHistoryState\(\), '', caseHash\(\)\)/);
  assert.match(cabinet, /window\.addEventListener\('popstate',[\s\S]*?applyHash\(location\.hash, true\)/);
});

test('case tabs implement roving keyboard navigation', () => {
  assert.match(cabinet, /\['ArrowLeft', 'ArrowRight', 'Home', 'End'\]/);
  assert.match(cabinet, /root\.querySelectorAll\('\.case-secnav \[data-case-sec\]\[role="tab"\]'\)/);
  assert.match(cabinet, /setCaseSec\(caseTabs\[nextIndex\]\.getAttribute\('data-case-sec'\)\)/);
});

test('case return label reflects the route it was opened from', () => {
  assert.match(cabinet, /function caseBackLabel\(\)/);
  assert.match(cabinet, /st\.tab === 'messages'\) return 'К сообщениям'/);
  assert.match(cabinet, /st\.tab === 'documents'\) return 'К документам'/);
  assert.match(cabinet, /button\[data-ord="' \+ returnId \+ '"\], \[data-now-open="' \+ returnId \+ '"\]/);
});
