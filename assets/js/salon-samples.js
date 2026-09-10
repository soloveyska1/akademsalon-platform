(function(root){
'use strict';
// Original teaching excerpts. These are not client work or empirical findings.
const samples={
 course:{label:'Курсовая',product:'course',folio:'ФРАГМЕНТ / ВВЕДЕНИЕ',title:'Как обратная связь помогает самостоятельной работе',structure:['Введение','Теоретическая глава','Методика анализа','Выводы','Источники'],paragraphs:[
 'Самостоятельная работа требует не только времени, но и понятного критерия: как студент узнает, что движется в нужную сторону? В этой теме важно различать оценку результата и обратную связь о способе его получения.',
 '[[Цель работы — сопоставить способы обратной связи и определить, какие из них помогают студенту самостоятельно исправлять ошибки.|0]] Для этого нужно описать виды обратной связи, выбрать критерии сравнения и проанализировать учебные ситуации.',
 '[[Объект — организация самостоятельной работы студентов. Предмет — способы обратной связи в процессе выполнения учебного задания.|1]]',
 '[[В работе используется сравнительный анализ. Критерии: конкретность замечания, возможность исправления и понятность следующего действия.|2]] Выводы будут ограничены выбранными учебными ситуациями; причинное влияние на успеваемость без отдельного исследования не устанавливается.'
 ],notes:[['Цель, которую можно проверить','Не «изучить всё о теме», а конкретный результат: сопоставить способы по заданным критериям. Каждый пункт плана должен помогать получить этот результат.'],['Объект и предмет не дублируются','Объект задаёт широкую область. Предмет выделяет именно то отношение или свойство, которое рассматривает эта работа.'],['Метод связан с задачей','Сравнительный анализ подходит для сопоставления. Он сам по себе не доказывает влияние на оценки. Ограничение явно названо, чтобы вывод не оказался сильнее данных.']]},
 practice:{label:'Практика',product:'practice',folio:'ФРАГМЕНТ / АНАЛИЗ ДЕЯТЕЛЬНОСТИ',title:'От наблюдения к профессиональному выводу',structure:['Сведения об организации','Задачи практики','Описание деятельности','Анализ ситуации','Дневник и приложения'],paragraphs:[
 '[[В учебном примере рассматривается организация приёма обращений. Реальные сведения об учреждении, участниках и сроках в этот образец не включены.|0]]',
 'На первом этапе практикант знакомится с регламентом и наблюдает маршрут обращения: регистрация, уточнение задачи, передача специалисту. В отчёте нужно отделить наблюдаемое действие от своей интерпретации.',
 '[[Если обращение возвращается на уточнение, это ещё не доказывает недостаток квалификации специалиста. Возможная причина — неполные исходные сведения.|1]] Проверить предположение можно сопоставлением требований регламента с составом поступивших материалов.',
 '[[Рекомендация: добавить короткий перечень обязательных сведений при регистрации обращения. Критерий проверки — доля обращений, возвращённых именно из-за неполных данных.|2]] Значение этого показателя нужно получить из реальных материалов практики.'
 ],table:[['Наблюдение','Что проверить'],['Возврат на уточнение','Какого сведения не хватило'],['Повторная передача','На каком шаге изменился адресат']],notes:[['Материалы не выдумываются','Отчёт строится на вашей практике. Если данных не хватает, уточняем входы и отмечаем ограничения. Не подставляем вымышленные организации, подписи или показатели.'],['Наблюдение ≠ объяснение','Факт и гипотеза подписаны отдельно. Так читатель видит, что действительно установлено и что ещё предстоит проверить.'],['Рекомендация вытекает из анализа','Предлагаем конкретное изменение и способ оценить его. Общий совет «повысить эффективность» не позволяет проверить результат.']]},
 essay:{label:'Эссе',product:'essay',folio:'ФРАГМЕНТ / АРГУМЕНТАЦИЯ',title:'Всегда ли быстрый ответ помогает учиться?',structure:['Вопрос и позиция','Основной аргумент','Возражение','Ответ на возражение','Вывод'],paragraphs:[
 'Быстрый ответ снимает неопределённость, но не всегда помогает разобраться в задаче. [[Моя позиция: полезность подсказки зависит от того, оставляет ли она студенту самостоятельное действие.|0]]',
 'Готовое решение позволяет сверить результат. Подсказка о первом шаге, напротив, сохраняет необходимость выбрать ход рассуждения. Поэтому оценивать помощь только по скорости ответа недостаточно.',
 '[[Можно возразить: в незнакомой теме полный пример решения необходим. Это верно, если студент использует его как образец и затем решает новую задачу самостоятельно.|1]] Проблема возникает, когда пример полностью заменяет собственную попытку.',
 '[[Следовательно, хороший учебный ответ должен делать следующий шаг доступным, а не просто завершать разговор.|2]] В одном случае это вопрос, в другом — разбор ошибки, в третьем — полный пример с заданием для самостоятельной проверки.'
 ],notes:[['Позиция сформулирована','Читатель понимает, с каким тезисом будет работать автор. Тезис достаточно узкий, чтобы его можно было обосновать в небольшом тексте.'],['Возражение принято всерьёз','Сильное эссе не обходит разумный контраргумент. Здесь показано условие, при котором противоположная позиция тоже работает.'],['Вывод отвечает исходному вопросу','В финале не появляется новая тема. Он связывает тезис, аргумент и рассмотренное ограничение. Для задания с источниками дополнительно подбирается и оформляется литература.']]}
};
root.SalonSamples=samples;
if(typeof module!=='undefined'&&module.exports)module.exports=samples;
if(typeof document==='undefined')return;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
document.querySelectorAll('[data-sample-studio]').forEach((host,instance)=>{
 let selected='course',note=0;
 const prefix='studio-'+instance;
 host.innerHTML='<div class="sample-studio"><div class="sample-toolbar"><div class="sample-tabs" role="tablist" aria-label="Тип учебного образца">'+Object.entries(samples).map(([k,s])=>'<button type="button" role="tab" id="'+prefix+'-'+k+'" data-sample="'+k+'" aria-controls="'+prefix+'-panel">'+s.label+'</button>').join('')+'</div><span>Учебные образцы · пометки открываются</span></div><div id="'+prefix+'-panel" role="tabpanel" class="sample-panel"></div><div class="sample-bottom"><p>Специально созданные учебные фрагменты, не клиентские работы и не результаты исследования. Полный состав определяется заданием.</p><a class="text-link" data-sample-order href="configurator.html?product=course">Заказать такую работу ↗</a></div></div>';
 const panel=host.querySelector('[role=tabpanel]');
 function showNote(index){
  note=index;const s=samples[selected];
  const aside=host.querySelector('.sample-note');
  aside.innerHTML='<span>НА ЧТО СМОТРИМ / 0'+(note+1)+'</span><h4>'+esc(s.notes[note][0])+'</h4><p>'+esc(s.notes[note][1])+'</p><div class="note-count" aria-hidden="true">'+s.notes.map((n,i)=>'<span class="'+(i===note?'is-on':'')+'"></span>').join('')+'</div>';
  host.querySelectorAll('.sample-mark').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.note)===note)));
 }
 function render(key){
  selected=key;note=0;const s=samples[key];
  host.querySelectorAll('[role=tab]').forEach(b=>{const on=b.dataset.sample===key;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1});
  panel.setAttribute('aria-labelledby',prefix+'-'+key);
  panel.innerHTML='<div class="sample-spread"><aside class="sample-index"><span>КАРТА РАБОТЫ</span><ol>'+s.structure.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ol><p>Структура для примера. Методичка вашего вуза определит итоговый состав.</p></aside><article class="sample-paper"><div class="folio"><span>'+s.folio+'</span><span>АС / 01</span></div><h3>'+esc(s.title)+'</h3>'+s.paragraphs.map(p=>'<p class="sample-paragraph">'+esc(p).replace(/\[\[(.*?)\|(\d)\]\]/g,(_,t,i)=>'<button type="button" class="sample-mark" data-note="'+i+'" aria-pressed="false" aria-controls="'+prefix+'-note">'+t+'</button>')+'</p>').join('')+(s.table?'<table><caption class="sr-only">Как проверить наблюдение</caption>'+s.table.map((r,i)=>'<tr>'+r.map(c=>'<'+(i?'td':'th scope="col"')+'>'+esc(c)+'</'+(i?'td':'th')+'>').join('')+'</tr>').join('')+'</table>':'')+'</article><aside class="sample-note" id="'+prefix+'-note" aria-live="polite" aria-atomic="true"></aside></div>';
  host.querySelector('[data-sample-order]').href='configurator.html?product='+s.product;
  host.querySelectorAll('.sample-mark').forEach(b=>b.addEventListener('click',()=>showNote(Number(b.dataset.note))));showNote(0);
 }
 host.querySelectorAll('[role=tab]').forEach(b=>{
  b.addEventListener('click',()=>render(b.dataset.sample));
  b.addEventListener('keydown',e=>{const keys=Object.keys(samples),i=keys.indexOf(selected);let next;if(e.key==='ArrowRight')next=keys[(i+1)%keys.length];if(e.key==='ArrowLeft')next=keys[(i+keys.length-1)%keys.length];if(e.key==='Home')next=keys[0];if(e.key==='End')next=keys[keys.length-1];if(next){e.preventDefault();render(next);host.querySelector('[data-sample="'+next+'"]').focus()}});
 });
 render('course');
 document.addEventListener('salon:selection',e=>{const p=e.detail?.product;const key=p==='practice'?'practice':['essay','referat','self'].includes(p)?'essay':'course';render(key)});
 const quick=document.getElementById('quick-product');if(quick){const p=quick.value;render(p==='practice'?'practice':['essay','referat','self'].includes(p)?'essay':'course')}
});
})(typeof window!=='undefined'?window:globalThis);
