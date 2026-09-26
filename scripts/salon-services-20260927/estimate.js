(function (root) {
  'use strict';
  // Budget model only. Existing SalonCalc / SalonCommerce tariffs stay authoritative.
  const KEY = 'salon_estimate_options_v1';
  const plans = {
    none: {name:'Без подписки',rate:0,cap:0,month:0,sem:0,days:0,cashback:5},
    plus: {name:'Салон+',rate:5,cap:1000,month:449,sem:999,days:150,cashback:5},
    pro: {name:'Про',rate:10,cap:3000,month:1190,sem:2690,days:150,cashback:10},
    session: {name:'Сессия',rate:7,cap:2000,month:2990,sem:2990,days:60,cashback:5}
  };
  const pieces = [
    {id:'fragment',name:'Введение, заключение или фрагмент',type:'self',tier:'vip',detail:'Один фрагмент до 5 страниц. Ориентир от цены небольшой работы.'},
    {id:'chapter',name:'Отдельная глава',type:'chapter',tier:'vip',detail:'Одна глава исследования. Действующая цена главы.'},
    {id:'analysis',name:'Один блок расчётов или анализа',type:'course',tier:'turn',detail:'Один блок на готовых данных. Бюджет от ставки редакторского этапа курсовой; метод и сложность уточним.'},
    {id:'defense',name:'Презентация и речь',addon:'defense',detail:'По готовой работе. Действующая цена презентации и речи.'},
    {id:'norm',name:'Дополнительный нормоконтроль',addon:'norm',detail:'Дополнительные замечания к готовой работе. Базовое оформление уже включено.'},
    {id:'tutor',name:'Индивидуальный разбор · 1 час',addon:'tutor',detail:'Один час по готовым материалам. Действующая цена разбора.'},
    {id:'other',name:'Другая небольшая задача',type:'self',tier:'vip',detail:'Одна небольшая задача до 5 страниц или одного блока. Большой проект разбивается на отдельные этапы.'}
  ];
  const editTypes=['self','course','practice','chapter','diplom','master','rinc','kandidat'];
  const bound=(n,min,max)=>Math.max(min,Math.min(max,Math.floor(Number(n)||0)));
  const round=n=>Math.round(n/500)*500;
  const money=n=>Math.round(n).toLocaleString('ru-RU')+' ₽';
  const range=(a,b)=>a===b?money(a):Math.round(a).toLocaleString('ru-RU')+'–'+money(b);
  function kind(s){return s.product==='editing'?'editing':s.product==='custom'||s.scope==='part'&&s.product!=='chapter'?'piece':'whole'}
  function options(raw){raw=raw||{};return {piece:pieces.some(p=>p.id===raw.piece)?raw.piece:'fragment',edit:editTypes.includes(raw.edit)?raw.edit:'course',quantity:bound(raw.quantity||1,1,10)}}
  function read(s){try{const data=JSON.parse(root.sessionStorage.getItem(KEY)||'{}');return options(data[s.product+':'+s.scope])}catch(_){return options()}}
  function save(s,value){try{const data=JSON.parse(root.sessionStorage.getItem(KEY)||'{}');data[s.product+':'+s.scope]=options(value);root.sessionStorage.setItem(KEY,JSON.stringify(data))}catch(_){}}
  function term(context,now){if(!/^\d{4}-\d{2}-\d{2}$/.test(context.deadline||''))return 'free';const today=new Date(now===undefined?Date.now():now);today.setHours(0,0,0,0);const days=Math.ceil((new Date(context.deadline+'T00:00:00')-today)/86400000);return days<14?'urgent':days<30?'mid':'free'}
  function estimate(raw,context,opt,dependencies){
    const C=dependencies?.C||root.SalonCalc,M=dependencies?.M||root.SalonCommerce,P=dependencies?.P||root.SalonProducts;
    const s=M.normalize(raw);if(['diagnostic','support'].includes(raw?.scope)){s.scope=raw.scope;s.speed='standard';s.package='standard';s.addons=[]}const o=options(opt),p=P.get(s.product),mode=kind(s);context=context||{};
    const disc=C.disciplines.find(d=>d.id===context.discipline)||C.disciplines[0];
    const tm=s.speed==='standard'?term(context,context.now):'free';
    let base,description,source,unit='работа',selectedPiece=null;
    if(mode==='piece'){
      selectedPiece=pieces.find(x=>x.id===o.piece);description=selectedPiece.detail;unit=selectedPiece.name;
      if(selectedPiece.addon){base=M.addons.find(x=>x.id===selectedPiece.addon).price;source='Действующая цена отдельной услуги';}
      else {base=C.quote(selectedPiece.type,disc.id,tm,s.scope==='diagnostic'?'base':s.scope==='editing'?'turn':selectedPiece.tier).low;source='Ориентир от действующего прайса';if(s.scope==='editing')description='Доработка: '+selectedPiece.name.toLowerCase()+'. Редакторский тариф выбранного вида работы; объём замечаний уточним.';if(s.scope==='diagnostic')description='Письменный разбор: '+selectedPiece.name.toLowerCase()+'. Действующий диагностический тариф выбранного вида работы.';}
    }else{
      const type=mode==='editing'?o.edit:p.type;
      base=C.quote(type,disc.id,tm,s.scope==='diagnostic'?'base':mode==='editing'||s.scope==='editing'?'turn':'vip').low;
      description=s.scope==='diagnostic'?'Письменный разбор требований и материалов с рекомендациями по дальнейшим действиям.':mode==='editing'?'Редакторский этап для выбранного вида работы. Объём замечаний уточним по материалам.':s.scope==='editing'?'Редакторский этап готовой работы по согласованным замечаниям.':p.detail;
      source='Действующий прайс';unit=mode==='editing'?C.types.find(x=>x.id===type).label:p.name;
    }
    const quantity=mode==='piece'?o.quantity:1;
    const factor=s.speed==='standard'?1:2;
    const work=base*quantity*factor,workHigh=round(base*quantity*(s.speed==='expressfast'?3:factor*1.4));
    // Do not charge again for an add-on that is already the main task.
    const filtered=M.normalize({...s,package:'standard',addons:s.addons.filter(id=>id!==selectedPiece?.addon)});
    let lines=M.lines(filtered),coordination=0;
    if(s.package==='vip'){
      const extraIds=M.addons.filter(a=>a.id!==selectedPiece?.addon).map(a=>a.id);
      lines=M.lines({...filtered,addons:extraIds});coordination=Math.max(3000,round(work*.15));
      lines.push({id:'coordination',label:'Координация VIP · бюджет',price:coordination,saving:0,detail:'Резерв на сопровождение: 15% работы, минимум 3 000 ₽. Итерации и срок фиксируются в смете.'});
    }
    // The published defence bundle also applies when one half is the main task.
    const partner=selectedPiece?.addon==='defense'?'norm':selectedPiece?.addon==='norm'?'defense':null;
    const bundled=partner&&lines.find(l=>l.id===partner);
    if(bundled){bundled.price-=1500;bundled.saving=(bundled.saving||0)+1500;bundled.label+=' · в комплекте к защите';}
    const extras=lines.reduce((n,l)=>n+l.price,0),total=work+extras,high=workHigh+extras;
    const speedNote=s.speed==='expressfast'?'Меньше суток: бюджет ×2–3 от плановой цены. Возможность подтвердим после материалов.':s.speed==='express24'?'24 часа: действующий коэффициент ×2. Начало после согласования, материалов и оплаты.':selectedPiece?.addon?'Сохранена действующая цена отдельной услуги. Возможность выполнить к выбранной дате подтвердим до оплаты.':tm==='urgent'?'Дата до 14 дней: действующий коэффициент ×1,45.':tm==='mid'?'Дата через 14–29 дней: действующий коэффициент ×1,15.':'Плановый срок без надбавки за срочность.';
    return {total,high,work,workHigh,extras,lines,addons:filtered.addons,primaryAddon:selectedPiece?.addon||null,saving:lines.reduce((n,l)=>n+(l.saving||0),0),factor,lowerBound:total,needsQuote:true,mode,unit,quantity,source,description,coordination,note:description+' '+speedNote+(s.package==='vip'?' Резерв VIP: 15% работы, минимум 3 000 ₽.':'')+' Это предварительный бюджет; точную сумму и срок фиксируем до оплаты.'};
  }
  function benefit(price,raw){
    raw=raw||{};price=Math.max(0,Math.floor(Number(price)||0));const plan=plans[raw.plan]||plans.none;
    const points=bound(raw.points,0,500000),gift=bound(raw.gift,0,50000);
    // No unverified/expired promotional code is silently activated.
    const discount=Math.floor(Math.min(price*plan.rate/100,plan.cap));
    const spent=price>=1000?Math.min(points,Math.floor(price*.20),Math.max(0,Math.floor(price*.25)-discount)):0;
    const afterBenefits=price-discount-spent,giftUsed=Math.min(gift,afterBenefits),cash=afterBenefits-giftUsed;
    const fee=raw.newPlan&&raw.plan!=='none'?plan[raw.period==='month'?'month':'sem']:0;
    const deposit=raw.deposit?bound(raw.deposit,20000,60000):0;
    // An order stage must fit wholly in the deposit: never imply split tender.
    const fromDeposit=deposit>=cash&&cash>0?cash:0;
    const depositRate=deposit>=60000?.15:deposit>=45000?.12:deposit>=30000?.10:.08;
    const earnedRate=Math.min(depositRate,fromDeposit>=60000?.15:fromDeposit>=45000?.12:fromDeposit>=30000?.10:.08);
    const cashback=Math.floor(cash*plan.cashback/100);
    const reserve=fromDeposit?Math.max(0,Math.floor(fromDeposit*earnedRate)-cashback):0;
    return {price,discount,spent,afterBenefits,giftUsed,cash,fee,totalNow:cash+fee,netSaving:discount+spent-fee,cashback,reserve,fromDeposit,depositLeft:deposit-fromDeposit,depositNeed:deposit>0&&cash>deposit,upfront:deposit?deposit+(fromDeposit?0:cash)+fee:cash+fee,plan:raw.plan||'none'};
  }
  function compare(price,count,period){count=bound(count||1,1,20);const items=Object.entries(plans).map(([id,p])=>{const fee=id==='none'?0:p[period==='month'?'month':'sem'],discount=Math.floor(Math.min(price*p.rate/100,p.cap))*count;return {id,name:p.name,fee,discount,net:discount-fee,total:price*count-discount+fee,breakEven:p.rate?Math.ceil((fee+1)/Math.max(1,Math.floor(Math.min(price*p.rate/100,p.cap)))):0,days:id==='session'?60:period==='month'?30:150}});return {items,best:items.filter(p=>p.id!=='session'||period==='month').reduce((a,b)=>b.total<a.total?b:a,items[0])}}
  function description(s,ctx){const q=estimate(s,ctx,read(s));return 'Предварительный бюджет из каталога: '+range(q.total,q.high)+'. Основа: '+q.unit+(q.quantity>1?' × '+q.quantity:'')+'. '+q.lines.map(l=>l.label+': от '+money(l.price)+'.').join(' ')+' '+q.note}
  const api={KEY,plans,pieces,editTypes,options,kind,read,save,term,estimate,benefit,compare,money,range,description};root.SalonEstimate=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
