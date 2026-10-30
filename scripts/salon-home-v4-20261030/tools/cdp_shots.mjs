// Скриншоты страницы через DevTools-протокол: честная эмуляция телефона (ширина окна headless не ограничивает)
// node cdp_shots.mjs <outDir> <url> <profileDir>
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const [, , outDir, url, prof] = process.argv;
const port = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(CH, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  '--force-prefers-reduced-motion', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, 'about:blank',
], { stdio: 'ignore' });

let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl;
  } catch (e) {}
  if (!wsUrl) await sleep(250);
}
if (!wsUrl) { proc.kill(); throw new Error('no devtools endpoint'); }

const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise((res) => {
  const id = ++seq;
  pending.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
});
const js = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

async function shoot(name, w, h, dpr, mobile, selector, offset) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile });
  await send('Page.navigate', { url });
  await sleep(4000);
  await js('document.fonts.ready.then(() => true)');
  const y = selector
    ? await js(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); return Math.max(0, Math.round(e.getBoundingClientRect().top + scrollY - ${offset})); })()`)
    : 0;
  await js(`document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, ${y}); true`);
  await sleep(900);
  await js('document.getAnimations().forEach((a) => { try { a.finish(); } catch (e) {} }); true');
  await sleep(300);
  const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
  writeFileSync(`${outDir}/${name}.jpg`, Buffer.from(r.result.data, 'base64'));
  const docW = await js('document.documentElement.scrollWidth');
  console.log(name, 'y=' + y, 'docW=' + docW);
}

await send('Page.enable');
await send('Runtime.enable');
await shoot('mob-1-hero', 390, 844, 3, true, null, 0);
await shoot('mob-2-calc', 390, 844, 3, true, '#calc-form', 84);
await shoot('mob-3-calc-result', 390, 844, 3, true, '.calc-result', 470);
await shoot('mob-4-voices', 390, 844, 3, true, '.hv-voices', 84);
await shoot('mob-5-final', 390, 844, 3, true, '.hv-final', 84);
ws.close();
proc.kill();
