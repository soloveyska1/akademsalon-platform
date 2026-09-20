(function () {
  'use strict';
  const root = document.querySelector('[data-defense-trainer]');
  if (!root) return;
  const questions = [
    ['Какую задачу решает твоя работа?', 'Объясни в двух-трёх предложениях: в чём проблема, что ты хотел выяснить и какой ответ получил.', 'Свяжи проблему, цель и главный вывод. Тема на титульном листе сама по себе ещё не объясняет, что именно ты исследовал.', 'Сформулируй связь между проблемой, целью и главным выводом.'],
    ['Почему ты выбрал именно этот метод?', 'Назови метод и объясни, почему он подходит к твоей задаче и материалу. Какой другой подход ты рассматривал?', 'Сошлись на вопрос исследования, доступный материал и ограничения метода. Фразы «так было в примере» недостаточно.', 'Объясни выбор метода и назови его ограничения.'],
    ['Какой результат ты получил?', 'Выбери один главный вывод. Покажи, где в твоём тексте есть основание для него: таблица, расчёт, пример или анализ.', 'Раздели то, что было известно до твоей работы, и то, что получилось установить в ней. Для теоретической работы результатом может быть обоснованное сопоставление подходов.', 'Найди конкретное основание для каждого главного вывода.'],
    ['На какие источники ты опираешься?', 'Назови две-три ключевые работы, которые ты действительно читал. Как именно они помогли твоему исследованию?', 'Объясни связь источника с твоим тезисом. Проверь, что ссылка ведёт к нужной работе, а цитата соответствует оригиналу.', 'Перечитай ключевые источники и проверь ссылки на них.'],
    ['Где заканчиваются твои выводы?', 'Что твой материал позволяет утверждать, а что пока остаётся предположением? Назови хотя бы одно ограничение.', 'Учитывай объём и состав материала, период исследования, выбранный метод. Ограничение помогает точнее сформулировать вывод, а не обесценивает работу.', 'Уточни границы применимости выводов и открытые вопросы.'],
    ['Кому и чем полезен результат?', 'Приведи конкретный пример применения или объясни, как результат помогает лучше понять исследуемый вопрос.', 'Свяжи пользу с тем, что ты действительно получил. Если применение пока не проверено, прямо назови его возможным направлением.', 'Подготовь один конкретный пример пользы или дальнейшего исследования.']
  ];
  const $ = selector => root.querySelector(selector);
  const status = document.querySelector('[data-trainer-status]');
  const workNames = {course:'Курсовая работа', diplom:'Дипломная работа / ВКР', master:'Магистерская диссертация'};
  let current = 0;
  let answers = Array(questions.length).fill(null);
  let timer = null;
  let endTime = 0;
  const steps = [...root.querySelectorAll('.gz-steps li')];
  function stopTimer() {
    clearInterval(timer); timer = null; endTime = 0;
    $('[data-timer]').setAttribute('aria-pressed','false');
    $('[data-timer-label]').textContent = 'Минута на ответ';
  }
  function announce(message) { status.textContent = message; }
  function render(focus) {
    stopTimer();
    $('[data-question-panel]').hidden = false; $('[data-result]').hidden = true;
    const q = questions[current];
    $('#gz-counter').textContent = 'Вопрос '+(current+1)+' из '+questions.length;
    $('#gz-question').textContent=q[0]; $('#gz-prompt').textContent=q[1]; $('#gz-hint').textContent=q[2];
    $('.gz-hint').open=false;
    $('[data-progress]').style.width=((current+1)/questions.length*100)+'%';
    $('[data-prev]').disabled=current===0;
    $('[data-next]').textContent=current===questions.length-1?'К плану →':answers[current]?'Далее →':'Пропустить →';
    $('[data-answer-label]').textContent=answers[current]==='ready'?'Отмечено: уверенно':answers[current]==='practice'?'Отмечено: доработать':'Оцени ответ сам';
    steps.forEach((step,i)=>{step.removeAttribute('aria-current');if(i===current)step.setAttribute('aria-current','step');if(answers[i])step.dataset.done='true';else delete step.dataset.done;});
    if(focus) $('#gz-question').focus();
  }
  function result() {
    stopTimer();
    $('[data-question-panel]').hidden=true; $('[data-result]').hidden=false;
    steps.forEach(step=>step.removeAttribute('aria-current'));
    const ready=answers.filter(x=>x==='ready').length;
    $('[data-result-summary]').textContent=ready===questions.length?'Ты отметил все ответы как уверенные. Повтори прогон с докладом и проверь, что каждый вывод подтверждён в тексте.':'Уверенных ответов: '+ready+' из '+questions.length+'. Ниже темы, которые ты отметил для доработки или пропустил.';
    const list=$('[data-result-list]');list.replaceChildren();
    questions.forEach((q,i)=>{if(answers[i]==='ready'&&ready!==questions.length)return;const li=document.createElement('li');li.textContent=q[3];const small=document.createElement('small');small.textContent=answers[i]==='ready'?'Контроль перед выступлением':answers[i]==='practice'?'Ты отметил: нужно доработать':'Ты пропустил этот вопрос';li.append(small);list.append(li);});
    $('#gz-result-title').focus();announce('План подготовки готов. Его можно скачать.');
  }
  function next() {if(current<questions.length-1){current++;render(true);}else result();}
  root.querySelectorAll('[data-answer]').forEach(button=>button.addEventListener('click',()=>{answers[current]=button.dataset.answer;steps[current].dataset.done='true';announce('Ответ '+(current+1)+' отмечен.');next();}));
  $('[data-next]').addEventListener('click',next);
  $('[data-prev]').addEventListener('click',()=>{if(current>0){current--;render(true);}});
  $('[data-restart]').addEventListener('click',()=>{answers=Array(questions.length).fill(null);current=0;render(true);announce('Новый прогон. Предыдущие отметки сброшены.');});
  $('#gz-work').addEventListener('change',()=>{announce('Выбрано: '+workNames[$('#gz-work').value]+'. Вопросы общие для всех видов работ; твои отметки сохранены.');});
  $('[data-timer]').addEventListener('click',()=>{
    if(timer){stopTimer();announce('Таймер остановлен.');return;}
    endTime=Date.now()+60000;
    $('[data-timer]').setAttribute('aria-pressed','true');
    const tick=()=>{const remaining=Math.max(0,Math.ceil((endTime-Date.now())/1000));$('[data-timer-label]').textContent=remaining+' с · остановить';if(remaining===0){stopTimer();announce('Минута прошла. Закончи мысль и оцени ответ.');}};
    tick();timer=setInterval(tick,250);announce('Минута на ответ. Таймер можно остановить.');
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&timer){stopTimer();announce('Таймер остановлен, пока вкладка неактивна.');}});
  window.addEventListener('pagehide',stopTimer);
  function planText(){return ['ПЛАН ПОДГОТОВКИ К ЗАЩИТЕ','Академический Салон · Комиссия №0',workNames[$('#gz-work').value],'',...questions.flatMap((q,i)=>[(i+1)+'. '+q[0],'Самооценка: '+(answers[i]==='ready'?'ответил уверенно':answers[i]==='practice'?'нужно доработать':'пропущено'),'Следующий шаг: '+q[3],'']),'Общие вопросы для самостоятельной тренировки. Ответы не проверялись автоматически. Реальные вопросы и регламент определяет учебное заведение.','','Повторить тренировку: https://akademsalon.ru/komissiya-0.html#rehearsal','Репетиция с редактором: https://akademsalon.ru/komissiya-0.html#session'].join('\n');}
  $('[data-download]').addEventListener('click',()=>{const blob=new Blob(['\uFEFF'+planText()],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='План подготовки к защите.txt';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);announce('План подготовлен для скачивания.');});
  const share=document.querySelector('[data-share]');
  if(share){share.hidden=false;share.addEventListener('click',async()=>{const url='https://akademsalon.ru/komissiya-0.html?utm_source=share&utm_medium=link&utm_campaign=defense_trainer#rehearsal';try{await navigator.clipboard.writeText(url);announce('Ссылка скопирована. Отправь её другу.');}catch{const p=document.createElement('p');p.className='gz-local-note';const a=document.createElement('a');a.href=url;a.textContent=url;a.style.overflowWrap='anywhere';p.append(a);if(!document.querySelector('[data-share-fallback]')){p.dataset.shareFallback='true';share.after(p);}announce('Выдели и скопируй ссылку под кнопкой.');}});}
  document.querySelectorAll('[data-commission-order]').forEach(link=>link.addEventListener('click',()=>{try{sessionStorage.setItem('salon_commission_zero_handoff_v1',JSON.stringify({version:1,savedAt:Date.now(),work:$('#gz-work').value,source:'draft',topic:''}));}catch{/* Form remains usable without browser storage. */}}));
  $('[data-timer]').hidden=false;$('.gz-answer-actions').hidden=false;$('.gz-question-nav').hidden=false;
  render(false);
})();
