import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const sharp=require(process.env.SALON_SHARP_PATH||'sharp');
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,'assets/img/seo-20260911');
mkdirSync(out,{recursive:true});
const svg=readFileSync(resolve(out,'favicon.svg'),'utf8');
for(const size of [16,32,48,96,120,180,192,512])await sharp(Buffer.from(svg)).resize(size,size).png().toFile(resolve(out,`icon-${size}.png`));
// Full-bleed background, all foreground pixels inside the central safe circle.
const mask=svg.replace('<rect width="64" height="64" rx="15" fill="#5136b5"/>','<rect width="64" height="64" fill="#5136b5"/><g transform="translate(9.6 9.6) scale(.7)">').replace('</svg>','</g></svg>');
writeFileSync(resolve(out,'maskable.svg'),mask);
await sharp(Buffer.from(mask)).resize(512,512).png().toFile(resolve(out,'icon-maskable-512.png'));
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;');
const covers={
 home:['Курсовая. ВКР.','Твоя задача.','Работа целиком, отдельная глава или доработка'],
 course:['Курсовая работа','без лишней суеты.','Состав, срок и точная цена до оплаты'],
 review:['Замечания научрука.','План исправлений.','Разбор по пунктам и помощь с доработкой'],
 formatting:['Оформление.','Всё на своих местах.','Методичка, ссылки, таблицы и список литературы'],
 defense:['Твоя работа.','Твоя защита.','Презентация, речь и репетиция выступления'],
 library:['Разобраться.','И сделать самому.','Практические разборы, примеры и инструменты']
};
for(const [id,[a,b,sub]] of Object.entries(covers)){
 const content=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#faf9f6"/><rect x="28" y="28" width="1144" height="574" rx="32" fill="#4934ad"/><g transform="translate(78 74) scale(1.1)">${svg.replace(/<svg[^>]*>|<\/svg>|<title>.*?<\/title>/g,'')}</g><text x="170" y="102" fill="#fcfbff" font-size="29" font-family="Arial, sans-serif" font-weight="600">Академический Салон</text><text x="170" y="132" fill="#e0d7ff" font-size="19" font-family="Arial, sans-serif">akademsalon.ru</text><text x="78" y="277" fill="#fcfbff" font-size="69" font-family="Arial, sans-serif" font-weight="600" letter-spacing="-2">${esc(a)}</text><text x="78" y="365" fill="#d9f5bb" font-size="69" font-family="Arial, sans-serif" font-weight="600" letter-spacing="-2">${esc(b)}</text><path d="M80 411h1040" stroke="#8874cb"/><text x="78" y="466" fill="#fcfbff" font-size="29" font-family="Arial, sans-serif">${esc(sub)}</text><text x="78" y="550" fill="#e0d7ff" font-size="22" font-family="Arial, sans-serif">Понятные условия. Прямой заказ на сайте.</text></svg>`;
 writeFileSync(resolve(out,`og-${id}.svg`),content);
 await sharp(Buffer.from(content)).png({palette:true}).toFile(resolve(out,`og-${id}.png`));
}
console.log('Generated 8 icon sizes, maskable icon and 6 social covers.');
