"""Build a reviewable SEO-only overlay from an exact public production snapshot.

Never changes the source snapshot, canonical product files, API or customer data.
Use: python3 scripts/salon-seo/build.py BASELINE OUTPUT --date YYYY-MM-DD
"""
from pathlib import Path
import argparse, hashlib, html, json, re, shutil, xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
HOST = 'https://akademsalon.ru'
ASSETS = '/assets/img/seo-20260911/'
VERSION = 'seo-20260911-v1'

META = {
 'index.html': ('Курсовые, ВКР и помощь с учебными работами | Академический Салон', 'Курсовая, ВКР, отчёт по практике или доработка по замечаниям. Выбери всю работу или нужную часть. Состав, срок и точная цена до оплаты. Заказ на сайте.'),
 'services.html': ('Курсовые, ВКР, рефераты: работы и цены | Академический Салон', 'Цены на курсовые, ВКР, рефераты и отчёты по практике. Работа целиком, отдельная глава, доработка или оформление. Выбери задачу и узнай условия до оплаты.'),
 'razbor-zamechaniy-nauchruka.html': ('Разбор замечаний научрука и план правок — от 2 500 ₽', 'Разберём замечания к курсовой или ВКР: что исправить, в каком порядке и как проверить результат. Письменный разбор от 2 500 ₽. Доработку можно заказать сразу.'),
 'normokontrol-vkr.html': ('Оформление курсовой и ВКР: нормоконтроль — от 5 000 ₽', 'Оформим курсовую или ВКР по методичке: поля, оглавление, ссылки, таблицы, рисунки и список литературы. Word и лист несоответствий. Состав и цена до оплаты.'),
 'komissiya-0.html': ('Репетиция защиты ВКР: доклад и вопросы комиссии | Салон', 'Проверь доклад до защиты: независимый редактор задаст вопросы и поможет увидеть слабые места. Репетиция защиты ВКР, разбор ответов и план подготовки.'),
 'knowledge.html': ('Курсовая и ВКР: примеры, оформление, защита | Библиотека Салона', 'Бесплатные инструкции по курсовой, ВКР и практике: план на неделю, введение, список литературы, оформление, презентация и речь. Примеры и проверка по шагам.'),
 'guide-kursovaya-za-nedelyu.html': ('Как написать курсовую за неделю: план на 7 дней', 'План курсовой на неделю: тема, источники, введение, главы, выводы и оформление. Что успеть за каждый день, как проверить готовность и когда сократить объём.'),
 'guide-prezentaciya-k-zashchite.html': ('Презентация к защите ВКР: план слайдов и чек-лист', 'Что включить в презентацию к защите ВКР: цель, методы, результаты и выводы. План слайдов, правила читаемости и чек-лист перед выступлением.'),
 'guide-recenziya-na-vkr.html': ('Рецензия на ВКР: структура, содержание и проверка', 'Что должно быть в рецензии на ВКР: актуальность, методы, результаты, замечания и вывод рецензента. Структура документа и проверка перед передачей на кафедру.'),
 'tools.html': ('Бесплатные инструменты для курсовой и ВКР | Академический Салон', 'Проверь текст, разберись с замечаниями научрука, подготовь тему и план исследования. Бесплатные инструменты Салона и понятный следующий шаг по работе.'),
}

def links(items):
 return '<ul>'+''.join(f'<li><a href="/{url}">{text}</a></li>' for url,text in items)+'</ul>'

def section(title, text, items, extra=''):
 return '<section class="seo-entry" data-seo-entry><h2>'+title+'</h2><p>'+text+'</p>'+extra+links(items)+'</section>'

