/* Synthetic QA only. Prepend before admin.js after app.js; never contacts production. */
(function(){
'use strict';
var now=Math.floor(Date.now()/1000), iso=new Date().toISOString().slice(0,10);
var client={id:91001,name:'Демо-клиент Анна',email:'anna@example.invalid',links:[],guest:false};
var specs=[['work','ВКР по психологии',65000],['new','Курсовая работа',0],['priced','Отчёт по практике',18000],['fix','Доработка главы',12000],['check','Магистерская диссертация',90000],['done','Презентация и речь',6000]];
var orders=specs.map(function(s,i){return {id:9701+i,no:'QA-'+(701+i),work_label:s[1],work_type:'course',discipline:'hum',topic:'Синтетический пример: учебная мотивация и адаптация студентов',status:s[0],price:s[2],quote_low:14000,quote_high:20000,due_total:s[2],paid_sum:i===0?32500:0,prepay:s[2]/2,stages_total:2,claimed:i===2,source:'site',created_at:now-86400*(i+1),updated_at:now-3600,last_message_at:now-3600,deadline_date:iso,deadline_text:'Сегодня, до 20:00',user:client,client:client,name:client.name,user_id:client.id,files:[],parts:[],events:[{at:now-86400,kind:'created',data:'Демонстрационная заявка'}],history:[{at:now-86400,text:'Создано синтетическое дело для проверки интерфейса'}],messages:[{id:1,from:'client',at:now-7200,text:'Добрый день! Прикрепила требования. Подскажите, когда можно посмотреть первую главу?'},{id:2,from:'master',at:now-3600,text:'Первая глава будет в кабинете сегодня. Здесь можно обсудить замечания и следующие этапы.'}],plan:s[2]?[{kind:'prepay',label:'Первый этап',amount:s[2]/2,state:i===0?'paid':i===2?'claimed':'due'},{kind:'final',label:'Остаток',amount:s[2]/2,state:'waiting'}]:[],cart:{},admin_note:'Только синтетический пример. Ничего не отправлять.',paid:i===0};});
orders.forEach(function(o,i){o.stage=1;o.parts_done=0;o.plan.forEach(function(p,n){p.n=n+1;});});
var details=Object.assign({},client,{since:now-86400*30,last_seen:now-3600,paid_sum:32500,orders:orders.slice(0,3),referrals:[],bonus:{balance:1500,expiring:[{amount:500,at:now+86400*7}]},ledger:[{at:now-86400,delta:1500,label:'Демонстрационное начисление',note:'QA'}]});
var by={};orders.forEach(function(o){by[o.status]=(by[o.status]||0)+1});
var overview={ok:true,by_status:by,claimed:1,leads_new:1,reviews_pending:1,qa:{pending:1},month:{revenue:32500,orders:6},total:6,users:2,pay_online:true,mail_on:true,subs_pending:0,slots:3,maintenance:{site:false,bot:false}};
var data={
'/admin/overview':overview,
'/admin/subs':{ok:true,pending:[],active:[]},
'/admin/orders':{ok:true,orders:orders},
'/admin/clients':{ok:true,clients:[Object.assign({},client,{orders:3,balance:1500,last_seen:now-3600}),{id:91002,name:'Демо-клиент Борис',orders:1,balance:0,last_seen:now-7200}]},
'/admin/reviews':{ok:true,reviews:[{id:981,status:'pending',rating:5,text:'Синтетический отзыв для проверки карточки модерации.',author:'Демо-клиент',work_label:'Курсовая работа',order_id:9701,at:now-3600,publication_consent:true}]},
'/admin/leads':{ok:true,leads:[{id:982,name:'Демо-клиент',contact:'demo@example.invalid',message:'Нужно оценить доработку второй главы. Методичка и замечания готовы.',status:'new',at:now-1800}]},
'/admin/qa':{ok:true,items:[{id:983,status:'pending',name:'Демо-гость',question:'Можно ли заказать только отдельную главу?',answer:'',at:now-1800,tags:[]}],tags:{}},
'/admin/gifts':{ok:true,stats:{active_n:1,live_balance:5000},gifts:[{id:984,code:'QA-DEMO-ONLY',amount:5000,balance:5000,status:'active',state:'active',name:'Демо-получатель',recipient_name:'Демо-получатель',created_at:now-86400}]},
'/admin/visits':{ok:true,visits:[{id:985,vid:'qa-visitor-1',at:now-900,last_at:now-300,entry:'/kursovaya-rabota',path:'/services',ua:'Mozilla/5.0 iPhone Mobile Safari',city:'Демо-город',country:'RU',pages:3,source:'direct'}],stats:{total:1,unique:1,today:1,online:1}},
'/admin/broadcast':{ok:true,total:2,count:2,segments:{all:2}},
'/admin/broadcast/status':{ok:true,state:{running:false,sent:0,failed:0}},
'/admin/settings':{ok:true},'/me':{ok:true,user:{id:999999,name:'QA Оператор',is_admin:true}}
};
function normalizeDates(v){if(!v||typeof v!=='object')return;Object.keys(v).forEach(function(k){if(typeof v[k]==='number'&&(/_at$|^at$|^since$|^last_seen$/.test(k)))v[k]=new Date(v[k]*1000).toISOString();else normalizeDates(v[k]);});}
normalizeDates(data);normalizeDates(details);
window.__adminQA={gets:[],posts:[],synthetic:true,orders:orders};
function copy(v){return JSON.parse(JSON.stringify(v));}
function get(path){window.__adminQA.gets.push(path);var p=String(path).split('?')[0];var m=p.match(/^\/admin\/orders\/(\d+)$/);if(m)return Promise.resolve({ok:true,order:copy(orders.filter(function(o){return o.id===+m[1]})[0]||orders[0])});if(/^\/admin\/clients\/\d+$/.test(p))return Promise.resolve({ok:true,client:copy(details)});if(/^\/admin\/gifts\/\d+$/.test(p))return Promise.resolve({ok:true,gift:copy(data['/admin/gifts'].gifts[0]),ledger:[]});return Promise.resolve(copy(data[p]||{ok:true,items:[],orders:[],clients:[]}));}
var api={base:'/api',get:get,post:function(path,payload){window.__adminQA.posts.push({path:path,payload:copy(payload||{})});return Promise.resolve({ok:false,error:'qa_readonly',message:'Синтетическая проверка: действие не выполнялось'});},headers:function(){return{};},token:function(){return'qa-local-only';},user:function(){return{id:999999,name:'QA Оператор',is_admin:true};},ready:Promise.resolve(),setSessionHint:function(){},setToken:function(){},setUser:function(){},logout:function(){return Promise.resolve({ok:true});}};
window.Salon=window.Salon||{};window.Salon.api=api;
})();
