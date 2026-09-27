(function () {
  'use strict';
  if (!window.HTMLDialogElement || !HTMLDialogElement.prototype.showModal) return;
  const inputs = [...document.querySelectorAll('#cat-deadline, body.salon-intake #deadline')].filter(el => el.type === 'date');
  if (!inputs.length) return;
  const months = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const weekdays = ['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
  const fullDate = new Intl.DateTimeFormat('ru-RU', {weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const fieldDate = new Intl.DateTimeFormat('ru-RU', {day:'numeric',month:'short',year:'numeric'});
  const iso = d => [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  const date = (y,m,d=1) => new Date(y,m,d,12);
  const today = () => { const d=new Date();return date(d.getFullYear(),d.getMonth(),d.getDate()) };
  const parse = s => {if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))return null;const [y,m,d]=s.split('-').map(Number),v=date(y,m-1,d);return iso(v)===s?v:null};
  const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 11h16m-11 5h2m2 0h2"/></svg>';
  const dialog = document.createElement('dialog');
  dialog.id='salon-calendar';dialog.className='sc-calendar';dialog.setAttribute('aria-labelledby','sc-label');
  dialog.innerHTML='<div class="sc-top"><span id="sc-label">СРОК СДАЧИ</span><button type="button" class="sc-close" aria-label="Закрыть календарь">×</button></div><div class="sc-nav"><button type="button" class="sc-prev sc-arrow" aria-label="Предыдущий месяц">‹</button><button type="button" class="sc-period" aria-label="Выбрать месяц и год"><span id="sc-month-label" aria-live="polite" aria-atomic="true"></span><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m3 4.5 3 3 3-3"/></svg></button><button type="button" class="sc-next sc-arrow" aria-label="Следующий месяц">›</button></div><div class="sc-days" role="grid" aria-labelledby="sc-month-label"></div><div class="sc-months" role="group" aria-label="Выбери месяц" hidden></div><div class="sc-footer"><button type="button" class="sc-today">Сегодня</button><button type="button" class="sc-clear">Без даты</button></div>';
  document.body.append(dialog);
  const $ = s => dialog.querySelector(s);
  let active=null, cursor=today(), view=date(cursor.getFullYear(),cursor.getMonth()), mode='days';
  const entries=[];
  function bounds(){return {min:parse(active.input.min)||date(1900,0,1),max:parse(active.input.max)||date(9999,11,31)}}
  function clamp(d){const b=bounds();return d<b.min?b.min:d>b.max?b.max:d}
  function allowed(d){const b=bounds();return d>=b.min&&d<=b.max}
  function monthAllowed(y,m){const b=bounds();return date(y,m+1,0)>=b.min&&date(y,m)<=b.max}
  function stepMonth(d,n){const first=date(d.getFullYear(),d.getMonth()+n);return date(first.getFullYear(),first.getMonth(),Math.min(d.getDate(),date(first.getFullYear(),first.getMonth()+1,0).getDate()))}
  function position(){
    if(!dialog.open||!active)return;
    if(!active.button.getClientRects().length){close(false);const fallback=[...document.querySelectorAll('#cat-resume-open,.sv-row')].find(el=>el.getClientRects().length);fallback?.focus({preventScroll:true});return;}
    const viewport=window.visualViewport, vw=viewport?.width||innerWidth, vh=viewport?.height||innerHeight;
    const ox=viewport?.offsetLeft||0, oy=viewport?.offsetTop||0, r=active.button.getBoundingClientRect();
    const w=dialog.offsetWidth,h=dialog.offsetHeight,gap=vw<360?1:8;
    let x=Math.min(Math.max(r.right-w,ox+gap),ox+vw-w-gap);
    let y=r.bottom+8;
    if(y+h>oy+vh-8)y=r.top-h-8;
    y=Math.max(oy+8,Math.min(y,oy+vh-h-8));
    dialog.style.left=Math.max(ox+gap,x)+'px';dialog.style.top=y+'px';
  }
  function sync(){entries.forEach(({input,button,label})=>{
    const d=parse(input.value);button.querySelector('span').textContent=d?fieldDate.format(d).replace(/\s?г\.$/,''):'Выбрать дату';
    button.classList.toggle('sc-has-date',!!d);button.disabled=input.disabled;
    button.setAttribute('aria-label',label+': '+(d?fullDate.format(d):'выбрать дату'));
    button.setAttribute('aria-invalid',input.getAttribute('aria-invalid')==='true'?'true':'false');
  })}
  function render(focusDay=false){
    if(!active)return;
    const y=view.getFullYear(),m=view.getMonth(),monthly=mode==='months';
    $('#sc-month-label').textContent=monthly?String(y):months[m]+' '+y;
    $('.sc-period').setAttribute('aria-label',monthly?'Вернуться к датам':'Выбрать месяц и год');
    $('.sc-period').setAttribute('aria-expanded',String(monthly));
    $('.sc-prev').setAttribute('aria-label',monthly?'Предыдущий год':'Предыдущий месяц');
    $('.sc-next').setAttribute('aria-label',monthly?'Следующий год':'Следующий месяц');
    $('.sc-prev').disabled=monthly?y<=bounds().min.getFullYear():!monthAllowed(y,m-1);
    $('.sc-next').disabled=monthly?y>=bounds().max.getFullYear():!monthAllowed(y,m+1);
    $('.sc-days').hidden=monthly;$('.sc-months').hidden=!monthly;
    $('.sc-today').disabled=!allowed(today());$('.sc-clear').disabled=!active.input.value;
    if(monthly){
      $('.sc-months').replaceChildren(...months.map((name,i)=>{const b=document.createElement('button');b.type='button';b.textContent=name;b.dataset.month=i;b.disabled=!monthAllowed(y,i);b.setAttribute('aria-pressed',String(i===m));return b}));
    }else{
      const grid=$('.sc-days');grid.replaceChildren();
      const headings=document.createElement('div');headings.className='sc-week';headings.setAttribute('role','row');
      weekdays.forEach(name=>{const el=document.createElement('span');el.setAttribute('role','columnheader');el.setAttribute('aria-label',name);el.textContent=name.slice(0,1)+(name==='Четверг'?'т':name==='Вторник'?'т':name==='Пятница'?'т':name==='Среда'?'р':name==='Суббота'?'б':name==='Воскресенье'?'с':'н');headings.append(el)});grid.append(headings);
      const start=date(y,m,1-((date(y,m).getDay()+6)%7));
      for(let row=0;row<6;row++){
        const line=document.createElement('div');line.className='sc-week';line.setAttribute('role','row');
        for(let col=0;col<7;col++){
          const d=date(start.getFullYear(),start.getMonth(),start.getDate()+row*7+col),b=document.createElement('button');b.type='button';b.dataset.date=iso(d);b.textContent=d.getDate();b.setAttribute('role','gridcell');b.setAttribute('aria-label',fullDate.format(d));b.disabled=!allowed(d);b.tabIndex=iso(d)===iso(cursor)&&!b.disabled?0:-1;b.className='sc-day'+(d.getMonth()!==m?' sc-adjacent':'');
          if(iso(d)===iso(today()))b.setAttribute('aria-current','date');if(iso(d)===active.input.value)b.setAttribute('aria-selected','true');line.append(b);
        }grid.append(line);
      }
    }
    // Keep the calendar stationary while navigating; only open/viewport changes reposition it.
    if(focusDay)focusCursor();
  }
  function focusCursor(){const el=$('[data-date="'+iso(cursor)+'"]');if(el){el.focus({preventScroll:true});el.scrollIntoView({block:'nearest',inline:'nearest'})}}
  function close(restore=true){const saved=active;active=null;if(dialog.open)dialog.close();document.body.classList.remove('sc-calendar-open');saved?.button.setAttribute('aria-expanded','false');if(restore&&saved?.button.isConnected)saved.button.focus({preventScroll:true})}
  function choose(value){const entry=active;if(!entry)return;close(false);entry.input.value=value;entry.input.dispatchEvent(new Event('input',{bubbles:true}));entry.input.dispatchEvent(new Event('change',{bubbles:true}));sync();entry.button.focus({preventScroll:true})}
  function open(entry){if(dialog.open)close(false);active=entry;cursor=clamp(parse(entry.input.value)||today());view=date(cursor.getFullYear(),cursor.getMonth());mode='days';render();dialog.showModal();document.body.classList.add('sc-calendar-open');entry.button.setAttribute('aria-expanded','true');position();focusCursor()}
  inputs.forEach(input=>{
    const labels=[...input.labels],label=(labels[0]?.textContent||'Дата сдачи').trim();
    const button=document.createElement('button');button.type='button';button.id=input.id+'-calendar';button.className='sc-date-trigger';button.innerHTML='<span></span>'+icon;button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls',dialog.id);button.setAttribute('aria-expanded','false');if(input.getAttribute('aria-describedby'))button.setAttribute('aria-describedby',input.getAttribute('aria-describedby'));
    input.after(button);input.classList.add('sc-native-date');input.tabIndex=-1;input.setAttribute('aria-hidden','true');labels.forEach(el=>el.htmlFor=button.id);
    const entry={input,button,label};entries.push(entry);button.onclick=()=>open(entry);button.onkeydown=e=>{if(e.key==='ArrowDown'){e.preventDefault();open(entry)}};
    input.addEventListener('input',sync);input.addEventListener('change',sync);input.addEventListener('invalid',e=>{e.preventDefault();open(entry)});
    new MutationObserver(sync).observe(input,{attributes:true,attributeFilter:['aria-invalid','disabled']});
  });
  $('.sc-close').onclick=()=>close();dialog.addEventListener('cancel',e=>{e.preventDefault();close()});
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();return}const day=e.target.closest('[data-date]');if(day&&!day.disabled)choose(day.dataset.date);const month=e.target.closest('[data-month]');if(month&&!month.disabled){cursor=clamp(date(view.getFullYear(),Number(month.dataset.month),Math.min(cursor.getDate(),date(view.getFullYear(),Number(month.dataset.month)+1,0).getDate())));view=date(cursor.getFullYear(),cursor.getMonth());mode='days';render(true)}});
  $('.sc-period').onclick=()=>{mode=mode==='days'?'months':'days';render()};
  for(const [sel,delta]of [['.sc-prev',-1],['.sc-next',1]])$(sel).onclick=()=>{cursor=clamp(stepMonth(cursor,delta*(mode==='months'?12:1)));view=date(cursor.getFullYear(),cursor.getMonth());render()};
  $('.sc-today').onclick=()=>choose(iso(today()));$('.sc-clear').onclick=()=>choose('');
  dialog.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return}
    if(e.key==='Tab'){const nodes=[...dialog.querySelectorAll('button')].filter(el=>!el.disabled&&el.tabIndex>=0&&el.getClientRects().length);if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1).focus()}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0].focus()}return}
    const el=e.target.closest('[data-date]');if(!el)return;let next=parse(el.dataset.date);const week=(next.getDay()+6)%7;
    if(e.key==='ArrowLeft')next.setDate(next.getDate()-1);else if(e.key==='ArrowRight')next.setDate(next.getDate()+1);else if(e.key==='ArrowUp')next.setDate(next.getDate()-7);else if(e.key==='ArrowDown')next.setDate(next.getDate()+7);else if(e.key==='Home')next.setDate(next.getDate()-week);else if(e.key==='End')next.setDate(next.getDate()+6-week);else if(e.key==='PageUp'||e.key==='PageDown')next=stepMonth(next,(e.key==='PageUp'?-1:1)*(e.shiftKey?12:1));else return;
    e.preventDefault();cursor=clamp(next);view=date(cursor.getFullYear(),cursor.getMonth());render(true);
  });
  document.addEventListener('salon:order-updated',sync);window.addEventListener('pageshow',sync);window.addEventListener('resize',position);window.visualViewport?.addEventListener('resize',position);window.addEventListener('pagehide',()=>close(false));sync();
})();
