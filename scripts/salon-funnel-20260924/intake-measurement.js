// Existing analytics contract only. No field values, names, files or order IDs.
// Consent acquired later starts a new observation; pre-consent input is not replayed.
let measurementOpened=false,measurementInput=false;
const measurementCta=()=>service?'service:'+service.code:'calculator';
function measure(name,cta){
 try{if(!S.consent?.allowed())return false;S.visit?.event?.(name,{cta});return true}catch(_){return false}
}
function measureOpen(){
 if(!measurementOpened)measurementOpened=measure('config_open',measurementCta());
}
function measureValidation(){measureOpen();measure('validation_error',measurementCta())}
function measureInput(e){
 const field=e.target;
 // The enhanced select's search box is not a submitted field.
 if(measurementInput||!field.id||!field.matches('input,select,textarea')||['consent','website'].includes(field.id))return;
 const trusted=e.isTrusted||(e.type==='salon:select-commit'&&field.tagName==='SELECT'&&e.detail?.inputEvent?.isTrusted===true);
 if(!trusted)return;
 // Let the form apply the selected service before reading its finite CTA code.
 queueMicrotask(()=>{if(measurementInput)return;measureOpen();if(measurementOpened)measurementInput=measure('first_input',measurementCta())});
}
form.addEventListener('input',measureInput,true);
form.addEventListener('change',measureInput,true);
form.addEventListener('salon:select-commit',measureInput);
document.addEventListener('salon:consent',e=>{
 if(e.detail?.analytics===true)measureOpen();
 else{measurementOpened=false;measurementInput=false}
});
measureOpen();
