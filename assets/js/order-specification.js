(function () {
 'use strict';
 var root=document.querySelector('[data-agreement]');
 if(!root || root.dataset.ready)return;
 var tabs=Array.from(root.querySelectorAll('[data-field]'));
 var panels=Array.from(root.querySelectorAll('[data-annotation]'));
 if(tabs.length!==4 || panels.length!==4)return;
 root.dataset.ready='1';
 var index=0;
 var rail=root.querySelector('.agreement-fields');
 rail.setAttribute('role','tablist');rail.setAttribute('aria-orientation','vertical');
 tabs.forEach(function(tab,i){tab.setAttribute('role','tab');tab.setAttribute('aria-controls',panels[i].id);panels[i].setAttribute('role','tabpanel');panels[i].setAttribute('aria-labelledby',tab.id);panels[i].tabIndex=0;});
 function reveal(panel){panel.focus({preventScroll:true});if(window.innerWidth<=760)panel.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
 function show(i,focus,updateHash){index=i;if(updateHash)history.replaceState(null,'','#'+panels[i].id);tabs.forEach(function(tab,j){tab.setAttribute('aria-selected',String(i===j));tab.tabIndex=i===j?0:-1;panels[j].hidden=i!==j;});if(focus)tabs[i].focus({preventScroll:true});}
 tabs.forEach(function(tab,i){tab.addEventListener('click',function(e){e.preventDefault();show(i,false,true);if(window.innerWidth<=760)reveal(panels[i]);});});
 function keyIndex(e,current,count){if(e.key==='ArrowRight'||e.key==='ArrowDown')return(current+1)%count;if(e.key==='ArrowLeft'||e.key==='ArrowUp')return(current+count-1)%count;if(e.key==='Home')return 0;if(e.key==='End')return count-1;return null;}
 rail.addEventListener('keydown',function(e){var next=keyIndex(e,index,4);if(next===null)return;e.preventDefault();show(next,true,true);});
 root.querySelectorAll('[data-next-field]').forEach(function(button){button.hidden=false;button.addEventListener('click',function(){show((index+1)%4,false,true);reveal(panels[index]);});});
 panels.forEach(function(panel){var back=document.createElement('a');back.className='agreement-back';back.href='#agreement-title';back.textContent='↑ Другой пункт в документе';back.addEventListener('click',function(e){e.preventDefault();tabs[index].focus({preventScroll:true});document.querySelector('.agreement-paper').scrollIntoView({behavior:'auto',block:'start'});});panel.insertBefore(back,panel.firstChild);});
 var modeTabs=Array.from(document.querySelectorAll('[data-mode-tab]'));
 var modePanels=Array.from(document.querySelectorAll('[data-mode-panel]'));
 var modeIndex=0;
 var modeRail=document.querySelector('.agreement-mode-tabs');
 modeRail.setAttribute('role','tablist');
 modeTabs.forEach(function(tab,i){tab.setAttribute('role','tab');tab.setAttribute('aria-controls',modePanels[i].id);modePanels[i].setAttribute('role','tabpanel');modePanels[i].setAttribute('aria-labelledby',tab.id);modePanels[i].tabIndex=0;});
 function showMode(i,focus){modeIndex=i;modeTabs.forEach(function(tab,j){tab.setAttribute('aria-selected',String(i===j));tab.tabIndex=i===j?0:-1;modePanels[j].hidden=i!==j;});if(focus)modeTabs[i].focus();}
 modeTabs.forEach(function(tab,i){tab.addEventListener('click',function(e){e.preventDefault();showMode(i,false);});});
 modeRail.addEventListener('keydown',function(e){var next=keyIndex(e,modeIndex,4);if(next===null)return;e.preventDefault();showMode(next,true);});
 function fromHash(){var field=panels.findIndex(function(p){return '#'+p.id===location.hash;});if(field>=0)show(field,false);var mode=modePanels.findIndex(function(p){return '#'+p.id===location.hash;});if(mode>=0){modeRail.closest('details').open=true;showMode(mode,false);}}
 show(0,false);showMode(0,false);fromHash();window.addEventListener('hashchange',fromHash);root.classList.add('is-ready');
})();
