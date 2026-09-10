"""Nine subject entries from the verified release194 shell, with unchanged tariffs."""
from pathlib import Path
import subprocess,re,json,html
ROOT=Path(__file__).resolve().parents[5]
BASE='3c18690b90e25b73c056805c28f659f59533a0a7'
def old(n): return subprocess.check_output(['git','show',BASE+':'+n],cwd=ROOT,text=True)
def e(s): return html.escape(str(s),quote=True)
SUBJECTS={
'ekonomike':dict(label='экономике',disc='hum',price=14000,vkr=40000,
 intro='От исходных показателей до расчётов и выводов. Согласуем объект, период анализа и нужный раздел.',
 outline=['Тема, объект и подход к анализу','Расчёты по согласованным показателям','Выводы, таблицы и источники'],
 materials=['Тема, методичка и нужный объём','Период анализа и исходные показатели','Материалы организации, если она нужна'],
 limit='Расчёты опираются на доступные исходные данные. Если отчётности не хватает, до начала согласуем допустимые источники и границы анализа.',
 question='Можно работать на данных моей организации?',answer='Да. Передай обезличенные показатели за нужный период и требования кафедры. Сначала проверим, хватает ли данных для выбранного метода. Конфиденциальные реквизиты для расчётов не нужны.'),
'menedzhmentu':dict(label='менеджменту',disc='hum',price=14000,
 intro='Разберём организацию или процесс: что происходит, в чём проблема и чем обоснованы предложения.',
 outline=['Задача, организация и критерии анализа','Оценка процесса по доступным материалам','Предложения и их обоснование'],
 materials=['Тема и требования кафедры','Описание организации или процесса','Данные и ограничения для предложений'],
 limit='Для анализа конкретной компании нужны её материалы. Эффект предложений оцениваем по согласованным допущениям, без обещаний фактического роста показателей.',
 question='А если нет доступа к внутренним данным компании?',answer='Укажи, какие открытые материалы доступны. Согласуем объект и глубину анализа до начала. Не будем выдавать предположения за внутреннюю отчётность организации.'),
'pedagogike':dict(label='педагогике',disc='pedagogy',price=14000,
 intro='Свяжем педагогическую задачу, образовательный контекст и выводы. Вся курсовая или отдельная часть.',
 outline=['Педагогическая задача и теоретическая база','Анализ программы или материалов наблюдения','Выводы и согласованные рекомендации'],
 materials=['Тема, методичка и программа обучения','Возрастная группа и образовательный контекст','Обезличенные наблюдения, если есть'],
 limit='Если задание требует наблюдения или апробации, используем реальные материалы. Состав практической части и доступность данных согласуем до её начала.',
 question='Нужно ли уже иметь результаты наблюдения?',answer='Для теоретического раздела они могут не понадобиться. Для анализа практики уточним, что требует задание и какие обезличенные материалы у тебя есть. Проведённое наблюдение не придумываем.'),
'yurisprudencii':dict(label='юриспруденции',disc='jurisprudence',price=14000,vkr=40000,
 intro='От правового вопроса до аргументации по нормам и судебной практике. Согласуем отрасль, юрисдикцию и период.',
 outline=['Правовой вопрос и структура аргументации','Нормы и судебная практика по заданию','Выводы и ссылки на источники'],
 materials=['Тема, отрасль права и юрисдикция','Методичка и требования к источникам','Период анализа и заданные судебные акты'],
 limit='Актуальность норм проверяется на согласованную дату. Если кафедра требует конкретную подборку судебных актов или регион, укажи это в задании.',
 question='Можно использовать заданные преподавателем дела?',answer='Да. Приложи номера, ссылки или тексты актов и укажи, что нужно сопоставить. Период, юрисдикцию и требования к источникам закрепим вместе с темой.'),
'informatike':dict(label='информатике',disc='tech',price=18000,
 intro='Текст, алгоритм или программная часть. Сначала зафиксируем, что должно работать и в какой среде.',
 outline=['Постановка задачи и описание решения','Код или проект, если включён в задание','Проверки и инструкция запуска для проекта'],
 materials=['Задание, язык и среда разработки','Исходники и данные, если есть','Примеры входа, ожидаемый результат и срок'],
 limit='Разработка не включается автоматически в цену текста. Код, зависимости, среду запуска и проверяемые сценарии согласуем отдельно в составе заказа до оплаты.',
 question='Получится запустить проект на моём компьютере?',answer='Для заказа с программной частью заранее согласуем операционную систему, версии языка и зависимости. В состав такого проекта включим исходники и инструкцию запуска; платные лицензии и внешние сервисы обсудим отдельно.'),
'psihologii':dict(label='психологии',disc='psychology',price=17000,vkr=48500,
 intro='Тема, гипотезы, методики и выводы в одной логике. Поможем со всей работой, отдельной главой или готовым текстом.',
 outline=['Исследовательский вопрос и гипотезы','Методики и анализ обезличенных данных','Интерпретация, выводы и оформление'],
 materials=['Тема, методичка и план, если есть','Методики и описание выборки','Обезличенные данные и замечания'],
 limit='Расчёты выполняются по реальным обезличенным данным. Методы и выводы зависят от выборки; нужную значимость и подтверждение гипотез не обещаем.',
 question='А если данные ещё не собраны?',answer='Можно начать с теоретической главы, плана или согласования метода. Для расчётов понадобятся реальные обезличенные результаты. Этап исследования и необходимые материалы определим до начала этой части.')}
