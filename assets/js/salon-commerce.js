(function(root){
'use strict';
const KEY='salon_composition_v1';
const addons=[
 {id:'defense',service:'defense',type:'svc_defense',label:'Презентация и речь',price:6000,detail:'Слайды, тезисы выступления и репетиция вопросов по готовой работе.'},
 {id:'norm',service:'norm',type:'svc_norm',label:'Требования нормоконтроля',price:5000,detail:'Дополнительные замечания нормоконтролёра. Оформление по вашей методичке уже входит в работу.'},
 {id:'tutor',service:'tutor',type:'svc_tutor',label:'Разобраться в работе',price:3000,detail:'Час индивидуального разбора: логика, метод, расчёты и ответы на ваши вопросы.'}
];
const products=['essay','referat','self','course','practice','chapter','diplom','master','rinc','kandidat','editing','custom'];
function normalize(raw){raw=raw||{};const product=products.includes(raw.product)?raw.product:'course';return {version:1,product,...(raw.part==='intro'&&product==='custom'&&raw.scope==='part'?{part:'intro'}:{}),speed:product==='kandidat'?'standard':['standard','express24','expressfast'].includes(raw.speed)?raw.speed:'standard',package:raw.package==='vip'?'vip':'standard',addons:[...new Set(Array.isArray(raw.addons)?raw.addons.filter(id=>addons.some(a=>a.id===id)):[])],scope:['whole','part','editing'].includes(raw.scope)?raw.scope:product==='chapter'?'part':product==='editing'?'editing':'whole'}}
function lines(raw){const s=normalize(raw);if(s.package==='vip')return [];const ids=s.addons;let list=[];
 if(ids.includes('norm')&&ids.includes('defense'))list.push({id:'defensepack',service:'defensepack',type:'svc_defense_pack',label:'К защите: презентация, речь и нормоконтроль',price:9500,saving:1500,detail:'Две выбранные услуги объединены в действующий пакет.'});
 else addons.filter(a=>ids.includes(a.id)&&a.id!=='tutor').forEach(a=>list.push({...a,saving:0}));
 if(ids.includes('tutor'))list.push({...addons.find(a=>a.id==='tutor'),saving:0});return list;
}
function quote(raw,base){const s=normalize(raw),extra=lines(s),sum=extra.reduce((n,l)=>n+l.price,0),known=Number.isFinite(base)&&base>0;const factor=s.speed==='express24'?2:1;const work=known&&s.speed!=='expressfast'?Math.round(base*factor):null;return {work,extras:sum,total:work!==null&&s.package!=='vip'?work+sum:null,lowerBound:work!==null?work+sum:sum,needsQuote:s.package==='vip'||!known||s.speed==='expressfast',factor,lines:extra,saving:extra.reduce((n,l)=>n+(l.saving||0),0)}}
function read(){try{return normalize(JSON.parse(root.sessionStorage.getItem(KEY)||'null'))}catch(e){return normalize()}}
function saved(){try{return !!root.sessionStorage.getItem(KEY)}catch(e){return false}}
function save(raw){const s=normalize(raw);try{root.sessionStorage.setItem(KEY,JSON.stringify(s))}catch(e){}return s}
function clear(){try{root.sessionStorage.removeItem(KEY)}catch(e){}}
function summary(raw){const s=normalize(raw);return [s.part==='intro'?'Нужная часть: введение или заключение.':'',s.speed==='express24'?'Экспресс: запрос выполнения за 24 часа, ориентир ×2 к плановой цене.':s.speed==='expressfast'?'Экспресс: нужно быстрее 24 часов, цена и точный срок по согласованию.':'Плановый срок.',s.package==='vip'?'VIP: сопровождение от согласования темы и плана до подготовки к защите; презентация, речь, дополнительные требования нормоконтроля и индивидуальный разбор включаются в единую согласуемую смету. Количество итераций, границы, этапы и срок поддержки фиксируются до оплаты.':'Базовое оформление по предоставленной методичке включено.',...lines(s).map(l=>l.label+': ориентир от '+l.price+' ₽.'),'Экспресс-срок начинается после согласования задания, полного комплекта материалов и условий оплаты. Точная сумма и состав подтверждаются до оплаты.'].filter(Boolean).join('\n')}
const API={KEY,addons,products,normalize,lines,quote,read,saved,save,clear,summary};root.SalonCommerce=API;if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
