/* The chat collects a brief. The existing configurator owns consent and submit. */
(function(root){'use strict';
const products=['essay','referat','self','course','course_emp','diplom','master','kandidat','practice','chapter','rinc','vak','scopus','editing','custom'];
function clean(value){
 const b=value&&typeof value==='object'&&!Array.isArray(value)?value:{},out={};
 for(const [k,max] of [['topic',500],['volume',100],['notes',5000]])if(typeof b[k]==='string')out[k]=b[k].slice(0,max);
 for(const [k,list] of [['product',products],['scope',['whole','part','editing']],['discipline',['hum','law','tech','med','psychology','pedagogy','jurisprudence']]])if(list.includes(b[k]))out[k]=b[k];
 if(typeof b.deadline==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(b.deadline)){const d=new Date(b.deadline+'T12:00:00Z');if(!isNaN(d)&&d.toISOString().slice(0,10)===b.deadline)out.deadline=b.deadline;}
 return out;
}
function validEvent(e,source,origin,type){return e.source===source&&e.origin===origin&&e.data?.version===1&&e.data?.type===type;}
function attach(frame,draft,callback){
 const initial=clean(draft);let sent=false;
 function prefill(){if(sent)return;frame.contentWindow?.postMessage({type:'salon:assistant-prefill',version:1,brief:initial},location.origin);}
 const receive=e=>{
  if(!validEvent(e,frame.contentWindow,location.origin,'salon:assistant-order-state'))return;
  const data=e.data,states=['ready','prefilled','editing','sending','uncertain','rejected','confirmed','uploads'];
  if(!states.includes(data.state))return;
  if(data.state==='ready')prefill();
  if(data.state==='prefilled')sent=true;
  const id=Number.isSafeInteger(data.id)&&data.id>0?data.id:null;
  if(['confirmed','uploads'].includes(data.state)&&!id)return;
  callback({state:data.state,id,brief:data.state==='editing'?clean(data.brief):undefined,pending:Number.isInteger(data.pending)&&data.pending>=0&&data.pending<=5?data.pending:0});
 };
 root.addEventListener('message',receive);frame.addEventListener('load',prefill);
 return ()=>{root.removeEventListener('message',receive);frame.removeEventListener('load',prefill);};
}
const api={clean,validEvent,attach};if(typeof module==='object'&&module.exports)module.exports=api;else root.SalonAssistantOrder=api;
})(typeof window==='object'?window:globalThis);
