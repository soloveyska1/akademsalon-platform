"""Presentation-only legal transform. Raw document markup and legal editions are preserved."""
import re
from pathlib import Path
DOCS=['oferta','privacy','terms','refunds','requisites','academic-integrity','loyalty','consent','consent-request','consent-analytics','consent-marketing','consent-publication']
def render_legal(source,shell):
 if 'data-legal-reader' in source:return source
 match=re.search(r'<article\b[^>]*class=["\'][^"\']*\bdoc\b[^"\']*["\'][^>]*>[\s\S]*?</article>',source)
 if match: content=match[0]
 else:
  m=re.search(r'<main\b[^>]*>([\s\S]*?)</main>',source)
  if not m:raise ValueError('No document')
  content='<article class="doc">'+m[1]+'</article>'
 head=re.search(r'<head>([\s\S]*?)</head>',source)[1]
 head=re.sub(r'<link\b[^>]*rel=["\']stylesheet["\'][^>]*>','',head)
 head=re.sub(r'<style\b[\s\S]*?</style>','',head)
 head+=''.join('<link rel="stylesheet" href="'+x+'?v=189">' for x in ['assets/fonts/fonts.css','assets/css/salon-direct.css','assets/css/salon-experience.css','assets/css/salon-home.css','assets/css/salon-support.css','assets/css/salon-legal.css'])
 header=re.search(r'<header class="site-header[\s\S]*?</dialog>',shell)[0];footer=re.search(r'<footer class="site-footer[\s\S]*?</footer>',shell)[0]
 toolbar='''<div class="ld-toolbar"><a href="requisites.html">Документы Салона</a><span class="ld-toolbar-actions"><button type="button" data-ld-size aria-pressed="false">Аа <span>Крупнее</span></button><button type="button" data-ld-print>Распечатать ↗</button></span></div>'''
 nav='''<aside class="ld-sidebar"><details open class="ld-navigation"><summary>В этом документе <span aria-hidden="true">＋</span></summary><div><label class="ld-search"><span>Найти в документе</span><input type="search" id="ld-search" placeholder="Например, возврат" maxlength="100" autocomplete="off"></label><div class="ld-search-actions"><span id="ld-search-status" role="status"></span><button type="button" data-ld-next hidden>Следующее ↓</button></div><nav id="ld-toc" aria-label="Оглавление документа"></nav></div></details><a class="ld-ask" href="priyomnaya.html"><span>Остался вопрос?</span><strong>Разберём вместе ↗</strong></a><div class="ld-related"><span>РЯДОМ</span><a href="oferta.html">Оферта</a><a href="privacy.html">Конфиденциальность</a><a href="loyalty.html">Правила выгод</a><a href="refunds.html">Возврат</a><a href="consent.html">Согласия</a></div></aside>'''
 js=''.join('<script src="assets/js/'+s+'.js?v=189"></script>' for s in ['app','salon-products','salon-experience','salon-shell','salon-legal'])
 return '<!doctype html><html lang="ru"><head>'+head+'</head><body class="salon-direct salon-experience concept-shell salon-support salon-legal"><a class="skip-link" href="#main">К документу</a>'+header+'<main id="main" class="ld-main" data-legal-reader>'+toolbar+'<div class="ld-layout">'+nav+'<div class="ld-paper">'+content+'<div class="ld-end"><span>Конец документа</span><a href="#main">К началу ↑</a></div></div></div><div class="ld-progress" aria-hidden="true"><i></i></div></main>'+footer+js+'</body></html>'
if __name__=='__main__':
 shell=Path('priyomnaya.html').read_text()
 for name in DOCS:
  p=Path(name+'.html');p.write_text(render_legal(p.read_text(),shell))
