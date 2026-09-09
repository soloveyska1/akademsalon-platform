const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const path=require('node:path');const R=path.resolve(__dirname,'../../../../..')+'/';
const src=fs.readFileSync(R+'assets/js/salon-order.js','utf8'),app=fs.readFileSync(R+'assets/js/app.js','utf8'),commerce=fs.readFileSync(R+'assets/js/salon-commerce.js','utf8'),html=fs.readFileSync(R+'configurator.html','utf8');
let results=[];
function run(q,saved){const writes=[],els={};for(const id of ['product','scope','discipline','deadline','promo','gift','volume','direct-order']){const m=html.match(new RegExp('<select[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)</select>'));const opts=m?[...m[1].matchAll(/<option[^>]*value="([^"]*)"/g)].map(m=>({value:m[1]})):[];els[id]={value:opts[0]?.value||'',options:opts,append(o){this.options.push(o)}}}
const savedMap={'salon_composition_v1':JSON.stringify(saved||null),'salon_direct_selection_v1':JSON.stringify(saved||null)};
const storage={getItem:k=>savedMap[k]||null,setItem:(k,v)=>writes.push([k,v]),removeItem:k=>writes.push(['remove',k])};
const ctx={URLSearchParams,location:{search:q},sessionStorage:storage,document:{createElement:()=>({}),getElementById:id=>els[id],querySelector:()=>null,body:{classList:{contains:()=>true}}},matchMedia:()=>({addEventListener(){}}),Option:function(t,v){this.value=v;this.text=t},console};ctx.window=ctx;ctx.Salon={store:{get:()=>null}};ctx.SalonProducts={};vm.createContext(ctx);
vm.runInContext(app.slice(app.indexOf('var SalonCalc ='),app.indexOf('window.SalonCalc = SalonCalc;')+30),ctx);
const a=app.indexOf('window.SalonServices = ['),b=app.indexOf('\n  ];',a)+6;vm.runInContext(app.slice(a,b),ctx);vm.runInContext(commerce,ctx);
vm.runInContext(src.slice(0,src.indexOf('const today=new Date();'))+'window.OUT={product:$("product").value,scope:$("scope").value,composition,service:initialService?.id,promo:$("promo").value,gift:$("gift").value};})();',ctx);
return {out:JSON.parse(JSON.stringify(ctx.OUT)),writes,M:ctx.SalonCommerce,services:ctx.SalonServices}}
function check(name,q,predicate,saved){const r=run(q,saved);assert(predicate(r),name+' '+JSON.stringify(r.out));results.push({case:name,pass:true,state:r.out});return r}

check('df maps exact defense6000','?service=df',r=>r.out.product==='service:defense'&&r.out.service==='defense'&&r.services.find(s=>s.id==='defense').from===6000);
for(const product of ['course','practice','diplom'])check(product+' contextual part','?product='+product+'&result=part',r=>r.out.product===product&&r.out.scope==='part'&&r.M.quote(r.out.composition,null).total===null);
fs.writeFileSync(__dirname+'/review-contract-order.json',JSON.stringify({passed:results.length,tests:results},null,2));console.log(results.length);
