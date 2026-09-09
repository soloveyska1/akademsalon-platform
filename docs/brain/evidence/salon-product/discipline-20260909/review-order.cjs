const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const R='/Users/saymurrbk.ru/.codex/worktrees/salon-direct-orders/';
const src=fs.readFileSync(R+'assets/js/salon-order.js','utf8'),app=fs.readFileSync(R+'assets/js/app.js','utf8'),commerce=fs.readFileSync(R+'assets/js/salon-commerce.js','utf8'),html=fs.readFileSync(R+'configurator.html','utf8');
let results=[];
function run(q,saved){const writes=[],els={};for(const id of ['product','scope','discipline','deadline','promo','gift','volume','direct-order']){const m=html.match(new RegExp('<select[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)</select>'));const opts=m?[...m[1].matchAll(/<option[^>]*value="([^"]*)"/g)].map(m=>({value:m[1]})):[];els[id]={value:opts[0]?.value||'',options:opts,append(o){this.options.push(o)}}}
const savedMap={'salon_composition_v1':JSON.stringify(saved||null),'salon_direct_selection_v1':JSON.stringify(saved||null)};
const storage={getItem:k=>savedMap[k]||null,setItem:(k,v)=>writes.push([k,v]),removeItem:k=>writes.push(['remove',k])};
const ctx={URLSearchParams,location:{search:q},sessionStorage:storage,document:{createElement:()=>({}),getElementById:id=>els[id],querySelector:()=>null,body:{classList:{contains:()=>true}}},matchMedia:()=>({addEventListener(){}}),Option:function(t,v){this.value=v;this.text=t},console};ctx.window=ctx;ctx.Salon={store:{get:()=>null}};ctx.SalonProducts={};vm.createContext(ctx);
vm.runInContext(app.slice(app.indexOf('var SalonCalc ='),app.indexOf('window.SalonCalc = SalonCalc;')+30),ctx);
const a=app.indexOf('window.SalonServices = ['),b=app.indexOf('\n  ];',a)+6;vm.runInContext(app.slice(a,b),ctx);vm.runInContext(commerce,ctx);
vm.runInContext(src.slice(0,src.indexOf('const today=new Date();'))+'window.OUT={product:$("product").value,scope:$("scope").value,composition,discipline:$("discipline").value,service:initialService?.id,promo:$("promo").value,gift:$("gift").value};})();',ctx);
return {out:JSON.parse(JSON.stringify(ctx.OUT)),writes,M:ctx.SalonCommerce,C:ctx.SalonCalc,services:ctx.SalonServices}}
function check(name,q,predicate,saved){const r=run(q,saved);assert(predicate(r),name+' '+JSON.stringify(r.out));results.push({case:name,pass:true,state:r.out});return r}
check('whole + express24','?work=diplom&result=whole&speed=express24',r=>r.out.product==='diplom'&&r.out.scope==='whole'&&r.out.composition.speed==='express24'&&r.M.quote(r.out.composition,40000).total===80000);
check('part explicit','?work=practice&result=part&speed=express24',r=>r.out.scope==='part'&&r.M.quote(r.out.composition,null).total===null);
check('editing explicit','?work=practice&result=editing&speed=express24',r=>r.out.scope==='editing'&&r.M.quote(r.out.composition,8000).total===16000);
check('fast unresolved','?work=course&result=whole&speed=expressfast',r=>r.out.composition.speed==='expressfast'&&r.M.quote(r.out.composition,14000).total===null);
check('candidate refuses speed','?work=kandidat&speed=express24',r=>r.out.composition.speed==='standard');
check('invalid enum ignored','?work=course&result=%3Cscript%3E&speed=-100',r=>r.out.scope==='whole'&&r.out.composition.speed==='standard');
check('service precedence','?service=nm&work=practice&result=editing&speed=express24',r=>r.out.product==='service:norm'&&r.out.service==='norm'&&r.out.composition.speed==='standard');
check('scope without product cannot reset draft','?result=part&speed=express24',r=>r.out.product==='master'&&r.out.scope==='editing'&&r.out.composition.speed==='standard',{product:'master',scope:'editing',speed:'standard'});
check('explicit resets unrelated extras','?work=course&result=whole',r=>r.out.product==='course'&&r.out.composition.addons.length===0&&r.out.composition.package==='standard'&&r.out.composition.speed==='standard',{product:'master',scope:'editing',speed:'express24',addons:['norm'],package:'vip'});
check('diagnostic unchanged','?work=practice&result=diagnostic',r=>r.out.product==='practice'&&r.out.scope==='diagnostic');
check('legacy type and speed','?t=dp&result=part&speed=express24',r=>r.out.product==='diplom'&&r.out.scope==='part'&&r.out.composition.speed==='express24');
check('no contact or arbitrary financial hydration','?work=course&name=SECRET&contact=SECRET&price=1&paid=1&bonus=9999&gift=%3Cimg%3E',r=>r.writes.length===0&&r.out.gift===''&&!JSON.stringify(r.out).includes('SECRET'));

for(const [product,disc,base] of [['course','hum',14000],['course','pedagogy',14000],['course','jurisprudence',14000],['course','psychology',17000],['course','tech',18000],['diplom','hum',40000],['diplom','jurisprudence',40000],['diplom','psychology',48500]]){
for(const scope of ['whole','part','editing'])check(product+' '+disc+' '+scope,'?product='+product+'&disc='+disc+'&result='+scope+'&speed=express24',r=>r.out.product===product&&r.out.discipline===disc&&r.out.scope===scope&&r.out.composition.speed==='express24'&&r.C.quote(product,disc,'free','vip').low===base);
}
check('pv protected service amount and code','?service=pv',r=>r.out.product==='service:psychologyvip'&&r.out.service==='psychologyvip'&&r.services.find(s=>s.id==='psychologyvip').from===91000&&r.services.find(s=>s.id==='psychologyvip').fixed===true);
check('psychology diagnosis3500','?product=diplom&disc=psychology&result=diagnostic',r=>r.out.discipline==='psychology'&&r.out.scope==='diagnostic'&&r.C.quote('diplom',r.out.discipline,'free','base').low===3500);
check('psychology editing29000','?product=diplom&disc=psychology&result=editing',r=>r.out.discipline==='psychology'&&r.out.scope==='editing'&&r.C.quote('diplom',r.out.discipline,'free','turn').low===29000);
fs.writeFileSync('/tmp/salon-discipline-order-contract.json',JSON.stringify({passed:results.length,tests:results,scope:'Exact source initialization + unmodified commerce functions; no DOM rendering or submission'},null,2));console.log(JSON.stringify({passed:results.length}));
