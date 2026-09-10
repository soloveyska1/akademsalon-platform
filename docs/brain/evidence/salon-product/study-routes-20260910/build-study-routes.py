from pathlib import Path
import subprocess,re,json,html
ROOT=Path(__file__).resolve().parents[5];BASE='ccb1d12b20e48d58ba2d1b909406d6c4215e3719'
def old(n):return subprocess.check_output(['git','show',BASE+':'+n],cwd=ROOT,text=True)
def e(s):return html.escape(str(s),quote=True)
D={
'course':{'label':'Курсовая','service':'kursovaya-rabota.html','plans':{
'starting':[('obekt-predmet-cel-zadachi','Связать тему и задачи','Проверь, что именно исследуешь и к какому результату идёшь.'),('vvedenie-kursovoy','Собрать введение','Разложи актуальность, цель и методы по своим местам.'),('skolko-stoit-kursovaya','Прикинуть состав и бюджет','Разберись, что влияет на объём помощи и стоимость.')],
'writing':[('vvedenie-kursovoy','Проверить логику введения','Сопоставь цель и задачи с тем, что уже написано.'),('prakticheskaya-chast-kursovoy','Спланировать практическую часть','Определи, какие реальные данные и методы нужны.'),('zaklyuchenie-kursovoy','Собрать выводы','Покажи, как выполненные задачи привели к результату.')],
'finishing':[('zaklyuchenie-kursovoy','Сверить выводы с задачами','Проверь смысловую связность готовой работы.'),('spisok-literatury','Привести в порядок источники','Сопоставь список литературы и ссылки в тексте.'),('normocontrol','Пройти проверку оформления','Сверь готовую версию с требованиями кафедры.')]}},
'practice':{'label':'Практика','service':'otchet-po-praktike.html','plans':{
'starting':[('otchet-po-praktike','Понять состав отчёта','Сверь программу практики и будущие разделы.'),('dnevnik-praktiki','Организовать дневник','Записывай реальные задачи и результаты по дням.'),('harakteristika-s-praktiki','Уточнить, кто готовит характеристику','Заранее узнай, какие сведения и согласования нужны.')],
'writing':[('dnevnik-praktiki','Собрать записи о работе','Проверь даты, задачи и результаты своей практики.'),('otchet-po-praktike','Превратить материалы в отчёт','Свяжи выполненные задачи с разделами документа.'),('prilozheniya-po-gost','Подготовить приложения','Вынеси дополнительные материалы и свяжи их с текстом.')],
'finishing':[('otchet-po-praktike','Сверить комплект отчёта','Проверь структуру и требования программы практики.'),('prilozheniya-po-gost','Проверить приложения','Убедись, что в тексте есть нужные ссылки на материалы.'),('titulnyj-list','Проверить титульный лист','Сверь реквизиты и подписи с образцом кафедры.')]}},
'diplom':{'label':'ВКР','service':'diplomnaya-rabota.html','plans':{
'starting':[('temy-vkr','Сузить тему','Выбери вопрос, который можно раскрыть на доступных данных.'),('obekt-predmet-cel-zadachi','Связать цель и задачи','Проверь границы исследования и ожидаемый результат.'),('vkr-struktura','Собрать основу введения','Свяжи тему, методы и будущую структуру работы.')],
'writing':[('vkr-struktura','Сверить введение с главами','Проверь, что задачи действительно раскрываются в тексте.'),('spisok-literatury','Упорядочить источники','Проверь записи и ссылки, пока работа ещё в процессе.'),('zaklyuchenie-vkr','Сформулировать результаты','Сопоставь выводы с поставленными задачами.')],
'finishing':[('zashchita-diploma','Подготовиться к защите','Проверь комплект материалов и порядок выступления.'),('prezentaciya-k-zashchite','Собрать слайды','Выбери главное, что стоит показать комиссии.'),('rech-na-zashchitu','Подготовить речь','Собери связное выступление по своей работе.')]}}
}
STAGES={'starting':'Начинаю','writing':'Пишу','finishing':'Завершаю'}
for work in D.values():
 for stage,plan in work['plans'].items():work['plans'][stage]=[{'url':'guide-'+slug+'.html','title':title,'note':note} for slug,title,note in plan]
