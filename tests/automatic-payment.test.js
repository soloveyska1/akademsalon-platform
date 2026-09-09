const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('assets/js/cabinet.js','utf8');
function fn(name,next){return source.slice(source.indexOf('  function '+name+'('), source.indexOf('  function '+next+'('));}
function environment(overrides={}){
 const events=[];
 const ctx={events,st:{busy:false,currentId:42,me:{}},
  paymentActionAllowed:()=>true,
  document:{getElementById:()=>({value:'test@example.invalid',focus:()=>events.push('focus')})},
  S:{api:{post:async()=>({ok:true,online:true,url:'https://auth.robokassa.ru/Merchant/Index.aspx'})}},
  orderHeaders:()=>({}),toast:m=>events.push(m),location:{assign:u=>events.push(['navigate',u])},
  ...overrides};vm.createContext(ctx);return ctx;
}
async function tick(){await new Promise(r=>setImmediate(r));}
test('checkout opens exactly once, sends only receipt email, prevents concurrent requests',async()=>{
 const ctx=environment();let resolve;let calls=0;
 ctx.S.api.post=(url,body)=>{calls++;assert.equal(url,'/orders/42/pay');assert.equal(body.email,'test@example.invalid');return new Promise(r=>resolve=r);};
 vm.runInContext(fn('payOnline','tipOnline')+';payOnline();payOnline();',ctx);
 assert.equal(calls,1);assert.equal(ctx.st.busy,true);
 resolve({ok:true,online:true,url:'https://auth.robokassa.ru/Merchant/Index.aspx'});await tick();
 assert.equal(ctx.st.busy,false);assert.equal(ctx.events.filter(x=>Array.isArray(x)&&x[0]==='navigate').length,1);
});
test('failed network releases busy state and permits a safe server-checked retry',async()=>{
 const ctx=environment();let calls=0;ctx.S.api.post=async()=>{calls++;throw Error('offline');};
 vm.runInContext(fn('payOnline','tipOnline')+';payOnline();',ctx);await tick();
 assert.equal(ctx.st.busy,false);assert.match(ctx.events.at(-1),/Связь прервалась/);
 vm.runInContext('payOnline()',ctx);await tick();assert.equal(calls,2);
});
test('unpaid return and server failure never mark an order paid',async()=>{
 const ctx=environment();ctx.S.api.post=async()=>({ok:false,error:'pay_stage'});
 vm.runInContext(fn('payOnline','tipOnline')+';payOnline();',ctx);await tick();
 assert.equal(ctx.st.busy,false);assert.equal(ctx.events.filter(Array.isArray).length,0);
});
test('invalid receipt email focuses the field and does not create an invoice',()=>{
 const ctx=environment({document:{getElementById:()=>({value:'bad',focus:()=>ctx.events.push('focus')})}});
 let called=false;ctx.S.api.post=()=>{called=true;};vm.runInContext(fn('payOnline','tipOnline')+';payOnline();',ctx);
 assert.equal(called,false);assert.equal(ctx.st.busy,false);assert.equal(ctx.events.at(-1),'focus');
});
function render(o,context={payment:'due',due:6000}){
 const ctx=environment({caseContextFor:()=>context,payHistory:()=>'',money:n=>String(n),esc:s=>String(s),paySlip:()=>'<div>TRANSFER_REQUISITES</div>',payWorkspace:x=>x});
 // payBlock's history helper is private; resolve exact dependencies at runtime.
 vm.runInContext(fn('payBlock','actionsBlock')+';result=payBlock('+JSON.stringify(o)+');',ctx);return ctx.result;
}
test('payment presentation preserves manual fallback inside a disclosure',()=>{
 const block=fn('payBlock','actionsBlock');
 assert.match(block,/<details class="case-pay__transfer">/);
 assert.match(block,/Оплата подтвердится автоматически/);
 assert.match(block,/o\.pay_online && o\.requisites/);
 assert.match(block,/!o\.pay_online \? '<button/);
});
