"""«Библиотека» v4: knowledge.html и guide-*.html из живого релиза -> раздел на дизайн-системе ds-v4.

python build_library_v4.py <папка с прежними страницами> <out-папка> [--preview]

- knowledge.html: новый <main> (поиск на первом экране, маршрут по задаче, фильтры с числом разборов, карточки).
  Все data-атрибуты, за которые держится salon-library.js (поиск, фильтры, «Сохранённое», маршрут), сохранены.
- guide-*.html: текст разборов не меняется. Подключаются ds-v4.css и library-v4.css, подписи без капслока и стрелок,
  призыв в подвале убран (его заменяет блок «Дальше по твоей задаче»).
С --preview пишет *-v4.html с noindex; ссылки раздела ведут на превью."""
import html as H
import json
import re
import sys
from pathlib import Path

src, out = Path(sys.argv[1]), Path(sys.argv[2])
preview = "--preview" in sys.argv[3:]
VER = "library-v4-20261030-1"
DS_VER = "home-v4-20261030-4"
TG = "https://t.me/academicsaloon"
GUIDES = sorted(p.name for p in src.glob("guide-*.html"))
assert len(GUIDES) == 25, GUIDES
QUICK = ["введение", "список литературы", "антиплагиат", "дневник практики", "речь на защите"]
TOPICS = [("all", "Все материалы"), ("start", "Начало"), ("methodology", "Исследование"), ("sources", "Источники"),
          ("formatting", "Оформление"), ("practice", "Практика"), ("defense", "Защита"), ("publication", "Статья"), ("price", "Цены")]
PLANE = ('<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.6 3.2 2.9 10.4c-1.3.5-1.3 1.2-.2 '
         '1.6l4.8 1.5 1.8 5.6c.2.6.4.8.8.8.4 0 .6-.2.9-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.3-.5-1.9-1.3-1.5z'
         'M9.4 13.2l8.6-5.4c.4-.3.8-.1.5.2l-7.1 6.4-.3 3.3-1.7-4.5z"/></svg>')
I_SEARCH = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">'
            '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>')
I_HEART = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">'
           '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>')


def esc(s):
    return H.escape(str(s), quote=True)


def glue(text):
    # «1 000 ₽», «7 минут», «25 разборов» не разрываются переносом
    text = re.sub(r"(\d) (?=\d{3}(?!\d))", "\\1\u00a0", text)
    return re.sub(r"(\d) (?=₽|%|минут|разбор|материал)", "\\1\u00a0", text)


def read(name):
    with open(src / name, encoding="utf-8", newline="") as fh:
        return fh.read()


# ---------- хаб: карточки и маршрут берём из прежней страницы
old = read("knowledge.html")
old_main = old[old.index("<main"):old.index("</main>")]
cards = []
for m in re.finditer(r'<article class="lr-card" data-library-card data-topic="([^"]+)" data-path="([^"]+)">(.*?)</article>', old_main, re.S):
    topic, path, body = m.groups()
    meta = re.search(r'<span class="lr-card-meta">([^<]+)</span>', body).group(1)
    title = re.search(r"<h2>(.*?)</h2>", body, re.S).group(1)
    text = re.search(r"<p>(.*?)</p>", body, re.S).group(1)
    label, minutes = [x.strip() for x in meta.split("·")]
    cards.append((topic, path, label, minutes, title, text))
assert len(cards) == 25 and sorted(c[1] for c in cards) == GUIDES
route = re.search(r'<script type="application/json" data-study-data>(.*?)</script>', old_main, re.S).group(1)
ROUTE = json.loads(route)
first = ROUTE["course"]["plans"]["starting"]
count = {k: sum(1 for c in cards if k == "all" or k in c[0].split()) for k, _ in TOPICS}


def card_html(topic, path, label, minutes, title, text):
    # Пробелы между блоками обязательны: salon-library.js ищет по card.textContent, и без них
    # «10 минут» склеивается с первым словом заголовка («минутАнтиплагиат» — по «антиплагиат» не находилось).
    return (f'<article class="lr-card lb-card" data-library-card data-topic="{topic}" data-path="{path}">'
            f'<a href="{path}"><p class="lb-card-meta"><b>{esc(label)}</b> <span>{esc(minutes)}</span></p> '
            f'<h2>{title}</h2> <p>{text}</p> <span class="lb-card-read">Читать разбор</span></a> '
            f'<button class="lr-save" type="button" data-save="{path}" aria-pressed="false" aria-label="Сохранить: {esc(H.unescape(title))}">♡</button>'
            '</article>')


def seg_buttons(attr, items, current):
    return "".join(f'<button type="button" data-study-{attr}="{v}" aria-pressed="{str(v == current).lower()}">{esc(t)}</button>'
                   for v, t in items)


