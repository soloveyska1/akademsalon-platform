const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const file=process.argv[2]||require('path').resolve(__dirname,'../assets/js/salon-support.js');
const source=fs.readFileSync(file,'utf8');
function env(){
 const map={};function n(value=''){return {value,hidden:false,textContent:'',disabled:false,addEventListener(k,f){this[k]=f},setCustomValidity(){},reportValidity(){return true},toggleAttribute(){},focus(){},select(){},scrollIntoView(){},querySelector(){return null}};}
 const submit=n(),recovery=n(),status=n(),message=n('Синтетический вопрос для изолированной проверки'),contact=n('fixture@example.test'),success=n(),copy=n();
 const form=n();form.elements={name:n(''),website:n('')};form.querySelector=s=>s==='[type=submit]'?submit:s==='.sp-recovery'?recovery:null;success.querySelector=()=>n();
 const main={querySelector:s=>map[s]||null,querySelectorAll:()=>[]};Object.assign(map,{'#sp-question-form':form,'#sp-message':message,'#sp-contact':contact,'#sp-form-status':status,'#sp-message-count':n(),'[data-copy-question]':copy,'#sp-success':success,'#sp-success-copy':n()});
 let calls=[],resolve,reject,timer,clipboardCalls=0;
 const context={document:{querySelector:()=>main},window:{Salon:{valid:{contact:()=>true},api:{post:(url,body)=>{calls.push({url,body});return new Promise((yes,no)=>{resolve=yes;reject=no})}}}},Intl,Number,setTimeout:fn=>(timer=fn,1),clearTimeout(){},navigator:{clipboard:{writeText:async()=>{clipboardCalls++}}}};
 vm.runInNewContext(source,context,{filename:file});
 return {submit,recovery,status,form,message,contact,success,copy,calls,resolve:r=>resolve(r),reject:()=>reject(Error('transport')),timeout:()=>timer(),clipboardCalls:()=>clipboardCalls,start:()=>form.submit({preventDefault(){}})};
}
const outcomes=[];
async function test(name,fn){await fn();outcomes.push({name,pass:true});}
(async()=>{
 for(const response of [{ok:false,error:'bad_json'},{ok:false,error:'server_error'},{ok:false,error:'network'},null,{ok:true,id:true},{ok:true,id:'12'},{ok:true,id:0},{ok:true,id:-1},{ok:true}])await test('uncertain:'+JSON.stringify(response),async()=>{const t=env(),p=t.start();t.resolve(response);await p;assert(t.submit.disabled);assert(!t.recovery.hidden);assert(!t.form.hidden);await t.start();assert.equal(t.calls.length,1);});
 await test('promise rejection blocks duplicate',async()=>{const t=env(),p=t.start();t.reject();await p;assert(t.submit.disabled);await t.start();assert.equal(t.calls.length,1);});
 await test('timeout blocks while request pending; late success wins',async()=>{const t=env(),p=t.start();t.timeout();assert(t.submit.disabled);assert(!t.recovery.hidden);await t.start();assert.equal(t.calls.length,1);t.resolve({ok:true,id:41});await p;assert(t.form.hidden);assert(!t.success.hidden);await t.start();assert.equal(t.calls.length,1);});
 await test('timeout then explicit rejection unlocks retry',async()=>{const t=env(),p=t.start();t.timeout();t.resolve({ok:false,error:'rate_limit'});await p;assert(!t.submit.disabled);assert(t.recovery.hidden);assert(!t.form.hidden);});
 await test('known rejection unlocks; retains content; no automatic retry',async()=>{const t=env(),p=t.start();t.resolve({ok:false,error:'contact_required'});await p;assert(!t.submit.disabled);assert.equal(t.calls.length,1);assert(t.message.value.includes('Синтетический'));assert.equal(t.contact.value,'fixture@example.test');});
 await test('confirmed success one explicit POST only; privacy payload',async()=>{const t=env(),p=t.start();t.resolve({ok:true,id:42});await p;assert(t.form.hidden);await t.start();assert.equal(t.calls.length,1);assert.equal(t.calls[0].url,'/lead');assert.equal(t.calls[0].body.privacy_notice_ack,true);});
 await test('copy survives DOM currentTarget clearing after dispatch',async()=>{const t=env(),event={currentTarget:t.copy};const pending=t.copy.click(event);event.currentTarget=null;await pending;assert.equal(t.clipboardCalls(),1);assert.equal(t.copy.textContent,'Вопрос скопирован');});
 const report={source:file,sha256:crypto.createHash('sha256').update(source).digest('hex'),networkCalls:0,productionMutations:0,cases:outcomes,total:outcomes.length,pass:true};fs.writeFileSync('/tmp/salon-support-contract-review.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
