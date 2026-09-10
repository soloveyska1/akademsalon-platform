/* Minimal shared-consent bootstrap for the standalone store. No chrome,
   vendor script, link tracking, auth bootstrap or order collector is loaded.
   The unchanged analytics-v2.js installs the existing signed global revoke. */
(() => {
  'use strict';
  const Salon=window.Salon ||= {};
  if(Salon.consent)return;
  Salon.store={get(k,f){try{const v=localStorage.getItem(k);return v===null?f:JSON.parse(v);}catch{return f;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch{return false;}},del(k){try{localStorage.removeItem(k);}catch{}}};
  const KEY='salon_consent',VERSION=3,TTL=365*86400000;
  function purge(){Salon.store.del('salon_vid');Salon.store.del('salon_attr_v2');try{Object.keys(localStorage).filter(k=>/^_ym/i.test(k)).forEach(k=>localStorage.removeItem(k));document.cookie.split(';').forEach(part=>{const k=part.split('=')[0].trim();if(/^_ym/i.test(k)){document.cookie=k+'=; Max-Age=0; path=/; SameSite=Lax';document.cookie=k+'=; Max-Age=0; path=/; domain=.'+location.hostname+'; SameSite=Lax';}});}catch{}}
  function read(){const c=Salon.store.get(KEY,null);if(!c||c.v!==VERSION||typeof c.analytics!=='boolean'||!c.at||!Number.isFinite(Date.parse(c.expiresAt))||Date.parse(c.expiresAt)<=Date.now()){if(c){Salon.store.del(KEY);purge();}return null;}return c;}
  function emit(c){document.dispatchEvent(new CustomEvent('salon:consent',{detail:c}));}
  function save(analytics,source){const now=new Date(),c={v:VERSION,document:'analytics-consent-2.2',necessary:true,analytics:analytics===true,action:analytics===true?'allow':'reject',source:source||'banner',at:now.toISOString(),expiresAt:new Date(+now+TTL).toISOString()};Salon.store.set(KEY,c);if(!c.analytics)purge();emit(c);return c;}
  Salon.consent={key:KEY,version:VERSION,ttl:TTL,read,save,allowed:()=>read()?.analytics===true};
  Salon.analyticsPrivacy={page:()=>'/shop.html',mark:()=>'',event:()=>null};
  window.addEventListener('storage',e=>{if(e.key===KEY)emit(read()||{v:VERSION,necessary:true,analytics:false,action:'reject'});});
})();
/* Store proxies use the existing Salon consent and withdrawal contract. */
(() => {
  'use strict';
  const SESSION='salon_store_metrics_v1', PENDING='salon_store_metrics_delete_v1_';
  const EVENTS=new Set(['shop_opened','preview_opened','product_selected','auth_started','auth_completed','quote_ready','checkout_submitted','payment_redirect']);
  const SKUS=new Set(['none','social-pedagogy','social-work-tech','housing-first','psycholinguistics']);
  const $=id=>document.getElementById(id),sent=new Set();let controller=new AbortController(),revoking=false;
  const consent=window.Salon?.consent;if(!consent)return;
  function qa(){try{return new URLSearchParams(location.search).get('store_qa')==='1'||sessionStorage.getItem('salon_analytics_qa_session_v1')==='1'||sessionStorage.getItem('salon_imp')==='1'||Boolean(localStorage.getItem('salon_analytics_owner_device_v1'));}catch{return true;}}
  function allowed(){return consent.allowed()&&!qa()&&navigator.doNotTrack!=='1'&&navigator.globalPrivacyControl!==true;}
  function stored(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}}
  function pendingKeys(){try{return Object.keys(localStorage).filter(k=>k.startsWith(PENDING));}catch{return [];}}
  function identity(){try{return JSON.parse(sessionStorage.getItem(SESSION)||'null');}catch{return null;}}
  function headers(){const csrf=document.cookie.split('; ').find(x=>x.startsWith('__Host-salon_csrf='))?.split('=').slice(1).join('=')||'';return {'Content-Type':'application/json','X-CSRF-Token':decodeURIComponent(csrf)};}
  async function retryRevoke(){
    const key=pendingKeys()[0],proof=key?stored(key):null;if(!proof||revoking)return;revoking=true;
    try{const r=await fetch('/api/store/events/revoke',{method:'POST',credentials:'same-origin',headers:headers(),body:JSON.stringify(proof),keepalive:true});
      if(r.ok){localStorage.removeItem(key);const current=identity();if(current?.session_id===proof.session_id)sessionStorage.removeItem(SESSION);}}
    catch{}finally{revoking=false;}
    if(key && !stored(key) && pendingKeys().length)void retryRevoke();
  }
  function revoke(){controller.abort();controller=new AbortController();sent.clear();const id=identity();
    if(id){try{localStorage.setItem(PENDING+id.session_id,JSON.stringify(id));}catch{return;}}void retryRevoke();}
  function track(event,sku='none'){
    if(!allowed()||pendingKeys().length||!EVENTS.has(event)||!SKUS.has(sku))return;
    let id=identity();try{if(!id){const proof=Salon.store.get('salon_analytics_delete_v2',null);if(!/^[a-f0-9]{64}$/.test(proof?.deletion_secret||''))return;id={session_id:crypto.randomUUID().replaceAll('-',''),deletion_secret:proof.deletion_secret};sessionStorage.setItem(SESSION,JSON.stringify(id));}}catch{return;}
    const key=event+':'+sku;if(sent.has(key))return;sent.add(key);
    const source=new URLSearchParams(location.search).get('utm_source');
    void fetch('/api/store/events',{method:'POST',credentials:'same-origin',cache:'no-store',keepalive:true,signal:controller.signal,headers:headers(),
      body:JSON.stringify({...id,event,sku,consent:true,source:['kladovaya','telegram'].includes(source)?source:'salon'})}).catch(()=>{});
  }
  window.StoreMetrics={track,retryRevoke};
  $('metrics-choice').hidden=Boolean(consent.read());
  function save(value){consent.save(value,'store');$('metrics-choice').hidden=true;}
  $('metrics-allow').addEventListener('click',()=>save(true));$('metrics-reject').addEventListener('click',()=>save(false));
  $('metrics-settings').addEventListener('click',()=>{$('metrics-choice').hidden=false;$('metrics-choice').scrollIntoView();$('metrics-reject').focus();});
  window.addEventListener('storage',e=>{if(e.key==='salon_consent'&&!allowed())revoke();});
  document.addEventListener('salon:consent',()=>{if(!allowed())revoke();});
  window.addEventListener('salon:analytics-exclusion',revoke);window.addEventListener('online',retryRevoke);
  if(!allowed())revoke();else void retryRevoke();
})();