BLOCKS = {
 'index.html': section('Курсовая, ВКР или несколько правок?', 'У каждой задачи свой объём. Посмотри состав работы и ориентир цены, а в заявке укажи срок и приложи требования.', [
  ('kursovaya-rabota.html','Курсовая работа'),('diplomnaya-rabota.html','Дипломная работа и ВКР'),('otchet-po-praktike.html','Отчёт по практике'),('referat.html','Реферат'),('magisterskaya-dissertaciya.html','Магистерская диссертация'),('nauchnaya-statya.html','Научная статья'),('razbor-zamechaniy-nauchruka.html','Разбор замечаний научрука'),('normokontrol-vkr.html','Оформление и нормоконтроль'),('komissiya-0.html','Репетиция защиты'),('guide-kursovaya-za-nedelyu.html','Курсовая за неделю: план по дням')]),
 'services.html': section('Текст уже есть?', 'Можно обратиться с конкретной задачей: понять замечания, исправить оформление или подготовиться к выступлению. Отдельный предварительный разбор покупать не обязательно.', [
  ('razbor-zamechaniy-nauchruka.html','Замечания научного руководителя'),('normokontrol-vkr.html','Оформление курсовой и ВКР'),('redaktura-posle-ii.html','Редактура текста после ИИ'),('komissiya-0.html','Репетиция защиты с редактором')]),
 'kursovaya-rabota.html': section('С чего начать именно тебе', 'Если тема уже есть, начни с плана и требований кафедры. Если вернули черновик, приложи замечания: можно заказать доработку готового текста.', [
  ('guide-kursovaya-za-nedelyu.html','Курсовая за неделю: что делать каждый день'),('guide-skolko-stoit-kursovaya.html','Из чего складывается стоимость'),('razbor-zamechaniy-nauchruka.html','Разобраться с замечаниями'),('normokontrol-vkr.html','Проверить оформление по методичке')]),
 'kursovaya-po-psihologii.html': section('Теория, методики и данные должны согласоваться', 'В курсовой по психологии сначала связывают тему, цель и выборку, затем выбирают подходящие методы. Для доработки нужны замечания и реальные исходные данные: выводы нельзя подгонять под ожидаемый результат.', [
  ('guide-obekt-predmet-cel-zadachi.html','Как связать объект, предмет, цель и задачи'),('guide-prakticheskaya-chast-kursovoy.html','Практическая часть: данные и анализ'),('razbor-zamechaniy-nauchruka.html','Разобрать замечания к курсовой'),('configurator.html?product=course&amp;result=editing&amp;discipline=psychology','Заказать доработку курсовой по психологии')]),
 'razbor-zamechaniy-nauchruka.html': section('Разбор или сразу доработка?', 'Разбор нужен, когда непонятно, что именно просит руководитель. Доработка подходит, когда нужно внести изменения в готовый текст. В обоих случаях передай замечания целиком и приложи методичку.', [
  ('configurator.html?service=rv','Заказать письменный разбор'),('configurator.html?product=course&amp;result=editing','Заказать доработку курсовой'),('configurator.html?product=diplom&amp;result=editing','Заказать доработку ВКР'),('guide-obekt-predmet-cel-zadachi.html','Самостоятельно проверить цель и задачи')],
  '<table><caption>Пример: как превратить замечание в действие</caption><thead><tr><th scope="col">Замечание</th><th scope="col">Следующий шаг</th><th scope="col">Как проверить</th></tr></thead><tbody><tr><td>«Уточнить задачи»</td><td>Сопоставить каждую задачу с разделом работы.</td><td>У каждой задачи есть результат в выводах.</td></tr><tr><td>«Нет анализа»</td><td>Добавить сравнение и объяснить различия по своим данным.</td><td>Вывод опирается на конкретную таблицу или источник.</td></tr><tr><td>«Не по методичке»</td><td>Найти точное требование и список затронутых мест.</td><td>Одинаковое правило выполнено во всей работе.</td></tr></tbody></table><small>Учебные примеры. Точный смысл замечания определяют по тексту работы и требованиям руководителя.</small>'),
 'normokontrol-vkr.html': section('Что подготовить для оформления', 'Нужны редактируемый файл Word, методичка кафедры и замечания нормоконтроля, если они уже есть. Укажи версию файла, которую нужно оформить, и крайний срок.', [
  ('guide-normocontrol.html','Самостоятельная проверка перед сдачей'),('guide-spisok-literatury.html','Ссылки и список литературы'),('guide-prilozheniya-po-gost.html','Приложения и ссылки на них'),('configurator.html?service=nm','Заказать оформление по методичке')]),
 'komissiya-0.html': section('Подготовка до репетиции', 'Собери доклад, слайды и текст работы. Отдельно выпиши вопросы по методам и результатам, на которые пока трудно ответить. Требования кафедры и регламент выступления важнее универсального шаблона.', [
  ('guide-prezentaciya-k-zashchite.html','Проверить структуру презентации'),('guide-rech-na-zashchitu.html','Подготовить речь к защите'),('guide-zashchita-diploma.html','Что происходит на защите'),('configurator.html?service=df','Заказать презентацию и речь')]),
 'guide-kursovaya-za-nedelyu.html': section('Каждый день заканчивается проверкой', 'План работает, если у каждого дня есть конкретный результат. Этот пример рассчитан на согласованную тему и доступные источники; сбор новых эмпирических данных может потребовать больше времени.', [
  ('kursovaya-rabota.html','Условия помощи с курсовой'),('razbor-zamechaniy-nauchruka.html','Разобрать замечания к черновику'),('normokontrol-vkr.html','Оформить текст по методичке')],
  '<table><caption>Проверяемый результат за 7 дней</caption><thead><tr><th scope="col">День</th><th scope="col">Что должно быть готово</th></tr></thead><tbody><tr><td>1</td><td>Согласованные тема и план, список требований и недостающих материалов.</td></tr><tr><td>2</td><td>Источники с выходными данными и заметками, где они нужны в работе.</td></tr><tr><td>3</td><td>Черновик теории: тезисы связаны с источниками и задачами.</td></tr><tr><td>4</td><td>Практическая часть по доступным данным, расчёты и таблицы проверены.</td></tr><tr><td>5</td><td>Выводы отвечают на задачи; введение соответствует полученным результатам.</td></tr><tr><td>6</td><td>Оформление, список литературы и приложения сверены с методичкой.</td></tr><tr><td>7</td><td>Финальное чтение, исправление несогласованностей, сохранение Word и PDF.</td></tr></tbody></table>'),
 'guide-vvedenie-kursovoy.html': section('Проверь, куда ведёт введение', 'Каждая задача из введения должна получить ответ в главах и выводах. Если дедлайн близко, сначала распредели оставшиеся части по дням.', [('guide-kursovaya-za-nedelyu.html','План курсовой на семь дней'),('razbor-zamechaniy-nauchruka.html','Разбор замечаний к введению')]),
 'guide-zashchita-diploma.html': section('Проверить себя до комиссии', 'Проговори доклад вслух с таймером. Убедись, что можешь объяснить выбор методов, источники данных и каждый вывод. Репетиция помогает найти места, которые требуют уточнения.', [('komissiya-0.html','Репетиция защиты с независимым редактором'),('normokontrol-vkr.html','Оформление ВКР перед сдачей')]),
}

