/* «Документы Салона» v4: оглавление, поиск по документу, «Крупнее», печать и прогресс чтения.
   Основа — salon-legal.js: те же селекторы и те же id разделов (doc-section-N), поэтому старые ссылки
   на разделы работают. Сверху: номер раздела в оглавлении, текущий раздел в плашке на телефоне,
   кнопка «Ссылка» в строке заголовка и общий для сайта выбор крупного текста (SalonEase). */
(function(){'use strict';
const host=document.querySelector('[data-legal-reader]');if(!host)return;
const article=host.querySelector('.doc'),toc=host.querySelector('#ld-toc'),search=host.querySelector('#ld-search'),status=host.querySelector('#ld-search-status'),next=host.querySelector('[data-ld-next]'),nav=host.querySelector('.ld-navigation'),sidebar=host.querySelector('.ld-sidebar'),now=host.querySelector('[data-ld-now]'),size=host.querySelector('[data-ld-size]'),bar=host.querySelector('.ld-progress i');
const narrow=matchMedia('(max-width:760px)'),ease=window.SalonEase;
const LINK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
let marks=[],found=-1,chosen=-1;
const headings=Array.from(article.querySelectorAll('h2')),titles=[];
headings.forEach((h,i)=>{if(!h.id){let id='doc-section-'+(i+1);while(document.getElementById(id))id+='-x';h.id=id;}
 const title=h.textContent.replace(/\s+/g,' ').trim(),num=title.match(/^(\d+[а-яa-z]?\.)\s*(.+)$/i);titles.push(title);
 const a=document.createElement('a'),t=document.createElement('span');a.href='#'+h.id;
 if(num){const n=document.createElement('span');n.className='ld-toc-n';n.textContent=num[1];a.append(n);}
 t.textContent=num?num[2]:title;a.append(t);toc.append(a);
 const copy=document.createElement('button');copy.type='button';copy.className='ld-copy-section';copy.innerHTML=LINK+'<span>Ссылка</span>';
 const label=copy.lastChild;copy.setAttribute('aria-label','Скопировать ссылку на раздел: '+title);
 copy.addEventListener('click',async()=>{const url=new URL(location.href);url.hash=h.id;url.search='';try{await navigator.clipboard.writeText(url.href);label.textContent='Скопировано';}catch(_){label.textContent='Не скопировано';}copy.classList.add('ld-copied');setTimeout(()=>{label.textContent='Ссылка';copy.classList.remove('ld-copied');},2000);});
 const row=document.createElement('div');row.className='ld-h';h.before(row);row.append(h,copy);});
if(!headings.some(h=>/^\d/.test(h.textContent.trim())))toc.classList.add('ld-toc-plain');

// Поиск: подсветка совпадений в тексте документа, Enter и «Следующее» — к следующему
function clear(){marks.forEach(m=>{const p=m.parentNode;m.replaceWith(document.createTextNode(m.textContent));p.normalize();});marks=[];found=-1;}
function advance(){if(!marks.length)return;marks.forEach(m=>m.classList.remove('ld-found'));found=(found+1)%marks.length;marks[found].classList.add('ld-found');marks[found].scrollIntoView({block:'center',behavior:'auto'});status.textContent=(found+1)+' из '+marks.length;}
function find(){clear();const term=search.value.trim().toLocaleLowerCase('ru');nav.classList.toggle('ld-searching',term.length>=2);if(term.length<2){status.textContent=term?'Введи хотя бы 2 символа':'';next.hidden=true;return;}const walker=document.createTreeWalker(article,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement.closest('script,style,button,mark')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);nodes.forEach(n=>{const text=n.textContent,lower=text.toLocaleLowerCase('ru');let pos=0,at=lower.indexOf(term);if(at<0)return;const frag=document.createDocumentFragment();while(at>=0){frag.append(document.createTextNode(text.slice(pos,at)));const m=document.createElement('mark');m.textContent=text.slice(at,at+term.length);frag.append(m);marks.push(m);pos=at+term.length;at=lower.indexOf(term,pos);}frag.append(document.createTextNode(text.slice(pos)));n.replaceWith(frag);});status.textContent=marks.length?'Найдено: '+marks.length:'Совпадений нет';next.hidden=!marks.length;}
search.addEventListener('input',find);search.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();advance();}});next.addEventListener('click',advance);
host.querySelector('[data-ld-print]').addEventListener('click',()=>window.print());

// «Крупнее» — тот же выбор, что в настройках удобства сайта; место чтения при смене размера не теряется
function paintSize(on){host.classList.toggle('ld-large',on);size.setAttribute('aria-pressed',String(on));}
function keepPlace(change){const top=narrow.matches?150:120,items=article.getBoundingClientRect().top<top?Array.from(article.querySelectorAll('h2,p,li,tr')):[];const el=items.find(e=>e.getBoundingClientRect().bottom>top),before=el?el.getBoundingClientRect().top:0;change();if(el)scrollBy({top:el.getBoundingClientRect().top-before,behavior:'instant'});}
paintSize(!!ease&&ease.get('readingSize')==='large');
size.addEventListener('click',()=>{const on=!host.classList.contains('ld-large');keepPlace(()=>paintSize(on));if(ease)ease.set('readingSize',on?'large':'normal');});
document.addEventListener('salon:ease-change',()=>{if(ease&&ease.get('readingSize')==='large'!==host.classList.contains('ld-large'))keepPlace(()=>paintSize(ease.get('readingSize')==='large'));});

// Прогресс чтения и текущий раздел: в оглавлении и в плашке на телефоне
const links=Array.from(toc.querySelectorAll('a'));
function keepVisible(a){const box=narrow.matches?nav.lastElementChild:sidebar;if(!a||!nav.open||!box||box.scrollHeight<=box.clientHeight)return;const r=a.getBoundingClientRect(),b=box.getBoundingClientRect();if(r.top<b.top+8)box.scrollTop-=b.top+8-r.top;else if(r.bottom>b.bottom-8)box.scrollTop+=r.bottom-b.bottom+8;}
function progress(){const rect=article.getBoundingClientRect(),height=article.scrollHeight-innerHeight;bar.style.width=Math.max(0,Math.min(100,(-rect.top/Math.max(1,height))*100))+'%';const line=rect.bottom<=innerHeight+2?innerHeight*.6:narrow.matches?170:150;let pick=0;headings.forEach((h,i)=>{if(h.getBoundingClientRect().top<line)pick=i;});if(pick===chosen)return;chosen=pick;links.forEach((a,i)=>{if(i===pick)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});if(now)now.textContent=titles[pick]||'';keepVisible(links[pick]);}
let queued=false;function schedule(){if(!queued){queued=true;requestAnimationFrame(()=>{queued=false;progress();});}}
window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);

// На телефоне оглавление — плашка под шапкой: открывается поверх текста и закрывается после выбора раздела
if(narrow.matches)nav.open=false;
nav.classList.add('ld-ready');
narrow.addEventListener('change',e=>{nav.open=!e.matches;});
toc.addEventListener('click',e=>{if(narrow.matches&&e.target.closest('a'))nav.open=false;});
document.addEventListener('click',e=>{if(narrow.matches&&nav.open&&!nav.contains(e.target))nav.open=false;});
nav.addEventListener('keydown',e=>{if(e.key==='Escape'&&narrow.matches&&nav.open&&!(e.target===search&&search.value)){nav.open=false;nav.querySelector('summary').focus();}});
nav.addEventListener('toggle',()=>{if(nav.open)keepVisible(links[chosen]);});
progress();})();
