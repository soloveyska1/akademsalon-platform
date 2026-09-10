(function(){
'use strict';
const $=id=>document.getElementById(id), P=window.SalonProducts;
const theme=document.querySelector('.theme-button');
if(theme) theme.addEventListener('click',()=>{
 const dark=document.documentElement.dataset.theme!=='dark';
 document.documentElement.dataset.theme=dark?'dark':'light';
 try{localStorage.setItem('salon_theme',dark?'dark':'light')}catch(e){}
 document.querySelector('meta[name="theme-color"]').content=dark?'#181917':'#f5f3ed';
});
const menu=document.querySelector('.menu-button');
if(menu){menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));$('mobile-menu').hidden=!open;menu.setAttribute('aria-label',open?'Закрыть меню':'Открыть меню')});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('mobile-menu').hidden){$('mobile-menu').hidden=true;menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Открыть меню');menu.focus()}})}
if($('quick-product')) $('quick-product').addEventListener('change',()=>{const p=P.get($('quick-product').value);$('quick-price').textContent=p.price?'от '+P.money(p.price):'По заданию';$('quick-days').textContent=p.days;$('quick-detail').textContent=p.detail;$('quick-order').href='configurator.html?product='+p.id;$('quick-order').textContent='Заказать работу →'});
if($('catalogue-search')){
 let filter='all'; const cards=[...document.querySelectorAll('.product-card')];
 const update=()=>{const q=$('catalogue-search').value.toLocaleLowerCase('ru').trim().replace(/ё/g,'е');let count=0;cards.forEach(c=>{const visible=(filter==='all'||c.dataset.category===filter)&&c.textContent.toLocaleLowerCase('ru').replace(/ё/g,'е').includes(q);c.hidden=!visible;if(visible)count++});$('catalogue-count').textContent='Найдено: '+count;$('catalogue-empty').hidden=count>0};
 $('catalogue-search').addEventListener('input',update);
 document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));update()}));
}
})();
(function(){
'use strict';
const footer=document.querySelector('.footer-links');if(!footer||!window.Salon?.consent)return;
const b=document.createElement('button');b.type='button';b.className='cookie-settings';b.textContent='Настройки cookie';footer.append(b);
const dialog=document.createElement('dialog');dialog.className='cookie-dialog';dialog.setAttribute('aria-labelledby','cookie-title');dialog.innerHTML='<form method="dialog"><h2 id="cookie-title">Настройки cookie</h2><p>Необходимые файлы обеспечивают работу форм и кабинета. Аналитику можно включить отдельно.</p><label class="check-row"><input id="cookie-analytics" type="checkbox"><span>Разрешить аналитику посещений. <a href="consent-analytics.html" target="_blank" rel="noopener">Условия согласия</a></span></label><div class="dialog-actions"><button type="button" class="button" id="cookie-save">Сохранить выбор</button><button class="text-link" value="cancel">Закрыть</button></div></form>';document.body.append(dialog);
b.addEventListener('click',()=>{dialog.querySelector('input').checked=Salon.consent.allowed();dialog.showModal()});dialog.querySelector('#cookie-save').addEventListener('click',()=>{Salon.consent.save(dialog.querySelector('input').checked,'settings');dialog.close();b.focus()});
})();
