import fs from 'node:fs';
const files=fs.readdirSync('.').filter(x=>x.endsWith('.html')&&!x.startsWith('admin'));
const excluded=new Set(['404.html','50x.html','maintenance.html','offline.html','oplaceno.html','zayavka.html','dashboard.html','check.html']);
const rows=files.filter(x=>!excluded.has(x)).map(path=>{
 const html=fs.readFileSync(path,'utf8');
 const raw=html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]||path;
 const title=raw.replace(/\s*[|—–]\s*Академическ[\s\S]*/i,'').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/<[^>]+>/g,'').trim();
 const kind=path.startsWith('guide-')?'Инструкция':/consent|privacy|oferta|loyalty|terms|requisites|refunds|integrity/.test(path)?'Условия':/plus|benefits|deposit|referral|gift/.test(path)?'Выгода':'Раздел';
 return {path,title,kind};
});
const priority=['services.html','samples.html','benefits.html','configurator.html','knowledge.html','plus.html','gift.html','prolog.html','reviews.html','priyomnaya.html'];
rows.sort((a,b)=>{const ai=priority.indexOf(a.path),bi=priority.indexOf(b.path);return (ai<0?99:ai)-(bi<0?99:bi)||a.title.localeCompare(b.title,'ru')});
const target='assets/js/salon-experience.js';
fs.writeFileSync(target,fs.readFileSync(target,'utf8').replace(/\/\* ROUTES_START \*\/[\s\S]*?\/\* ROUTES_END \*\//,'/* ROUTES_START */'+JSON.stringify(rows)+'/* ROUTES_END */'));
fs.mkdirSync('docs/brain/evidence/salon-product',{recursive:true});
fs.writeFileSync('docs/brain/evidence/salon-product/routes.json',JSON.stringify(files.map(path=>({path,experience:fs.readFileSync(path,'utf8').includes('assets/css/salon-experience.css'),concurrentOwner:path==='zero-classes.html',selfContained:path==='offline.html'})),null,2)+'\n');
console.log(`${files.length} customer routes inventoried, ${rows.length} searchable`);
