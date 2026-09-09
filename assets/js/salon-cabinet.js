/* Personal desk. Pure calendar and community views; cabinet.js owns auth and actions. */
(function (host) {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); };
  function dateOnly(v) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return '';
    var d = new Date(v + 'T12:00:00Z');
    return !isNaN(d) && d.toISOString().slice(0,10) === v ? v : '';
  }
  function today() { var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function agenda(orders, milestones, now) {
    now=dateOnly(now)||today();
    var rows=[];
    (orders||[]).forEach(function(o){
      if (o.archived || ['done','cancel','cancelled','closed','refund'].indexOf(o.status)>=0) return;
      var date=dateOnly(o.deadline_date);
      if(date || o.deadline_text) rows.push({key:'order-'+Number(o.id),id:Number(o.id),date:date,when:o.deadline_text||date,title:o.work_label||o.topic||'Заказ',ref:o.no||'Заказ',own:false});
    });
    (milestones||[]).forEach(function(m){var date=dateOnly(m.due);if(date) rows.push({key:'milestone-'+Number(m.id),id:Number(m.id),date:date,title:m.title||'Моя дата',own:true});});
    rows.forEach(function(r){r.past=!!r.date&&r.date<now;r.days=r.date?Math.round((Date.parse(r.date+'T12:00:00Z')-Date.parse(now+'T12:00:00Z'))/86400000):null;});
    return rows.sort(function(a,b){return (a.past-b.past)||((a.date||'9999').localeCompare(b.date||'9999'))||a.key.localeCompare(b.key);});
  }
  function dateLabel(r) {if(!r.date)return r.when||'Срок уточняется';if(r.days===0)return 'Сегодня';if(r.days===1)return 'Завтра';return new Date(r.date+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short'});}
  function agendaRows(rows,compact) {
    if(!rows.length) return '<div class="desk-empty"><strong>Место для твоих планов.</strong><p>Сроки заказов появятся автоматически. Свою сдачу или экзамен можно добавить отдельно.</p></div>';
    return '<div class="desk-agenda-list">'+rows.map(function(r){var tag=r.own?'div':'button';return '<'+tag+(r.own?'':' type="button" data-now-open="'+r.id+'"')+' class="desk-date'+(r.past?' is-past':'')+'"><span class="desk-date-day">'+esc(dateLabel(r))+'</span><span><strong>'+esc(r.title)+'</strong><small>'+esc(r.own?'Твоя отметка':r.ref)+(r.past?' · дата прошла':'')+'</small></span>'+(r.own?'':'<i aria-hidden="true">↗</i>')+'</'+tag+'>';}).join('')+'</div>';
  }
  function ics(rows,anonymous,stamp) {
    function escapeICS(s){return String(s).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');}
    function fold(s){var lines=[],current='',bytes=0;Array.from(s).forEach(function(c){var n=new TextEncoder().encode(c).length;if(bytes+n>73){lines.push(current);current=' ';bytes=1;}current+=c;bytes+=n;});lines.push(current);return lines.join('\r\n');}
    var lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Academic Salon//Personal calendar//RU','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Моя учёба'];
    (rows||[]).filter(function(r){return dateOnly(r.date);}).forEach(function(r){var end=new Date(r.date+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+1);lines.push('BEGIN:VEVENT','UID:'+r.key+'@calendar.akademsalon.ru','DTSTAMP:'+(stamp||new Date().toISOString()).replace(/[-:]/g,'').replace(/\.\d{3}/,''),'DTSTART;VALUE=DATE:'+r.date.replace(/-/g,''),'DTEND;VALUE=DATE:'+end.toISOString().slice(0,10).replace(/-/g,''),'SUMMARY:'+escapeICS(anonymous?'Учебная задача':r.title),'BEGIN:VALARM','TRIGGER:-P1D','ACTION:DISPLAY','DESCRIPTION:Завтра учебная задача','END:VALARM','END:VEVENT');});
    lines.push('END:VCALENDAR');return lines.map(fold).join('\r\n')+'\r\n';
  }
  function calendar(orders,me,curator,notification) {
    var rows=agenda(orders,me&&me.milestones), future=rows.filter(function(r){return !r.past;}),past=rows.filter(function(r){return r.past;});
    return '<section class="desk-calendar"><div class="desk-section-head"><div><span class="desk-overline">ТВОЙ УЧЕБНЫЙ РИТМ</span><h2>Сначала ближайшее.</h2></div><span class="desk-pill">'+future.length+' предстоящих</span></div>'+agendaRows(future)+
      (past.length?'<details class="desk-fold"><summary>Прошедшие даты <span>'+past.length+'</span></summary>'+agendaRows(past)+'</details>':'')+'</section>'+
      '<div class="desk-calendar-tools"><section class="desk-tool"><span class="desk-tool-icon" aria-hidden="true">↗</span><h3>В календарь телефона</h3><p>События с напоминанием за день. Apple, Google, Outlook.</p><label class="desk-check"><input type="checkbox" id="desk-calendar-private" checked> Без названий работ</label><button type="button" class="desk-button" data-calendar-export'+(rows.some(function(r){return r.date&&!r.past;})?'':' disabled')+'>Скачать календарь .ics</button><small>Импортируется один раз. После изменения сроков скачай заново. Уведомления зависят от настроек календаря.</small></section><section class="desk-tool"><span class="desk-tool-icon" aria-hidden="true">◷</span><h3>Узнавай об изменениях</h3><p>Сообщения, готовые файлы и новые статусы заказов.</p>'+notification+'<small>Уведомления браузера работают, пока кабинет открыт. Для Telegram проверь связь с ботом в настройках.</small><button type="button" class="desk-text-button" data-tab="settings">Настройки связи →</button></section></div>'+
      (me?'<div class="desk-milestones">'+curator+'</div>':'<section class="desk-tool"><h3>Сохраняй свои даты</h3><p>Войди в аккаунт, чтобы график был доступен на разных устройствах.</p><button type="button" class="desk-button" id="cabTg">Войти через Telegram</button></section>');
  }
  var packs=[
    {id:'salon',name:'Академический Салон',handle:'@akademsalon',url:'https://t.me/akademsalon',title:'Сдать без суеты',subtitle:'Три инструмента для финального рывка.',items:['Чек-лист перед отправкой','Таблица замечаний и правок','Каркас речи к защите'],color:'violet',mark:'а.'},
    {id:'kladovaya',name:'Кладовая ГИПСР',handle:'@kladovaya_gipsr',url:'https://t.me/kladovaya_gipsr',title:'Сессия по полочкам',subtitle:'Держи учёбу в одном месте.',items:['План недели и дедлайнов','Трекер подготовки по билетам','Шаблон конспекта занятия'],color:'mint',mark:'к.'}
  ];
  function community(state,authenticated) {
    state=state||{};var statuses=state.channels||{};
    var earned=packs.filter(function(p){return statuses[p.id]&&statuses[p.id].granted;}).length;
    return '<section class="desk-community-intro"><div><span class="desk-overline">ДВА ПРОЕКТА. ОДИН КРУГ СВОИХ.</span><h1>Подписка — твоя.<br><em>Подарок — наш.</em></h1><p>Полезные наборы за подписку на наши Telegram-каналы. Без покупки и платного абонемента.</p></div><div class="desk-collection"><span aria-hidden="true">✳</span><strong>'+earned+' <small>/ 2</small></strong><span>набора на твоей полке</span></div></section>'+
      (!authenticated?'<div class="desk-inline-note"><span>Войди через Telegram, чтобы сохранить подарки в своём аккаунте.</span><button type="button" class="desk-button" id="cabTg">Войти</button></div>':'')+
      (state.loadError?'<div class="desk-inline-note" role="status"><span>Не получилось загрузить твою полку. Подарки сохранены.</span><button type="button" class="desk-button" data-community-retry>Попробовать ещё раз</button></div>':'')+
      (state.demo?'<p class="desk-demo-note">Демонстрация механики: проверка подписки здесь учебная.</p>':'')+
      '<div class="desk-gift-grid">'+packs.map(function(p){var s=statuses[p.id]||{};var ready=authenticated&&state.enabled&&state.linked;var grant=!!s.granted;return '<article class="desk-gift desk-gift--'+p.color+'"><div class="desk-folder"><span class="desk-folder-label">'+esc(p.name)+'</span><span class="desk-folder-mark" aria-hidden="true">'+p.mark+'</span><div><small>ТВОЙ ЦИФРОВОЙ НАБОР</small><h3>'+p.title+'</h3></div><span class="desk-folder-count">3 инструмента</span></div><div class="desk-gift-body"><p>'+p.subtitle+'</p><details class="desk-fold"><summary>Что внутри <span>+</span></summary><ul>'+p.items.map(function(x){return '<li>'+x+'</li>';}).join('')+'</ul><p>Редактируемые таблицы и памятки. Открываются в браузере; можно заполнить и распечатать.</p></details><a class="desk-channel" href="'+p.url+'" target="_blank" rel="noopener noreferrer">'+p.handle+' <span>Открыть канал ↗</span></a>'+
        (grant?'<button type="button" class="desk-button" data-community-download="'+p.id+'">Открыть мой набор ↗</button>':'<button type="button" class="desk-button" data-community-check="'+p.id+'"'+(!ready||state.busy?' disabled':'')+'>'+(state.busy===p.id?'Проверяем подписку…':'Я подписан · забрать набор')+'</button>')+
        '<p class="desk-gift-status" role="status">'+(grant?'✓ Набор сохранён. Доступ останется у тебя.':!authenticated?'Подарок привяжется к твоему аккаунту.':state.loadError?'Повтори загрузку полки кнопкой выше.':!state.enabled?'Выдача подарков готовится. Канал уже можно открыть.':!state.linked?'Нужен подтверждённый Telegram в настройках.':s.status==='not_member'?'Подпишись в Telegram и проверь ещё раз.':s.status==='unavailable'?'Не удалось проверить. Попробуй немного позже.':s.status==='error'?'Проверка не завершилась. Попробуй ещё раз.':'Открой канал, подпишись и вернись за подарком.')+'</p></div></article>';}).join('')+'</div>'+
      '<div class="desk-community-foot"><span>♡</span><p><strong>Свои вещи остаются с тобой.</strong> Полученный набор можно открывать снова. Подписки проверяются отдельно; вступление во второй канал не обязательно.</p><a href="https://studkladovaya.ru" target="_blank" rel="noopener noreferrer">Заглянуть в Кладовую ↗</a></div>';
  }
  function saveFile(body,name,type) {var url=URL.createObjectURL(new Blob([body],{type:type})),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},30000);}
  var api={esc:esc,dateOnly:dateOnly,today:today,agenda:agenda,agendaRows:agendaRows,ics:ics,calendar:calendar,community:community,packs:packs,saveFile:saveFile};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else host.SalonCabinetUI=api;
})(typeof window!=='undefined'?window:globalThis);
