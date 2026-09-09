from pathlib import Path
import re,json,subprocess
ROOT=Path(__file__).resolve().parents[5]
BASE='5ba9917a1d4b'; ICONS={
'menu':'<path d="M4 8h16M4 16h16"/>',
'close':'<path d="m6 6 12 12M6 18 18 6"/>',
'account':'<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
'search':'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
'theme':'<path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/>'}
def icon(n):return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">'+ICONS[n]+'</svg>'
def link(url,label,cls=''):return '<a'+(' class="'+cls+'"' if cls else '')+' href="'+url+'">'+label+'</a>'
def header(name,entry_order=""):
 order='#direct-order' if name=='configurator.html' else entry_order or 'configurator.html'
 brand='''<a class="sh-brand" href="/" aria-label="Академический Салон — главная"><svg class="sh-emblem" viewBox="0 0 44 48" fill="none" aria-hidden="true"><path d="M8 6h24v35H8z" fill="currentColor" opacity=".17" transform="rotate(-9 20 24)"/><path d="M10 3h19l9 9v32H10z" fill="currentColor"/><path d="M29 3v9h9" fill="white" opacity=".35"/><path d="M17 25c0-7 13-7 13 0v9m-1-8c-14-2-13 11-1 6" stroke="var(--sh-mark-ink)" stroke-width="2.4" stroke-linecap="round"/><circle cx="33" cy="34" r="1.4" fill="var(--sh-mark-ink)"/></svg><span class="sh-wordmark"><span>Академический</span><strong>Салон<span>.</span></strong></span></a>'''
 nav=[('services.html','Работы и цены'),('samples.html','Примеры'),('benefits.html','Выгоды'),('knowledge.html','Библиотека')]
 groups=[('РАБОТА', [('services.html','Работы и цены'),('samples.html','Примеры работ'),('reviews.html','Отзывы'),('about.html','О мастерской')]),('ВСЁ ПО ДЕЛУ',[('oplata.html','Оплата и этапы'),('guarantees.html','Условия и гарантии'),('priyomnaya.html','Задать вопрос'),('dashboard.html','Личный кабинет')]),('БОЛЬШЕ ВОЗМОЖНОСТЕЙ',[('benefits.html','Все выгоды'),('plus.html','Подписка «Салон+»'),('gift.html','Подарить сертификат'),('knowledge.html','Библиотека'),('tools.html','Инструменты для учёбы')])]
 panel='''<div class="sh-panel" id="salon-menu-panel"><div class="sh-panel-heading"><div><span class="sh-kicker">АКАДЕМИЧЕСКИЙ САЛОН</span><h2 id="salon-menu-title">Найди своё.</h2></div><button class="sh-close" type="button" data-sh-close aria-label="Закрыть меню" hidden>'''+icon('close')+'''</button></div><button type="button" class="search-button sh-search" hidden>'''+icon('search')+'''<span>Что ищешь?</span><span class="sh-search-hint">Работу, услугу или ответ</span><span aria-hidden="true">↗</span></button><a class="sh-search-fallback" href="knowledge.html">Найти материал в библиотеке ↗</a><div class="sh-panel-body"><nav class="sh-groups" aria-label="Все разделы">'''+''.join('<div><h3>'+label+'</h3>'+''.join(link(*x) for x in items)+'</div>' for label,items in groups)+'''</nav><aside class="sh-start"><span class="sh-kicker">ТВОЯ ЗАДАЧА</span><strong>Целиком.<br>По частям.<br><em>Как тебе нужно.</em></strong><p>Выбери работу и срок.<br>Состав и цена — до оплаты.</p>'''+link(order,'Собрать заказ <span aria-hidden="true">↗</span>','sh-start-order')+'''</aside></div><div class="sh-panel-bottom"><a href="https://t.me/kladovaya_gipsr" target="_blank" rel="noopener noreferrer"><span class="sh-family-mark" aria-hidden="true">к.</span><span>Кладовая ГИПСР <small>Наш второй проект</small></span><span aria-hidden="true">↗</span></a><button type="button" data-sh-theme hidden>'''+icon('theme')+'''<span>Тёмная тема</span></button></div></div>'''
 panel=panel.replace('<div class="sh-panel-body">',link(order,'Собрать заказ <span aria-hidden="true">↗</span>','sh-mobile-order')+'<div class="sh-panel-body">')
 return '<header class="site-header salon-header" data-site-header><div class="sh-inner">'+brand+'<nav class="sh-nav" aria-label="Основная навигация">'+''.join(link(*x) for x in nav)+'</nav><div class="sh-actions">'+link('dashboard.html',icon('account')+'<span>Кабинет</span>','sh-account')+link(order,'Заказать <span class="sh-order-long">работу</span><span aria-hidden="true">↗</span>','sh-order')+'<details class="sh-menu"><summary class="sh-menu-trigger"><span>Меню</span>'+icon('menu')+'</summary>'+panel+'</details></div></div></header>'
if __name__=='__main__':
 pages=[]
 for p in ROOT.glob('*.html'):
  base=subprocess.check_output(['git','show',BASE+':'+p.name],cwd=ROOT,text=True)
  if not re.search(r'<header class="site-header',base):continue
  entry=re.search(r'<a[^>]*data-entry-order[^>]*href="([^"]+)"',base)
  s=re.sub(r'<header class="site-header[\s\S]*?</header>',lambda _:header(p.name,entry[1] if entry else ''),base,count=1)
  s=re.sub(r'<dialog id="home-navigation"[\s\S]*?</dialog>','',s)
  s=re.sub(r'<(?:div|nav)[^>]*class="(?:family-strip|mobile-menu)"[^>]*>[\s\S]*?</(?:div|nav)>','',s)
  s=re.sub(r'(href="assets/css/salon-experience\.css)(?:\?[^"]*)?"',r'\1?v=header198"',s)
  s=re.sub(r'<script\b[^>]*src="assets/js/salon-shell\.js[^"]*"[^>]*>\s*</script>','',s)
  s=s.replace('</body>','<script src="assets/js/salon-shell.js?v=header198"></script></body>')
  p.write_text(s);pages.append(p.name)
 assert len(pages)==89,len(pages)
 (Path(__file__).parent/'pages.json').write_text(json.dumps(sorted(pages),indent=2));print('Rebuilt',len(pages),'static headers')