route_html = (
    '<section class="lb-route" id="study-route" data-study-route aria-labelledby="lb-route-title">'
    '<div><h2 class="lb-route-title" id="lb-route-title">Маршрут по задаче</h2>'
    '<p class="lb-route-sub">Выбери работу и этап — подберём три разбора в нужном порядке.</p></div>'
    '<fieldset><legend>Какая работа?</legend><div>'
    + seg_buttons("work", [("course", "Курсовая"), ("practice", "Практика"), ("diplom", "ВКР")], "course") + '</div></fieldset>'
    '<fieldset><legend>На каком ты этапе?</legend><div>'
    + seg_buttons("stage", [("starting", "Начинаю"), ("writing", "Пишу"), ("finishing", "Завершаю")], "starting") + '</div></fieldset>'
    '<p class="lr-route-caption" data-study-caption>Курсовая · Начинаю</p>'
    '<ol class="lr-route-list" data-study-list>' + "".join(
        f'<li><a href="{s["url"]}"><span class="lr-route-number" aria-hidden="true">{i:02d}</span>'
        f'<span><strong>{esc(s["title"])}</strong><small>{esc(s["note"])}</small></span>'
        '<span class="lr-route-arrow" aria-hidden="true">↗</span></a></li>' for i, s in enumerate(first, 1)) + '</ol>'
    '<div class="lr-route-actions"><button type="button" data-study-copy hidden>Скопировать маршрут</button>'
    f'<a data-study-help href="{ROUTE["course"]["service"]}">Помощь с курсовой</a></div>'
    '<p class="lr-route-status" data-study-status role="status"></p>'
    '<div class="lr-route-fallback" data-study-fallback hidden><label for="study-share-url">Скопируй ссылку на маршрут</label>'
    '<input id="study-share-url" data-study-link type="url" readonly></div>'
    '<noscript><p>Здесь показан маршрут для начала курсовой. Все остальные материалы доступны в библиотеке ниже.</p></noscript>'
    f'<script type="application/json" data-study-data>{route}</script></section>'
)

hub_main = (
    '<main class="lr-main lb-main" id="main" data-library>'
    '<nav class="lr-subnav" aria-label="Полезное"><a href="knowledge.html">Библиотека</a><a href="tools.html">Инструменты</a>'
    '<a href="samples.html">Примеры работ</a></nav>'
    '<section class="lb-hero ds-night" aria-labelledby="lb-title"><div class="lb-hero-copy">'
    '<h1 class="ds-display-1" id="lb-title">Библиотека</h1>'
    f'<p class="ds-lead">{len(cards)} разборов о курсовой, практике и ВКР — от выбора темы до речи на защите. '
    'Читай бесплатно, ищи по слову и сохраняй нужное.</p>'
    f'<label class="lb-search">{I_SEARCH}<input type="search" data-library-search maxlength="160" aria-label="Найти в библиотеке" '
    'placeholder="Введение, дневник, речь…" autocomplete="off" enterkeyhint="search">'
    '<button type="button" data-library-clear aria-label="Очистить поиск" hidden>×</button></label>'
    # каталог ниже первого экрана: library-v4.js пишет здесь, сколько нашлось, и ведёт к результатам
    '<p class="lb-hint" data-lb-hint hidden><span></span><button type="button">Показать</button></p>'
    '<div class="lb-quick" role="group" aria-label="Часто ищут"><span aria-hidden="true">Часто ищут:</span>' + "".join(
        f'<button type="button" data-lb-query="{q}">{q}</button>' for q in QUICK) + '</div>'
    '<p class="lb-hero-links">Ещё бесплатно: <a href="tools.html">проверки и паспорт темы</a><a href="samples.html">примеры работ целиком</a></p>'
    '</div>' + route_html + '</section>'
    '<section class="lr-catalog lb-catalog" aria-labelledby="lb-catalog-title"><div class="lb-catalog-head"><div>'
    '<h2 class="ds-display-2" id="lb-catalog-title">Все разборы</h2>'
    '<p class="ds-lead">Короткие инструкции с примерами и чек-листами. Сердечко сохраняет разбор на этом устройстве.</p></div>'
    f'<button type="button" class="lr-shelf-toggle lb-shelf" data-library-saved aria-pressed="false">{I_HEART}<span>Сохранённое</span><b data-shelf-count>0</b></button></div>'
    '<div class="lb-filters" role="group" aria-label="Тема материала">' + "".join(
        f'<button type="button" data-library-topic="{k}" aria-pressed="{str(k == "all").lower()}">{esc(t)} <small>{count[k]}</small></button>'
        for k, t in TOPICS) + '</div>'
    '<div class="lr-results-line lb-results"><p data-library-status role="status"></p><span data-library-shelf-note hidden>На этом устройстве</span></div>'
    '<div class="lr-card-grid lb-grid">' + "".join(card_html(*c) for c in cards) + '</div>'
    '<div class="lr-empty lb-empty" data-library-empty hidden><h2>Пока ничего</h2>'
    '<p data-library-empty-note>Попробуй другое слово или тему.</p>'
    '<button class="ds-btn ds-btn--violet" type="button" data-library-reset>Показать все материалы</button></div>'
    '<button type="button" class="lr-more lb-more" data-library-more hidden>Ещё материалы</button></section>'
    '<section class="lb-final ds-night" aria-labelledby="lb-final-title"><div>'
    '<h2 class="ds-display-2" id="lb-final-title">Нужен разбор именно твоей работы?</h2>'
    '<p class="ds-lead">Инструкция помогает разобраться. Задание и методичка помогут нам оценить твою задачу.</p></div>'
    '<div class="lb-final-actions"><a class="ds-btn ds-btn--lime" href="configurator.html">Обсудить задачу</a>'
    f'<a class="ds-btn ds-btn--ghost" href="{TG}" target="_blank" rel="noopener" data-tg-cta="library_final">{PLANE}Спросить в Telegram</a></div></section>'
    '<p class="lr-status" data-learning-status role="status"></p></main>'
)
hub_main = re.sub(r">([^<]+)<", lambda m: ">" + (m.group(1) if m.group(1).lstrip().startswith("{") else glue(m.group(1))) + "<", hub_main)

