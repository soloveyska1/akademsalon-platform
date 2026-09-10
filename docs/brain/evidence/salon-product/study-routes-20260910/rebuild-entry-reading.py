from pathlib import Path
import subprocess,re,html
ROOT=Path(__file__).resolve().parents[5]
BASE='ccb1d12b20e48d58ba2d1b909406d6c4215e3719'
def old(name):return subprocess.check_output(['git','show',BASE+':'+name],cwd=ROOT,text=True)
def e(s):return html.escape(s,quote=True)
META={
'guide-skolko-stoit-kursovaya.html':('₽','БЮДЖЕТ','Что влияет на смету и где можно выбрать меньший объём.'),
'guide-skolko-stoit-diplomnaya.html':('₽','БЮДЖЕТ','Разобраться в составе ВКР и подготовить требования к расчёту.'),
'guide-vvedenie-kursovoy.html':('Аа','СТРУКТУРА','Связать актуальность, цель и задачи в одно введение.'),
'guide-vkr-struktura.html':('Аа','СТРУКТУРА','Проверить, как тема, задачи и главы связаны между собой.'),
'guide-zashchita-diploma.html':('↗','ЗАЩИТА','Собрать материалы и подготовиться к вопросам комиссии.'),
'guide-otchet-po-praktike.html':('≡','ПРАКТИКА','Понять структуру отчёта и какие исходные материалы нужны.'),
'guide-dnevnik-praktiki.html':('≡','ПРАКТИКА','Зафиксировать реальные задачи и результаты по дням.'),
'guide-spisok-literatury.html':('Ая','ИСТОЧНИКИ','Проверить записи в списке и ссылки в самом тексте.'),
'guide-titulnyj-list.html':('Аа','ОФОРМЛЕНИЕ','Сверить реквизиты титульного листа с требованиями кафедры.'),
'guide-rinc-statya.html':('Аа','ПУБЛИКАЦИЯ','Разделить подготовку текста и подачу в выбранное издание.')}
count=0
for p in ROOT.glob('*.html'):
 source=old(p.name) if re.match(r'(kursovaya|diplomnaya|magisterskaya|kandidatskaya|otchet-po-praktike|referat|nauchnaya-statya)',p.name) else ''
 if 'data-service-entry' not in source:continue
 reading=re.search(r'<section class="sen-reading">.*?</section>',source,re.S)[0]
 items=re.findall(r'<a href="([^"]+)">(.*?)</a>',reading,re.S)
 guides=[(u,html.unescape(re.sub('<[^>]+>','',label)).replace('↗','').strip()) for u,label in items[:2]]
 related=re.search(r'<div class="sen-related">(.*?)</div>',reading,re.S)[1]
 related=related.replace(' ↗','').replace('Другие дисциплины','Все направления')
 cards=[]
 for i,(u,title) in enumerate(guides):
  icon,kind,desc=META.get(u.lstrip('/'),('Аа','РАЗБОР','Состав, требования и следующий шаг по твоей задаче.'))
  cards.append(f'<a class="sen-guide sen-guide-{i}" href="{e(u)}"><span class="sen-guide-mark" aria-hidden="true">{e(icon)}</span><div><span class="sen-guide-kind">{kind}</span><h3>{e(title)}</h3><p>{e(desc)}</p></div><span class="sen-guide-arrow" aria-hidden="true">↗</span></a>')
 new='<section class="sen-reading"><div class="sen-reading-heading"><div><span class="eyebrow">ПОЛЕЗНО ПО ТВОЕЙ ТЕМЕ</span><h2>На нужной <em>странице.</em></h2></div><a class="sen-library-link" href="/knowledge.html">Вся библиотека <span aria-hidden="true">↗</span></a></div><div class="sen-reading-cards">'+''.join(cards)+'</div><nav class="sen-related" aria-label="Другие направления и форматы"><span>Ещё по теме</span>'+related+'</nav></section>'
 source=source.replace(reading,new)
 source=source.replace('<section class="sen-faq"><h2>До заказа <em>обычно спрашивают.</em></h2><div>','<section class="sen-faq"><div class="sen-faq-intro"><span class="eyebrow">БЕЗ НЕДОСКАЗАННОСТИ</span><h2>Вопросы<br><em>до начала.</em></h2><p>Что входит в работу, как уточняется цена и когда начинается отсчёт срока.</p><a href="/guarantees.html">Все условия <span aria-hidden="true">↗</span></a></div><div class="sen-faq-items">')
 p.write_text(source);count+=1
assert count==16,count
print('Rebuilt',count,'entry reading/FAQ components')
