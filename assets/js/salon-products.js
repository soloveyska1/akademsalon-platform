(function(root){
'use strict';
const products = [
 {id:'essay',type:'self',name:'Эссе',group:'small',days:'2–5 дней',min:2,max:5,price:2500,detail:'Аргументированный текст по теме, источники и оформление.'},
 {id:'referat',type:'self',name:'Реферат',group:'small',days:'3–7 дней',min:3,max:7,price:2500,detail:'План, обзор литературы, основной текст и список источников.'},
 {id:'self',type:'self',name:'Самостоятельная / контрольная',group:'small',days:'2–7 дней',min:2,max:7,price:2500,detail:'Ответы или решения по вашему заданию с пояснениями.'},
 {id:'course',type:'course',name:'Курсовая работа',group:'student',days:'14–30 дней',min:14,max:30,price:14000,detail:'От плана до полного рабочего текста, выводов и оформления.'},
 {id:'practice',type:'practice',name:'Отчёт по практике',group:'student',days:'7–14 дней',min:7,max:14,price:14000,detail:'Отчёт по материалам практики. Дневник и приложения согласуем по заданию.'},
 {id:'chapter',type:'chapter',name:'Отдельная глава',group:'part',days:'7–21 день',min:7,max:21,price:30000,detail:'Теоретическая или практическая глава с выводами и источниками.'},
 {id:'diplom',type:'diplom',name:'Дипломная работа / ВКР',group:'student',days:'30–60 дней',min:30,max:60,price:40000,detail:'План, главы, введение, заключение и оформление по методичке.'},
 {id:'master',type:'master',name:'Магистерская диссертация',group:'science',days:'45–90 дней',min:45,max:90,price:60000,detail:'Исследовательский проект с методологией, главами и анализом результатов.'},
 {id:'rinc',type:'rinc',name:'Научная статья',group:'science',days:'10–21 день',min:10,max:21,price:9000,detail:'Текст, аннотация и источники по требованиям выбранного издания. Публикация отдельно.'},
 {id:'kandidat',type:'kandidat',name:'Кандидатская диссертация',group:'science',days:'от 3 месяцев',min:90,max:180,price:200000,detail:'Работа над исследованием по этапам: от замысла и методологии до текста глав.'},
 {id:'editing',type:'course',name:'Доработка готового текста',group:'part',days:'3–10 дней',min:3,max:10,price:null,detail:'Исправление замечаний, работа с логикой, источниками и оформлением. Объём выбираете вы.'},
 {id:'custom',type:'custom',name:'Другая задача или часть работы',group:'part',days:'по заданию',min:0,max:0,price:null,detail:'Введение, расчёты, презентация, задачи или несколько работ. Опишите нужный результат.'}
];
const money = n => new Intl.NumberFormat('ru-RU').format(n)+' ₽';
const get = id => products.find(p=>p.id===id)||products.find(p=>p.id==='course');
root.SalonProducts={products,get,money};
if(typeof module!=='undefined') module.exports=root.SalonProducts;
})(typeof window!=='undefined'?window:globalThis);
