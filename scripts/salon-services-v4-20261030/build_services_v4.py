"""«Работы и цены» v4: services.html из живого релиза -> страница на дизайн-системе ds-v4.

python build_services_v4.py <services.html релиза> <out> [--preview]

Логика расчёта и разметка каталога не меняются: класс ds-v4 на <body>, стили ds-v4.css и
services-v4.css последними, Листик на первом экране, подписи без капслока и стрелок.
--preview ставит noindex (скрытое превью). Каждая замена проверяется."""
import sys
from pathlib import Path

src, dst = Path(sys.argv[1]), Path(sys.argv[2])
preview = "--preview" in sys.argv[3:]
VER = "services-v4-20261030-1"
DS_VER = "home-v4-20261030-4"
with open(src, encoding="utf-8", newline="") as fh:
    html = fh.read()


def once(old, new):
    global html
    assert html.count(old) == 1, old
    html = html.replace(old, new)


CAL = '<link rel="stylesheet" href="assets/css/salon-calendar.css?v=calendar-20260927'
i = html.index(CAL)
j = html.index(">", i) + 1
assert html.count(CAL) == 1
html = (html[:j]
        + '<link rel="preload" href="assets/fonts/v4/literata-display-cyrillic.woff2" as="font" type="font/woff2" crossorigin>'
        + f'<link rel="stylesheet" href="assets/css/ds-v4.css?v={DS_VER}">'
        + f'<link rel="stylesheet" href="assets/css/services-v4.css?v={VER}">'
        + html[j:])

once('<body class="salon-experience salon-direct concept-shell salon-catalogue">',
     '<body class="salon-experience salon-direct concept-shell salon-catalogue ds-v4">')

# Первый экран: без надписи капслоком, с Листиком
once('<header class="sv-intro"><div><span class="sv-eyebrow">АКАДЕМИЧЕСКИЙ САЛОН</span><h1>',
     '<header class="sv-intro"><div><h1>')
once('</ol></header>',
     '</ol><img class="sv4-listik" src="assets/img/home-v4/listik-think.webp" width="328" height="440" alt="" decoding="async"></header>')

# Подписи разделов: без капслока и стрелок
once('<div><span class="sv-eyebrow">РАБОТА ИЛИ УСЛУГА</span><h2 id="sv-list-title">', '<div><h2 id="sv-list-title">')
once('<div><span class="sv-eyebrow">ВЫГОДЫ И УСЛОВИЯ</span><h2 id="sv-more-title">', '<div><h2 id="sv-more-title">')
once('<div><span class="sv-eyebrow">СЛЕДУЮЩИЙ ШАГ</span><h2 id="sv-help-title">', '<div><h2 id="sv-help-title">')
once('<span class="sv-perk-label">В СТОИМОСТИ</span>', '<span class="sv-perk-label">В стоимости</span>')
once('<span class="sv-perk-label">НА СЛЕДУЮЩИЙ ЗАКАЗ</span>', '<span class="sv-perk-label">На следующий заказ</span>')
once('<span class="sv-perk-label">КОМПЛЕКТ К ЗАЩИТЕ</span>', '<span class="sv-perk-label">Комплект к защите</span>')
once('<a href="benefits.html">Все условия ↗</a>', '<a href="benefits.html">Все условия</a>')
once('Посчитать мою выгоду →</button>', 'Посчитать мою выгоду</button>')
once('Выбрать этот комплект →</button>', 'Выбрать этот комплект</button>')
once('<a href="priyomnaya.html">Обсудить задачу ↗</a>', '<a href="priyomnaya.html">Обсудить задачу</a>')
once('Продолжить расчёт ↗</button>', 'Продолжить расчёт</button>')

if preview:
    once('<meta name="robots" content="index,follow,max-image-preview:large">', '<meta name="robots" content="noindex,nofollow">')

assert "sv-eyebrow" not in html.split("<main", 1)[1].split("</main>", 1)[0]
dst.parent.mkdir(parents=True, exist_ok=True)
with open(dst, "w", encoding="utf-8", newline="") as fh:
    fh.write(html)
print("ok", len(html))
