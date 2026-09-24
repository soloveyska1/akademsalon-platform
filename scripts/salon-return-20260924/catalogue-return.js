// View state is separate from the saved order. Only enums, card ID and numbers.
const returnAPI=window.SalonReturn;let returnRestoring=false,returnTimer,returnIntent=false,returnAllowed=true;
function returnState(){const shown=cards.filter(c=>!c.hidden);const card=dialog.open&&trigger?.matches('.cat-card')?trigger:shown.find(c=>c.getBoundingClientRect().bottom>150)||shown.at(-1);return {v:1,filter,speed,product:card?.dataset.product||'',top:Math.max(-5000,Math.min(5000,card?.getBoundingClientRect().top||0)),y:Math.min(100000,scrollY),at:Date.now()}}
function returnSave(){if(!returnAPI||returnRestoring||!returnAllowed)return;const view=returnState();try{sessionStorage.setItem(returnAPI.catalogueKey,JSON.stringify(view));const previous=history.state;history.replaceState({...previous,salonCatalogReturn:view},'')}catch(_){}}
function returnRead(){const intent=returnAPI?.catalogueIntent();if(!returnAPI||location.hash)return null;try{const entry=returnAPI.catalogueRead(JSON.stringify(history.state?.salonCatalogReturn));if(entry)return entry;if(!intent)return null;return returnAPI.catalogueRead(sessionStorage.getItem(returnAPI.catalogueKey))}catch(_){return null}}
function returnRestore(view){if(!view)return;returnRestoring=true;filter=view.filter;speed=view.speed;renderCards();Promise.resolve(document.fonts?.ready).then(()=>requestAnimationFrame(()=>{if(!location.hash&&!returnIntent){const card=cards.find(c=>c.dataset.product===view.product&&!c.hidden);window.scrollTo({top:Math.max(0,card?scrollY+card.getBoundingClientRect().top-view.top:view.y),behavior:'instant'})}returnRestoring=false}))}
const initialReturn=returnRead();if(initialReturn){filter=initialReturn.filter;speed=initialReturn.speed;renderCards();returnRestoring=true}
window.addEventListener('pageshow',e=>{if(!e.persisted)returnRestore(initialReturn);else returnRestoring=false});
window.addEventListener('pagehide',()=>{clearTimeout(returnTimer);returnSave()});
window.addEventListener('scroll',()=>{if(returnRestoring||dialog.open)return;clearTimeout(returnTimer);returnTimer=setTimeout(returnSave,180)},{passive:true});
for(const kind of ['wheel','touchmove','keydown'])window.addEventListener(kind,e=>{if(e.isTrusted){returnIntent=true;returnAllowed=true}},{passive:true});
root.addEventListener('click',e=>{if(e.target.closest('[data-cat-filter],[data-catalog-speed],#cat-clear')){returnAllowed=true;queueMicrotask(returnSave)}});
cards.forEach(card=>card.addEventListener('click',()=>{returnAllowed=true;returnSave()}));
window.addEventListener('popstate',()=>{returnIntent=false;returnRestore(returnRead())});
document.addEventListener('salon:return-cleared',()=>{returnAllowed=false;clearTimeout(returnTimer);try{sessionStorage.removeItem(returnAPI.catalogueKey);const next={...history.state};delete next.salonCatalogReturn;history.replaceState(next,'')}catch(_){}});