rows=[]
for subject,d in SUBJECTS.items():
 for product in ['course','diplom'] if 'vkr' in d else ['course']:
  prefix='kursovaya' if product=='course' else 'diplomnaya'
  slug=f'{prefix}-po-{subject}'
  original=old(slug+'.html');template=old('kursovaya-rabota.html' if product=='course' else 'diplomnaya-rabota.html')
  name=('Курсовая по ' if product=='course' else 'ВКР по ')+d['label']
  price=d['price'] if product=='course' else d['vkr'];money=f'{price:,}'.replace(',',' ')
  head=original.split('</head>')[0]+'</head>'
  # Use the verified shell's stylesheet list, retaining the discipline canonical/meta.
  styles=re.findall(r'<link[^>]+rel="stylesheet"[^>]*>',template.split('</head>')[0])
  head=re.sub(r'<link[^>]+rel="stylesheet"[^>]*>','',head).replace('</head>',''.join(styles)+'</head>')
  body=template.split('</head>')[1]
  body=body.replace('data-entry-product="'+product+'"','data-entry-product="'+product+'" data-entry-discipline="'+d['disc']+'"')
  body=re.sub(r'data-entry-base="\d+"','data-entry-base="'+str(price)+'"',body)
  body=re.sub(r'<h1>.*?</h1>',f'<h1>{e(name)}<br><em>В твоём объёме.</em></h1>',body,count=1)
  body=re.sub(r'(<div class="sen-intro">.*?</h1><p>).*?</p>',lambda m:m[1]+e(d['intro'])+'</p>',body,count=1,flags=re.S)
  body=re.sub(r'(<nav class="sen-breadcrumbs".*?<span>/</span><span>).*?</span></nav>',lambda m:m[1]+e(name)+'</span></nav>',body,count=1,flags=re.S)
  body=re.sub(r'(<strong data-entry-price>).*?</strong>',lambda m:m[1]+'от '+money+' ₽</strong>',body,count=1)
  outline=''.join(f'<li><span>{i+1:02}</span><strong>{e(x)}</strong></li>' for i,x in enumerate(d['outline']))
  body=re.sub(r'(<ol class="sen-document">).*?(<li class="sen-document-foot">)',lambda m:m[1]+outline+m[2],body,count=1)
  checklist=''.join('<label><input type="checkbox"><span>'+e(x)+'</span></label>' for x in d['materials'])
  body=re.sub(r'(<div class="sen-checklist">).*?</div>',lambda m:m[1]+checklist+'</div>',body,count=1)
  body=re.sub(r'<p class="sen-limit">.*?</p>','<p class="sen-limit">'+e(d['limit'])+'</p>',body,count=1)
  body=body.replace('<div class="sen-related">','<div class="sen-related"><a href="/'+('kursovaya-rabota.html' if product=='course' else 'diplomnaya-rabota.html')+'">Другие дисциплины ↗</a>')
  body=re.sub(r'<a href="/'+re.escape(slug)+r'\.html">.*?</a>','',body)
  faq='<details><summary>'+e(d['question'])+'</summary><p>'+e(d['answer'])+'</p></details>'
  body=body.replace('<section class="sen-faq"><h2>До заказа <em>обычно спрашивают.</em></h2><div>','<section class="sen-faq"><h2>До заказа <em>обычно спрашивают.</em></h2><div>'+faq)
  # Static links work without JavaScript; shared enhancer preserves this discipline.
  body=body.replace('product='+product+'&amp;result=', 'product='+product+'&amp;disc='+d['disc']+'&amp;result=')
  if product=='diplom' and subject=='psihologii':
   blocks=re.findall(r'<section class="section compact">.*?</section>',original,re.S)
   assert len(blocks)==2
   body=body.replace('<section class="sen-links"','<div class="sen-psychology">'+''.join(blocks)+'</div><section class="sen-links"',1)
  # Match visible subject and starting price, without invented review ratings.
  graphmatch=re.search(r'<script type="application/ld\+json">(.*?)</script>',body,re.S)
  graph=json.loads(graphmatch[1]);service=graph['@graph'][0]
  url='https://akademsalon.ru/'+slug+'.html'
  service.update({'@id':url+'#service','name':name,'url':url,'description':d['intro']})
  service['offers']['lowPrice']=price
  graph['@graph'][1]['itemListElement'][-1].update(name=name,item=url)
  body=body[:graphmatch.start(1)]+json.dumps(graph,ensure_ascii=False)+body[graphmatch.end(1):]
  (ROOT/(slug+'.html')).write_text(head+body)
  rows.append(dict(slug=slug,product=product,disc=d['disc'],price=price))
(ROOT/'docs/brain/evidence/salon-product/discipline-20260909/entries.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
