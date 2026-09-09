(function(){
'use strict';
const $=s=>document.querySelector(s);
// The homepage shell owns its native navigation dialog; legacy menu listeners are not used.
const nav=$('#home-navigation'),navToggle=$('.shell-menu-toggle');let restoreNav=true;
if(nav&&navToggle){
 const closeNav=(restore=true)=>{restoreNav=restore;nav.close()};
 navToggle.onclick=()=>{restoreNav=true;nav.showModal();document.body.classList.add('home-nav-open');navToggle.setAttribute('aria-expanded','true');nav.querySelector('.shell-menu-close').focus();document.dispatchEvent(new Event("salon:shellchange"))};
 nav.querySelector('.shell-menu-close').onclick=()=>closeNav();
 nav.addEventListener('close',()=>{document.body.classList.remove('home-nav-open');navToggle.setAttribute('aria-expanded','false');if(restoreNav)navToggle.focus({preventScroll:true});document.dispatchEvent(new Event("salon:shellchange"))});
 nav.addEventListener('click',e=>{if(e.target===nav){const r=nav.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeNav()}else if(e.target.closest('a[href]'))closeNav(false)});
 nav.querySelector('[data-menu-search]').onclick=()=>{closeNav(false);$('.search-button').click();$('.experience-search')?.addEventListener('close',()=>navToggle.focus({preventScroll:true}),{once:true})};
 const themeShortcut=nav.querySelector('[data-menu-theme]');function themeLabel(){themeShortcut.querySelector('span').textContent=document.documentElement.dataset.theme==='dark'?'Светлая тема':'Тёмная тема'}
 themeShortcut.onclick=()=>{$('.theme-button').click();themeLabel()};new MutationObserver(themeLabel).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});themeLabel();
}
})();