CONTEXT = {
 'guide-prilozheniya-po-gost.html':'nm', 'guide-normocontrol.html':'nm',
 'guide-titulnyj-list.html':'nm', 'guide-spisok-literatury.html':'nm',
 'guide-prezentaciya-k-zashchite.html':'df', 'guide-zashchita-diploma.html':'df',
 'guide-rech-na-zashchitu.html':'df',
}

def meta(s, key, value, attr='name'):
 tag=f'<meta {attr}="{key}" content="{html.escape(str(value),quote=True)}">'
 pattern=rf'<meta\b(?=[^>]*\b{attr}=[\"\']{re.escape(key)}[\"\'])[^>]*>'
 if re.search(pattern,s,re.I):return re.sub(pattern,lambda m:tag,s,count=1,flags=re.I)
 return s.replace('</head>',tag+'</head>',1)

def cover(file):
 if file=='index.html':return 'home'
 if 'zamechani' in file or 'dosie' in file:return 'review'
 if any(x in file for x in ['normo','gost','literatury','titulnyj']):return 'formatting'
 if any(x in file for x in ['zash','prezent','rech','komissiya']):return 'defense'
 if file.startswith('guide-') or file in ['knowledge.html','tools.html','check.html']:return 'library'
 if 'kursov' in file:return 'course'
 return 'home'

def schema_walk(value, file, date, content_changed):
 if isinstance(value,list):return [schema_walk(x,file,date,content_changed) for x in value]
 if isinstance(value,str):
  if value==HOST+'/#org':return HOST+'/#organization'
  if value.startswith(HOST+'/assets/img/') and ('og' in value or 'icon-' in value):
   return HOST+ASSETS+('icon-512.png' if 'icon-' in value else 'og-'+cover(file)+'.png')
  return value
 if not isinstance(value,dict):return value
 out={k:schema_walk(v,file,date,content_changed) for k,v in value.items()}
 if out.get('@type')=='BreadcrumbList':
  for item in out.get('itemListElement',[]):
   if item.get('item')==HOST+'/tariffs.html':item.update(item=HOST+'/services.html',name='Работы и цены')
 if out.get('@type')=='Organization' and out.get('@id')==HOST+'/#organization':
  out['logo']={'@type':'ImageObject','url':HOST+ASSETS+'icon-512.png','width':512,'height':512}
 if out.get('@type') in ['Article','BlogPosting'] and content_changed:out['dateModified']=date
 if out.get('@type')=='WebSite':out['alternateName']=['Академсалон','Академический салон']
 return out

