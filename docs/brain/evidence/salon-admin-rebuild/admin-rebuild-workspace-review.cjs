const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const root='/Users/saymurrbk.ru/.codex/worktrees/salon-admin-rebuild/',src=fs.readFileSync(root+'assets/js/salon-admin-workspace.js','utf8'),C=require(root+'assets/js/salon-admin-core.js');
function get(name){const start=src.indexOf('  function '+name+'(');assert(start>=0,name);const next=src.indexOf('\n  function ',start+5),asyncNext=src.indexOf('\n  async function ',start+5);return src.slice(start,Math.min(...[next,asyncNext,src.length].filter(x=>x>=0)));}
const checks=[];const run=(name,fn)=>{try{fn();checks.push({name,ok:true});}catch(e){checks.push({name,ok:false,error:e.message})}};
const ctx={C,E:C.esc,M:C.money,D:C.date,STATUS:C.STATUS,st:{specEdits:{},drafts:{}},field:()=>'',select:()=>'',note:x=>x,check:()=>'',I:()=>'',empty:x=>x,pill:x=>x,btn:(l,a,e)=>'<button data-action="'+a+'" '+(e||'')+'>'+l+'</button>',contextOrder:()=>'',actionForm:(t,b,o)=>ctx.form=o,num:(d,n)=>+d[n],savedOrder:()=>{},history:{},toast:()=>{}};vm.createContext(ctx);
for(const name of ['priceForm','orderMessages','orderMoney','contextOrder'])vm.runInContext(get(name),ctx);
const order={id:71,work_type:'course',work_label:'Синтетическая услуга',client:{id:17,name:'Синтетический клиент'},tg_linked:true,archived:false,archived_admin:true,unread:2,price:6000,stages_total:2,specification_lines:[{line_id:'A',contract_contour:'A',academic_submode:'A1',title:'SYNTHETIC',price:{amount:6000}}]};
run('Bound owner price endpoint',()=>{ctx.priceForm(order);assert.equal(ctx.form.path,'/admin/orders/71/price');});
run('Unbound client creates offer',()=>{ctx.priceForm({...order,client:{guest:true,name:'Синтетический гость'},tg_linked:false});assert.equal(ctx.form.path,'/admin/offers');});
run('Guest email price endpoint',()=>{ctx.priceForm({...order,client:{guest:true,contact:'synthetic@example.invalid'},tg_linked:false});assert.equal(ctx.form.path,'/admin/orders/71/price');});
run('Media boolean produces attachment button',()=>assert(ctx.orderMessages({id:71,messages:[{id:900,from:'client',media:true,kind:'voice',text:''}]}).includes('data-action="media"')));
run('Master messages labeled master',()=>assert(ctx.orderMessages({id:71,messages:[{id:901,from:'master',text:'SYNTHETIC'}]}).includes('Мастерская')));
run('Claimed payments not included in paid sum',()=>{const html=ctx.orderMoney({id:71,price:6000,payments:[{id:9,status:'claimed',amount:3000,kind:'prepay'}],plan:[{state:'claimed',amount:3000}],due_now:null});assert(html.includes('>0 ₽</b>'));assert(html.includes('data-id="9"'));});
run('Owner identity visible in modal',()=>assert(ctx.contextOrder(order).includes('Синтетический клиент')));
run('Price binds identical lines under both specification fields',()=>{ctx.priceForm(order);const p=ctx.form.payload({reviewed:'on',price:'8000',stages:'2',deadline_date:'2026-10-15'});assert.equal(p.specification_lines,p.specification.lines);assert.equal(p.specification_lines[0].price.amount,8000);assert.equal(p.specification_lines[0].deadline.date,'2026-10-15');});
run('Attention excludes admin archived orders',()=>assert.equal(C.attention({...order,status:'new'}),null));
run('Unread orders trigger response',()=>assert.equal(C.attention({...order,archived_admin:false,archived:false,status:'work'}).kind,'message'));
const report={sha256:crypto.createHash('sha256').update(src).digest('hex'),checks};fs.writeFileSync('/tmp/admin-rebuild-workspace-review.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
