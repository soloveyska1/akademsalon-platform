"""Шапка v4 на страницах релиза: правит разметку общей шапки и подключает ds-header.css.

python apply_header_v4.py <папка с HTML> [файлы...]

В шапку добавляется кнопка Telegram, из меню убираются подписи капслоком, в карточку заказа меню —
ссылка на Telegram. Ссылки «Заказать» на своих страницах не трогаются. ds-header.css ставится сразу
после ds-shell.css. Повторный запуск ничего не меняет; каждая правка проверяется."""
import re
import sys
from pathlib import Path

VER = "ds-header-20261030-1"
TG = "https://t.me/academicsaloon"
PLANE = ('<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.6 3.2 2.9 10.4c-1.3.5-1.3 1.2-.2 '
         '1.6l4.8 1.5 1.8 5.6c.2.6.4.8.8.8.4 0 .6-.2.9-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.3-.5-1.9-1.3-1.5z'
         'M9.4 13.2l8.6-5.4c.4-.3.8-.1.5.2l-7.1 6.4-.3 3.3-1.7-4.5z"/></svg>')
HEADER = re.compile(r'<header class="site-header salon-header" data-site-header>[\s\S]*?</header>')
SHELL = re.compile(r'<link rel="stylesheet" href="(/?)assets/css/ds-shell\.css\?[^"]*">')

EDITS = [
    ('<a class="sh-order" ',
     f'<a class="sh-tg" href="{TG}" target="_blank" rel="noopener" aria-label="Написать в Telegram" '
     f'title="Написать в Telegram" data-tg-cta="header">{PLANE}</a><a class="sh-order" '),
    ('<div><span class="sh-kicker">АКАДЕМИЧЕСКИЙ САЛОН</span><h2 id="salon-menu-title">',
     '<div><h2 id="salon-menu-title">'),
    ("<h3>РАБОТА</h3>", "<h3>Работа</h3>"),
    ("<h3>ВСЁ ПО ДЕЛУ</h3>", "<h3>Всё по делу</h3>"),
    ("<h3>БОЛЬШЕ ВОЗМОЖНОСТЕЙ</h3>", "<h3>Больше возможностей</h3>"),
    ('<aside class="sh-start"><span class="sh-kicker">ТВОЯ ЗАДАЧА</span>', '<aside class="sh-start">'),
]
START_END = re.compile(r'(<a class="sh-start-order" href="[^"]*">Собрать заказ <span aria-hidden="true">↗</span></a>)(</aside>)')
START_TG = (f'<a class="sh-start-tg" href="{TG}" target="_blank" rel="noopener" data-tg-cta="menu">'
            f'{PLANE}Написать в Telegram</a>')


def apply(html, name):
    m = HEADER.search(html)
    if not m or 'class="sh-tg"' in m.group(0):
        return None
    head = m.group(0)
    for old, new in EDITS:
        assert head.count(old) == 1, (name, old)
        head = head.replace(old, new)
    assert len(START_END.findall(head)) == 1, (name, "sh-start-order")
    head = START_END.sub(lambda s: s.group(1) + START_TG + s.group(2), head)
    html = html[:m.start()] + head + html[m.end():]
    link = SHELL.search(html)
    assert link and "ds-header.css" not in html, (name, "ds-shell link")
    tag = f'<link rel="stylesheet" href="{link.group(1)}assets/css/ds-header.css?v={VER}">'
    html = html[:link.end()] + tag + html[link.end():]
    assert html.count('class="sh-tg"') == 1 and html.count("ds-header.css") == 1
    return html


root = Path(sys.argv[1])
names = sys.argv[2:] or sorted(p.name for p in root.glob("*.html"))
changed, skipped = [], []
for name in names:
    page = root / name
    with open(page, encoding="utf-8", newline="") as fh:
        html = fh.read()
    out = apply(html, name)
    if out is None:
        skipped.append(name)
        continue
    with open(page, "w", encoding="utf-8", newline="") as fh:
        fh.write(out)
    changed.append(name)
print(f"changed {len(changed)}, skipped {len(skipped)}: {' '.join(skipped)}")