def transform(s,file,date):
 # Replace every old icon declaration with one coherent, cache-safe set.
 s=re.sub(r'<link\b(?=[^>]*\brel=[\"\'](?:icon|shortcut icon|apple-touch-icon|mask-icon)[\"\'])[^>]*>','',s,flags=re.I)
 icons=f'<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="{ASSETS}icon-96.png" type="image/png" sizes="96x96"><link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48"><link rel="apple-touch-icon" href="{ASSETS}icon-180.png" sizes="180x180">'
 s=s.replace('</head>',icons+'</head>',1)
 s=meta(s,'theme-color','#5136b5')
 if file in META:
  title,description=META[file]
  s=re.sub(r'<title>.*?</title>',lambda m:'<title>'+html.escape(title)+'</title>',s,count=1,flags=re.S)
  for key,attr,val in [('description','name',description),('og:title','property',title),('og:description','property',description),('twitter:title','name',title),('twitter:description','name',description)]:s=meta(s,key,val,attr)
 image=HOST+ASSETS+'og-'+cover(file)+'.png'
 for key,val in [('og:image',image),('og:image:width',1200),('og:image:height',630),('og:image:alt','Академический Салон — '+html.unescape(re.search(r'<title>(.*?)</title>',s,re.S)[1])),('og:image:type','image/png')]:s=meta(s,key,val,'property')
 s=meta(s,'twitter:card','summary_large_image');s=meta(s,'twitter:image',image)
 if not re.search(r'<meta[^>]*name="robots"[^>]*noindex',s,re.I):s=meta(s,'robots','index,follow,max-image-preview:large')
 changed=False
 if file=='index.html':
  # Mobile hides these BRs; spaces keep the three words from becoming one
  # unbreakable string that widened the live homepage to 411px at 360/390px.
  s=s.replace('«Переделать.<br>Уточнить.<br>Обосновать».','«Переделать.<br> Уточнить.<br> Обосновать».')
 if file in CONTEXT:
  a=s.index('<main');b=s.index('</main>')+7;body=s[a:b]
  # Only article-local contextual CTAs; global order controls keep their default.
  body=body.replace('href="configurator.html"',f'href="configurator.html?service={CONTEXT[file]}"')
  if file in ['guide-normocontrol.html','guide-zashchita-diploma.html']:
   body=re.sub(r'(<a\b[^>]*href=")check\.html("[^>]*>[^<]*(?:нормоконтрол|оформлен)[^<]*</a>)',r'\1normokontrol-vkr.html\2',body)
  s=s[:a]+body+s[b:]
 if file=='guide-kursovaya-za-nedelyu.html':
  old='Мастерская не выполняет содержательную часть курсовой вместо студента; доступный объём сопровождения можно заранее'
  s=s.replace(old,'Объём помощи и срок согласовываются по твоим материалам; доработку готового текста можно заранее')
  s=s.replace('href="check.html">нормоконтроль и вычитку','href="normokontrol-vkr.html">нормоконтроль и вычитку')
  s=s.replace('href="configurator.html">оценить в конфигураторе','href="configurator.html?product=course&amp;result=editing">оценить в заявке')
  s=s.replace('<h1>Как спланировать курсовую на семь дней</h1>','<h1>Как написать курсовую за неделю: план на 7 дней</h1>')
  # The visible FAQ and its structured answer stay aligned.
  s=s.replace('Мастерская не выполняет содержательную часть курсовой вместо студента','Объём помощи и срок согласовываются по материалам работы')
  changed=True
 if file=='razbor-zamechaniy-nauchruka.html':
  s=s.replace('<h1>Из «переделать».<br><em>В понятный порядок.</em></h1>','<h1>Разбор замечаний.<br><em>Понятный план правок.</em></h1>')
 if file in BLOCKS:
  # Guides keep the authored addition inside the article, before related reading.
  marker='</article>' if file.startswith('guide-') else '</main>'
  assert marker in s,file
  s=s.replace(marker,BLOCKS[file]+marker,1)
  css_hash=hashlib.sha256((ROOT/'scripts/salon-seo/search-entry.css').read_bytes()).hexdigest()[:12]
  s=s.replace('</head>',f'<link rel="stylesheet" href="/assets/css/seo-search-entry.css?v={VERSION}&amp;r={css_hash}"></head>',1)
  changed=True
 if changed and file.startswith('guide-'):
  year,month,day=map(int,date.split('-'))
  months=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря']
  s=re.sub(r'(<p class="doc-meta">Обновлено )\d+ [а-яё]+ \d{4}',lambda m:m[1]+f'{day} {months[month-1]} {year}',s)
 def ld(m):
  data=schema_walk(json.loads(m[1]),file,date,changed)
  if file=='guide-kursovaya-za-nedelyu.html' and data.get('@type')=='Article':data['headline']='Как написать курсовую за неделю: план на 7 дней'
  return '<script type="application/ld+json">'+json.dumps(data,ensure_ascii=False,separators=(',',':'))+'</script>'
 s=re.sub(r'<script\s+type="application/ld\+json">(.*?)</script>',ld,s,flags=re.S)
 return s,changed

