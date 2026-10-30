"""Собирает новую главную из живой index.html: точечные замены с проверкой,
что каждый якорь встречается ровно один раз."""
import re
import sys
from pathlib import Path

src, dst = Path(sys.argv[1]), Path(sys.argv[2])
with open(src, encoding="utf-8", newline="") as fh:
    html = fh.read()

TG = "https://t.me/academic_saloon_bot?start=web"
VER = "trust-20261030-v1"
ICON = ('<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.6 3.2 2.9 10.4c-1.3.5-1.3 1.2-.2 '
        '1.6l4.8 1.5 1.8 5.6c.2.6.4.8.8.8.4 0 .6-.2.9-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.3-.5-1.9-1.3-1.5z'
        'M9.4 13.2l8.6-5.4c.4-.3.8-.1.5.2l-7.1 6.4-.3 3.3-1.7-4.5z"/></svg>')

REVIEWS = [  # (номер скриншота, ширина, высота миниатюры, цитата, тема с reviews.html)
    ("12", 420, 108, "«ВКР — 5!»", "После сдачи"),
    ("13", 420, 109, "Диплом на 5, госэкзамены на 5", "После сдачи"),
    ("05", 420, 722, "Диплом принят без единой правки", "После сдачи"),
    ("09", 420, 197, "«Не думала, что на следующий день всё отправишь»", "О сроках"),
    ("15", 420, 211, "«Спасибо, особенно за нормоконтроль»", "О работе вместе"),
    ("45", 420, 431, "«5 с отличием!» · позвали в магистратуру", "После сдачи"),
]


def replace_once(old, new):
    global html
    n = html.count(old)
    assert n == 1, (old[:70], n)
    html = html.replace(old, new)


def cut_section(start_marker):
    """Вырезает <section ...>…</section>, начинающуюся с маркера (секции не вложены)."""
    global html
    assert html.count(start_marker) == 1, start_marker
    i = html.index(start_marker)
    j = html.index("</section>", i) + len("</section>")
    block = html[i:j]
    assert block.count("<section") == 1, start_marker
    html = html[:i] + html[j:]
    return i


cards = "".join(
    f'<li><a class="voice" href="assets/img/reviews/review-{n}.webp">'
    f'<span class="voice-shot{" voice-shot--wide" if h / w < 0.4 else ""}"><img src="assets/img/reviews/thumbs/review-{n}.webp" width="{w}" height="{h}" '
    f'alt="" loading="lazy" decoding="async"></span>'
    f'<span class="voice-text"><strong>{q}</strong><small>{t}</small></span></a></li>'
    for n, w, h, q, t in REVIEWS
)
voices = (
    '<section class="home-voices" aria-labelledby="home-voices-title">'
    '<div class="voices-head"><div><span class="eyebrow">ОТЗЫВЫ · СКРИНШОТЫ ПЕРЕПИСКИ</span>'
    '<h2 id="home-voices-title">Пишут <em>после сдачи.</em></h2>'
    '<p>Настоящие сообщения клиентов. Нажми на карточку, чтобы прочитать целиком.</p></div>'
    '<a class="voices-all" href="reviews.html">Все 47 отзывов <span aria-hidden="true">↗</span></a></div>'
    f'<ul class="voices-grid">{cards}</ul>'
    '<div class="voices-foot"><span>Остались вопросы до заказа?</span>'
    f'<a href="{TG}" target="_blank" rel="noopener" data-tg-cta="voices">Спросить в Telegram ↗</a>'
    '<a href="samples.html">Посмотреть примеры работ ↗</a></div>'
    '</section>'
)
hero_tg = (
    f'<a class="intro-tg" href="{TG}" target="_blank" rel="noopener" data-tg-cta="hero">'
    f'<span class="intro-tg-icon" aria-hidden="true">{ICON}</span>'
    '<span><strong>Написать в Telegram</strong><small>Пришли тему и срок — ответим и назовём цену</small></span>'
    '<span aria-hidden="true">↗</span></a>'
)

# 1. Стили и скрипт главной
replace_once("</head>", f'<link rel="stylesheet" href="assets/css/home-trust.css?v={VER}">\n</head>')
replace_once("</body>", f'<script src="assets/js/home-trust.js?v={VER}" defer></script></body>')

# 2. Короткий путь «написать» на первом экране — сразу под «Оформление включено»
m = re.search(r'<div class="intro-included">.*?</div>', html, re.S)
assert m and html.count('<div class="intro-included">') == 1
html = html[:m.end()] + hero_tg + html[m.end():]

# 3. Вместо «Листика» сразу под первым экраном — отзывы; бонусный блок с главной убираем
pos = cut_section('<section class="home-listik-entry"')
html = html[:pos] + voices + html[pos:]
cut_section('<section class="home-perks"')

# 4. Telegram в подвале «НА СВЯЗИ»
replace_once(
    '<span class="shell-nav-label">НА СВЯЗИ</span>',
    '<span class="shell-nav-label">НА СВЯЗИ</span>'
    f'<a href="{TG}" target="_blank" rel="noopener" data-tg-cta="footer">Написать в Telegram <span aria-hidden="true">↗</span></a>',
)

assert "home-perks" not in html and "home-listik-entry" not in html
assert html.count('data-tg-cta="') == 3
dst.parent.mkdir(parents=True, exist_ok=True)
dst.write_text(html, encoding="utf-8", newline="")
print("ok", len(html))
