// Paint finite appearance preferences before page layout and reading restoration.
(function(){
'use strict';
const root=document.documentElement,key='salon_ease_v1';
const allowed={readingSize:['normal','large'],readingSpace:['normal','roomy'],assistant:['full','compact']};
function read(){let value;try{value=JSON.parse(localStorage.getItem(key)||'null')}catch(_){}const next={};for(const k of Object.keys(allowed))next[k]=allowed[k].includes(value?.[k])?value[k]:allowed[k][0];return next}
let prefs=read(),unsavedPrefs=false;
function paint(){root.dataset.readingSize=prefs.readingSize;root.dataset.readingSpace=prefs.readingSpace;root.dataset.assistantSize=prefs.assistant;document.dispatchEvent(new Event('salon:ease-change'))}
window.SalonEase={get:k=>prefs[k],set(k,v){if(!Object.hasOwn(allowed,k)||!allowed[k].includes(v))return false;prefs={...prefs,[k]:v};let saved=true;try{localStorage.setItem(key,JSON.stringify({v:1,...prefs}))}catch(_){saved=false}unsavedPrefs=!saved;paint();return saved}};
paint();
const mq=matchMedia('(prefers-color-scheme: dark)');
function readTheme(){let t;try{t=localStorage.getItem('salon_theme')}catch(_){}return ['light','dark'].includes(t)?t:'system'}
let choice=readTheme();
function resolved(){return choice==='system'?(mq.matches?'dark':'light'):choice}
function themePaint(){const mode=resolved();root.dataset.theme=mode;root.dataset.themeChoice=choice;const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=mode==='dark'?'#211c2b':'#f5f3ed';document.dispatchEvent(new Event('salon:appearance-change'));return mode}
const theme=window.SalonEaseTheme={choice:()=>choice,resolved,apply(mode,persist){if(persist&&['light','dark','system'].includes(mode)){choice=mode;theme.saved=true;try{if(mode==='system')localStorage.removeItem('salon_theme');else localStorage.setItem('salon_theme',mode)}catch(_){theme.saved=false}}return themePaint()},saved:true};
function syncTheme(){if(window.Salon?.theme?.apply)window.Salon.theme.apply(resolved(),false);else themePaint()}
mq.addEventListener('change',()=>{if(choice==='system')syncTheme()});
window.addEventListener('storage',e=>{if(e.key===key||e.key===null){prefs=read();unsavedPrefs=false;paint()}if(e.key==='salon_theme'||e.key===null){choice=readTheme();theme.saved=true;syncTheme()}});
window.addEventListener('pageshow',e=>{if(e.persisted){if(!unsavedPrefs)prefs=read();if(theme.saved)choice=readTheme();paint();syncTheme()}});
themePaint();
})();