def rows(plan):return ''.join(f'<li><a href="{x["url"]}"><span class="lr-route-number" aria-hidden="true">{i+1:02}</span><span><strong>{e(x["title"])}</strong><small>{e(x["note"])}</small></span><span class="lr-route-arrow" aria-hidden="true">↗</span></a></li>' for i,x in enumerate(plan))
controls='<div class="lr-route-controls"><fieldset><legend>Какая работа?</legend><div>'+''.join(f'<button type="button" data-study-work="{k}" aria-pressed="{str(k=="course").lower()}">{v["label"]}</button>' for k,v in D.items())+'</div></fieldset><fieldset><legend>На каком ты этапе?</legend><div>'+''.join(f'<button type="button" data-study-stage="{k}" aria-pressed="{str(k=="starting").lower()}">{v}</button>' for k,v in STAGES.items())+'</div></fieldset></div>'
block='<details class="lr-route" id="study-route" data-study-route><summary><span class="lr-route-symbol" aria-hidden="true">↳</span><span><strong>Маршрут по твоей задаче</strong><small>Три полезных разбора в нужном порядке</small></span><span class="lr-route-toggle" aria-hidden="true">+</span></summary><div class="lr-route-body">'+controls+'<p class="lr-route-caption" data-study-caption>Курсовая · Начинаю</p><ol class="lr-route-list" data-study-list>'+rows(D['course']['plans']['starting'])+'</ol><div class="lr-route-actions"><button type="button" data-study-copy hidden>Скопировать маршрут <span aria-hidden="true">↗</span></button><a data-study-help href="kursovaya-rabota.html">Помощь с курсовой ↗</a></div><p class="lr-route-status" data-study-status role="status"></p><div class="lr-route-fallback" data-study-fallback hidden><label for="study-share-url">Скопируй ссылку на маршрут</label><input id="study-share-url" data-study-link type="url" readonly></div><noscript><p>Здесь показан маршрут для начала курсовой. Все остальные материалы доступны в библиотеке ниже.</p></noscript><script type="application/json" data-study-data>'+json.dumps(D,ensure_ascii=False).replace('<','\\u003c')+'</script></div></details>'
s=old('knowledge.html');s=s.replace('<section class="lr-catalog"',block+'<section class="lr-catalog"',1);(ROOT/'knowledge.html').write_text(s)
# Curated onward path. Source article contents remain exactly unchanged.
G={
'antiplagiat-ai':('diplom','writing','redaktura-posle-ii.html','Редактура готового текста'),
'apellyaciya':('diplom','finishing','priyomnaya.html','Обсудить свою ситуацию'),
'dnevnik-praktiki':('practice','writing','configurator.html?product=practice&result=part','Помощь с частью отчёта'),
'harakteristika-s-praktiki':('practice','starting','otchet-po-praktike.html','Помощь с отчётом по практике'),
'kursovaya-za-nedelyu':('course','writing','kursovaya-rabota.html','Выбрать объём и срок курсовой'),
'normocontrol':('diplom','finishing','normokontrol-vkr.html','Разобраться с требованиями нормоконтроля'),
'obekt-predmet-cel-zadachi':('diplom','starting','plan.html','Помощь с темой и планом'),
'otchet-po-praktike':('practice','writing','otchet-po-praktike.html','Выбрать состав отчёта'),
'otzyv-rukovoditelya-vkr':('diplom','finishing','diplomnaya-rabota.html','Помощь с подготовкой ВКР'),
'prakticheskaya-chast-kursovoy':('course','writing','configurator.html?product=course&result=part','Помощь с практической частью'),
'prezentaciya-k-zashchite':('diplom','finishing','configurator.html?service=df','Презентация и речь к защите'),
'prilozheniya-po-gost':('diplom','finishing','normokontrol-vkr.html','Сверить требования к оформлению'),
'recenziya-na-vkr':('diplom','finishing','diplomnaya-rabota.html','Помощь с подготовкой ВКР'),
'rech-na-zashchitu':('diplom','finishing','configurator.html?service=df','Презентация и речь к защите'),
'rinc-statya':(None,None,'nauchnaya-statya.html','Помощь с текстом статьи'),
'skolko-stoit-diplomnaya':('diplom','starting','diplomnaya-rabota.html','Выбрать состав и срок ВКР'),
'skolko-stoit-kursovaya':('course','starting','kursovaya-rabota.html','Выбрать состав и срок курсовой'),
'spisok-literatury':('diplom','writing','normokontrol-vkr.html','Сверить требования к оформлению'),
'temy-vkr':('diplom','starting','plan.html','Помощь с темой и планом'),
 'titulnyj-list':('diplom','finishing','normokontrol-vkr.html','Сверить требования к оформлению'),
'vkr-struktura':('diplom','writing','configurator.html?product=diplom&result=part','Помощь с введением ВКР'),
'vvedenie-kursovoy':('course','writing','configurator.html?product=course&result=part','Помощь с введением курсовой'),
'zaklyuchenie-kursovoy':('course','finishing','configurator.html?product=course&result=part','Помощь с заключением курсовой'),
'zaklyuchenie-vkr':('diplom','finishing','configurator.html?product=diplom&result=part','Помощь с заключением ВКР'),
'zashchita-diploma':('diplom','finishing','configurator.html?service=df','Презентация и речь к защите')}
for slug,(work,stage,service,label) in G.items():
 filename='guide-'+slug+'.html';s=old(filename)
 if work:
  plan=D[work]['plans'][stage];nextitem=next(x for x in plan if x['url']!=filename);route=f'knowledge.html?work={work}&stage={stage}#study-route';routeLabel='Весь маршрут'
 else:
  nextitem={'url':'guide-spisok-literatury.html','title':'Проверить список источников','note':'Сверь ссылки и библиографические записи перед подачей.'};route='knowledge.html?topic=publication';routeLabel='Материалы о публикации'
 block=f'<section class="lr-next" data-guide-next aria-label="Продолжить по теме"><div class="lr-next-heading"><h2>Дальше <em>по твоей задаче.</em></h2><a href="{e(route)}">{routeLabel} ↗</a></div><div class="lr-next-grid"><a class="lr-next-reading" href="{nextitem["url"]}"><span>СЛЕДУЮЩИЙ РАЗБОР</span><strong>{e(nextitem["title"])}</strong><p>{e(nextitem["note"])}</p><b aria-hidden="true">↗</b></a><a class="lr-next-help" href="{e(service)}"><span>ЕСЛИ НУЖНА ПОМОЩЬ</span><strong>{e(label)}</strong><p>Состав, условия и следующий шаг по твоей задаче.</p><b aria-hidden="true">↗</b></a></div></section>'
 s=s.replace('</article></div>','</article>'+block+'</div>',1);(ROOT/filename).write_text(s)
assert len(G)==25
out=ROOT/'docs/brain/evidence/salon-product/study-routes-20260910'
(out/'route-data.json').write_text(json.dumps(D,ensure_ascii=False,indent=2)+'\n');(out/'guide-map.json').write_text(json.dumps(G,ensure_ascii=False,indent=2)+'\n')
