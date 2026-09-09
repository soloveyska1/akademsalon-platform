// Read-only independent reviewer reproduction. Run from repository root.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const read=p=>fs.readFileSync(p,'utf8');
const src=read('assets/js/salon-catalogue.js'),order=read('assets/js/salon-order.js'),app=read('assets/js/app.js');
const calc={window:{}};vm.createContext(calc);
vm.runInContext(app.slice(app.indexOf('var SalonCalc ='),app.indexOf('window.SalonCalc = SalonCalc;'))+';this.C=SalonCalc',calc);
const C=calc.C,M=require(process.cwd()+'/assets/js/salon-commerce.js'),P=require(process.cwd()+'/assets/js/salon-products.js');
const fields=Object.fromEntries(['product','scope','discipline','deadline'].map(id=>[id,{value:''}]));
const form={M,P,C,service:null,product:()=>P.get(fields.product.value),$:id=>fields[id],today:new Date()};form.today.setHours(0,0,0,0);vm.createContext(form);
vm.runInContext(order.slice(order.indexOf('function term(){'),order.indexOf('function renderQuestions(){')),form);
vm.runInContext(order.slice(order.indexOf('function baseQuote(){'),order.indexOf('function renderComposition(){')),form);
const cat={C,P,context:{}};vm.createContext(cat);
vm.runInContext(src.slice(src.indexOf('function term(s){'),src.indexOf('function fresh(')),cat);
let n=0;
for(const product of P.products)for(const scope of ['whole','part','editing'])for(const speed of ['standard','express24','expressfast'])for(const discipline of C.disciplines.map(d=>d.id))for(const deadline of ['','2026-09-20','2026-10-05','2027-01-01'])for(const pack of ['standard','vip']){
 for(const [id,value]of Object.entries({product:product.id,scope,discipline,deadline}))fields[id].value=value;
 cat.context={discipline,deadline};form.composition=M.normalize({product:product.id,scope,speed,package:pack,addons:['defense','norm','tutor']});
 assert.equal(M.quote(form.composition,cat.base(form.composition)).total,form.quote().amount,JSON.stringify({product:product.id,scope,speed,discipline,deadline,pack}));n++;
}
console.log(n+' catalogue/form price states PASS');
