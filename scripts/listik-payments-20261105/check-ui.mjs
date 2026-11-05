// Dedicated disposable browser profile; fake checkout only, no production payment.
import { chromium } from '../../../kladovaya-gipsr/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const markup=readFileSync(new URL('../../tmp/listik-payments/kladovaya-oplata.html',import.meta.url),'utf8');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
mkdirSync(new URL('../../tmp/listik-payments/screens',import.meta.url),{recursive:true});
try {
  for(const width of [360,390,768,1024,1440]) {
    const page=await browser.newPage({viewport:{width,height:900}});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    let checkouts=0;
    await page.route('**/kladovaya-oplata.html?**',r=>r.fulfill({status:200,contentType:'text/html',body:markup}));
    await page.route('**/api/kladovaya/pay/quote?**',r=>r.fulfill({json:{ok:true,order:'klistik0020',product:'listik_20',amount:399,title:'ЛистикGPT · 20 ответов',variant:'20 ответов на 30 дней',edition:'listik 1.0',expires_at:1794000000,state:'open'}}));
    await page.route('**/api/kladovaya/pay/checkout',r=>{checkouts++; return r.fulfill({status:503,json:{ok:false,error:'checkout_closed'}});});
    await page.goto('https://akademsalon.ru/kladovaya-oplata.html?o=klistik0020&p=listik_20&a=399&e=1794000000&s=fake',{waitUntil:'domcontentloaded'});
    await page.locator('[data-kp-form]').waitFor({state:'visible'});
    assert.match(await page.locator('[data-kp-title]').innerText(),/399/);
    assert.equal(await page.locator('[data-listik-spec]').isVisible(),true);
    assert.equal(await page.locator('#kpSpecTitle').isVisible(),false);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.locator('[data-kp-pay]').click();
    assert.match(await page.locator('[data-kp-error]').innerText(),/почт/);
    await page.locator('#kpEmail').fill('test@example.invalid');
    await page.locator('[data-kp-accept]').check();
    await page.screenshot({path:new URL(`../../tmp/listik-payments/screens/${width}.png`,import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:true});
    await page.locator('[data-kp-pay]').click();
    await page.locator('[data-kp-title]').filter({hasText:'Оплата временно недоступна'}).waitFor();
    assert.equal(checkouts,1); assert.deepEqual(errors,[]);
    console.log(JSON.stringify({width,overflow:false,errors,checkoutFailureHandled:true}));
    await page.close();
  }
} finally {await browser.close();}
