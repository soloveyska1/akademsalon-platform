// Скриншоты по списку из JSON через DevTools-протокол (честная эмуляция телефона).
// node cdp_shots2.mjs <outDir> <profileDir> <shots.json>
// shots.json: [{"name","url","w","h","dpr","mobile","selector"?,"offset"?,"eval"?,"click"?,"theme"?}]
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';

const CH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const [, , outDir, prof, specPath] = process.argv;
const shots = JSON.parse(readFileSync(specPath, 'utf8'));
const port = 9334;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(CH, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  '--force-prefers-reduced-motion', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) {
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch (e) {}
  if (!wsUrl) await sleep(250);
}
if (!wsUrl) { proc.kill(); throw new Error('no devtools endpoint'); }
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0; const pending = new Map();
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const js = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send('Page.enable'); await send('Runtime.enable');
for (const s of shots) {
  await send('Emulation.setDeviceMetricsOverride', { width: s.w, height: s.h, deviceScaleFactor: s.dpr || 2, mobile: !!s.mobile });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: s.theme === 'dark' ? 'dark' : 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Page.navigate', { url: s.url });
  await sleep(s.wait || 4000);
  await js('document.fonts.ready.then(() => true)');
  if (s.theme) await js(`document.documentElement.setAttribute('data-theme', ${JSON.stringify(s.theme)}); true`);
  const y = s.selector ? await js(`(() => { const e = document.querySelector(${JSON.stringify(s.selector)}); return e ? Math.max(0, Math.round(e.getBoundingClientRect().top + scrollY - ${s.offset || 0})) : -1; })()`) : 0;
  await js(`document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, ${Math.max(0, y)}); true`);
  await sleep(700);
  if (s.click) { await js(`(() => { const e = document.querySelector(${JSON.stringify(s.click)}); if (e) e.click(); return !!e; })()`); await sleep(900); }
  if (s.eval) { await js(s.eval); await sleep(600); }
  await js('document.getAnimations().forEach((a) => { try { a.finish(); } catch (e) {} }); true');
  await sleep(300);
  const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 86 });
  writeFileSync(`${outDir}/${s.name}.jpg`, Buffer.from(r.result.data, 'base64'));
  console.log(s.name, 'y=' + y, 'docW=' + await js('document.documentElement.scrollWidth'));
}
ws.close(); proc.kill();