def inventory(root):
 return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(root.rglob('*')) if p.is_file()}

def build(baseline,out,date):
 baseline=baseline.resolve();out=out.resolve()
 assert baseline!=out and baseline not in out.parents and out not in baseline.parents
 assert not out.exists(),'Output must be a new directory; baseline is never changed.'
 assert re.fullmatch(r'\d{4}-\d{2}-\d{2}',date)
 before=inventory(baseline);assert 'index.html' in before and 'sw.js' in before
 shutil.copytree(baseline,out)
 shutil.copytree(ROOT/'assets/img/seo-20260911',out/'assets/img/seo-20260911',dirs_exist_ok=True)
 shutil.copy2(ROOT/'scripts/salon-seo/search-entry.css',out/'assets/css/seo-search-entry.css')
 asset=out/'assets/img/seo-20260911'
 for src,dest in [('favicon.svg','favicon.svg'),('favicon.svg','assets/img/favicon.svg'),('icon-32.png','assets/img/favicon-32.png'),('icon-120.png','assets/img/favicon-120.png'),('icon-180.png','assets/img/apple-touch-icon.png'),('icon-192.png','assets/img/icon-192.png'),('icon-512.png','assets/img/icon-512.png'),('icon-maskable-512.png','assets/img/icon-maskable-512.png'),('favicon.ico','favicon.ico')]:shutil.copy2(asset/src,out/dest)
 old_version=re.search(r"const VERSION = '([^']+)'",(out/'sw.js').read_text())[1]
 content=[]
 for file in sorted(out.glob('*.html')):
  s,changed=transform(file.read_text(),file.name,date)
  s=s.replace(old_version,VERSION)
  file.write_text(s)
  if changed:content.append(file.name)
 sw=(out/'sw.js').read_text().replace(old_version,VERSION)
 (out/'sw.js').write_text(sw)
 manifest=json.loads((out/'manifest.webmanifest').read_text())
 manifest.update(name='Академический Салон',short_name='Академсалон',theme_color='#5136b5',background_color='#faf9f6')
 for icon in manifest['icons']:
  icon['src']=ASSETS+Path(icon['src']).name
 for shortcut in manifest.get('shortcuts',[]):
  for icon in shortcut.get('icons',[]):icon['src']=ASSETS+'icon-192.png'
 (out/'manifest.webmanifest').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
 # Preserve honest historical lastmod for head/icon-only changes. Content changes get today's date.
 ns={'s':'http://www.sitemaps.org/schemas/sitemap/0.9'}
 tree=ET.parse(out/'sitemap.xml');ET.register_namespace('',ns['s'])
 for url in tree.getroot():
  loc=url.find('s:loc',ns).text
  file='index.html' if loc==HOST+'/' else loc.rsplit('/',1)[-1]
  if file in content:
   last=url.find('s:lastmod',ns)
   if last is None:last=ET.SubElement(url,'{'+ns['s']+'}lastmod')
   last.text=date
 tree.write(out/'sitemap.xml',encoding='utf-8',xml_declaration=True)
 # Atom reflects only substantive guide updates; preserve publication dates.
 if (out/'feed.xml').exists():
  atom={'a':'http://www.w3.org/2005/Atom'}
  feed=ET.parse(out/'feed.xml');ET.register_namespace('',atom['a'])
  for entry in feed.getroot().findall('a:entry',atom):
   identity=entry.find('a:id',atom)
   if identity is not None and identity.text.rsplit('/',1)[-1] in content:
    entry.find('a:updated',atom).text=date+'T00:00:00Z'
  feed.getroot().find('a:updated',atom).text=max(x.text for x in feed.getroot().findall('a:entry/a:updated',atom))
  feed.write(out/'feed.xml',encoding='utf-8',xml_declaration=True)
 after=inventory(out)
 report={'date':date,'baseline_files':before,'files':after,'changed':[f for f in after if before.get(f)!=after[f]],'deleted':sorted(set(before)-set(after)),'content_updated':content,'sw_version':VERSION}
 return report

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('baseline',type=Path);p.add_argument('output',type=Path);p.add_argument('--date',required=True);p.add_argument('--report',type=Path,required=True);a=p.parse_args()
 result=build(a.baseline,a.output,a.date);a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({k:v for k,v in result.items() if k not in ['baseline_files','files']},ensure_ascii=False))