GUIDE_EDITS = [
    ("Дальше <em>по твоей задаче.</em>", "Дальше по твоей задаче", 1),
    ("<span>СЛЕДУЮЩИЙ РАЗБОР</span>", "<span>Следующий разбор</span>", 1),
    ("<span>ЕСЛИ НУЖНА ПОМОЩЬ</span>", "<span>Если нужна помощь</span>", 1),
    (">Ссылка ↗<", ">Ссылка<", 1),
    ("Проверить свой материал ↗", "Проверить свой материал", 1),
    ("Весь маршрут ↗", "Весь маршрут", None),  # в одном разборе маршрута нет
    ('<a href="knowledge.html">← Все материалы</a>', '<a href="knowledge.html">Все материалы</a>', 1),
    (">Аа · Крупнее<", ">Крупный шрифт<", 1),
    (">Интервал · Просторнее<", ">Шире интервал<", 1),
]


def build(name):
    page = read(name)

    def once(old_s, new_s):
        nonlocal page
        assert page.count(old_s) == 1, (name, old_s[:80])
        page = page.replace(old_s, new_s)

    if name == "knowledge.html":
        a = page.index("<main")
        b = page.index("</main>", a) + len("</main>")
        page = page[:a] + hub_main + page[b:]
    else:
        for o, n, k in GUIDE_EDITS:
            assert k is None and page.count(o) <= 1 or page.count(o) == k, (name, o)
            page = page.replace(o, n)
    # Призыв в подвале дублирует финальный блок страницы (как на главной)
    i = page.index('<div class="bottom-heading">')
    j = page.index("</div>", i) + len("</div>")
    assert "<div" not in page[i + 5:j - 6]
    page = page[:i] + page[j:]
    assert 'href="assets/fonts/v4/onest-cyrillic.woff2"' in page  # Onest уже грузит ds-shell
    reading = re.search(r'<link rel="stylesheet" href="assets/css/salon-reading\.css[^>]*>', page).group(0)
    once(reading, reading
         + '<link rel="preload" href="assets/fonts/v4/literata-display-cyrillic.woff2" as="font" type="font/woff2" crossorigin>'
         f'<link rel="stylesheet" href="assets/css/ds-v4.css?v={DS_VER}">'
         f'<link rel="stylesheet" href="assets/css/library-v4.css?v={VER}">')
    once('<body class="salon-direct salon-experience concept-shell salon-learning">',
         '<body class="salon-direct salon-experience concept-shell salon-learning ds-v4">')
    # library-v4.js — после salon-library/salon-reading/salon-ease: снимает стрелки с их кнопок, ведёт поиск хаба
    ease = re.search(r'<script src="assets/js/salon-ease\.js[^"]*"></script>', page).group(0)
    once(ease, ease + f'<script src="assets/js/library-v4.js?v={VER}"></script>')
    if preview:
        once('<meta name="robots" content="index,follow,max-image-preview:large">', '<meta name="robots" content="noindex,nofollow">')
        a = page.index("<main")
        b = page.index("</main>", a)
        part = re.sub(r'href="/?(knowledge|guide-[a-z0-9-]+)\.html', r'href="\1-v4.html', page[a:b])
        page = page[:a] + part + page[b:]
    assert page.count("<main") == 1 and "\x01" not in page
    target = out / (name.replace(".html", "-v4.html") if preview else name)
    with open(target, "w", encoding="utf-8", newline="") as fh:
        fh.write(page)
    return target.name


out.mkdir(parents=True, exist_ok=True)
names = [build(n) for n in ["knowledge.html"] + GUIDES]
print("ok", len(names), "pages:", names[0], "…", names[-1], "| topics", count)
