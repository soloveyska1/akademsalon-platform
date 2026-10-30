"""«Документы Салона» v4: двенадцать страниц с читалкой документов -> дизайн-система ds-v4.

python build_docs_v4.py <папка с прежними страницами> <out-папка> [--preview]

Меняется только подача: титул документа на ночной сцене, навигация по разделу, читалка с оглавлением
и поиском, список всех документов. Текст документов не меняется: сборка сверяет текст статьи до и после
(посимвольно), все id и все ссылки. С --preview пишет *-v4.html с noindex, ссылки раздела ведут на превью."""
import html as H
import math
import re
import shutil
import sys
from pathlib import Path

src, out = Path(sys.argv[1]), Path(sys.argv[2])
preview = "--preview" in sys.argv[3:]
here = Path(__file__).resolve().parent
VER = "docs-v4-20261030-1"
DS_VER = "home-v4-20261030-4"
TG = "https://t.me/academicsaloon"

# Страница, название в списке, о чём он (сверено с текстом документа), пример для поиска (есть в тексте)
DOCS = {
    "requisites": ("Реквизиты и правовая информация", "Кто оказывает услуги, контакты, оплата и чеки", "ИНН"),
    "oferta": ("Публичная оферта", "Рамочный договор: академическое сопровождение и авторский заказ вне аттестации", "возврат"),
    "terms": ("Пользовательское соглашение", "Правила пользования сайтом и Telegram-ботом", "калькулятор"),
    "loyalty": ("Правила программы лояльности", "Бонусы, рефералы, подписка «Салон+» и депозит", "бонусы"),
    "refunds": ("Отказ и возврат оплаты", "Как отказаться от услуги и как считается сумма возврата", "аванс"),
    "academic-integrity": ("Границы услуг и академическая добросовестность", "Режимы А1, А2 и Б и что не принимается ни в одном из них", "ВКР"),
    "privacy": ("Политика обработки персональных данных", "Какие данные обрабатываются, зачем и сколько хранятся", "cookie"),
    "consent-request": ("Согласие для заявки", "Ответ на обращение и индивидуальное предложение", "отзыв"),
    "consent": ("Согласие для программы лояльности", "Бонусный счёт, реферальная программа и подписки", "отзыв"),
    "consent-analytics": ("Согласие на аналитику", "Оценка посещаемости и поиск технических ошибок", "Метрика"),
    "consent-marketing": ("Согласие на рекламные сообщения", "Сообщения об акциях и новых услугах в Telegram", "отказ"),
    "consent-publication": ("Согласие на распространение данных", "Публикация выбранного отзыва или вопроса", "срок"),
}
GROUPS = [("Договор и правила", ["requisites", "oferta", "terms", "loyalty", "refunds", "academic-integrity"]),
          ("Персональные данные", ["privacy", "consent-request", "consent", "consent-analytics", "consent-marketing", "consent-publication"])]
CRUMBS = [("requisites", "Реквизиты"), ("oferta", "Оферта"), ("terms", "Соглашение"), ("privacy", "Конфиденциальность"),
          ("consent-request", "Согласия"), ("loyalty", "Правила выгод"), ("refunds", "Возврат"), ("academic-integrity", "Границы услуг")]
CONSENTS = [("consent-request", "Для заявки"), ("consent", "Программа лояльности"), ("consent-analytics", "Аналитика"),
            ("consent-marketing", "Рекламные сообщения"), ("consent-publication", "Распространение данных")]
assert sorted(sum((g for _, g in GROUPS), [])) == sorted(DOCS)

SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{d}</svg>'
I_DOC = SVG.format(w=1.8, d='<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>')
I_PRINT = SVG.format(w=1.9, d='<path d="M7 9V3h10v6M7 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v7H7z"/>')
I_SEARCH = SVG.format(w=2, d='<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>')
I_CHEVRON = SVG.format(w=2.2, d='<path d="m6 9 6 6 6-6"/>').replace("<svg ", '<svg class="dc-chevron" ', 1)
PLANE = ('<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.6 3.2 2.9 10.4c-1.3.5-1.3 1.2-.2 '
         '1.6l4.8 1.5 1.8 5.6c.2.6.4.8.8.8.4 0 .6-.2.9-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.3-.5-1.9-1.3-1.5z'
         'M9.4 13.2l8.6-5.4c.4-.3.8-.1.5.2l-7.1 6.4-.3 3.3-1.7-4.5z"/></svg>')
SHEET = ('<div class="dc-sheet" aria-hidden="true"><span class="dc-sheet-back"></span><span class="dc-sheet-page">'
         + "<i></i>" * 9 + '</span><span class="dc-sheet-seal">а.</span></div>')
NUM = r"\d+[а-яa-z]?(?:\.\d+[а-яa-z]?)*\."


def href(slug):
    return f"{slug}-v4.html" if preview else f"{slug}.html"


def plural(n, one, few, many):
    if n % 10 == 1 and n % 100 != 11:
        return one
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return few
    return many


def text(h, sep=" "):
    return re.sub(r"\s+", " ", H.unescape(re.sub(r"<[^>]+>", sep, h))).strip()


def label_table(t):
    """На телефоне строка таблицы — карточка: над значением подпись колонки (data-label из шапки)."""
    head = re.search(r"<thead>\s*<tr>(.*?)</tr>", t, re.S)
    if not head:  # шапка бывает и первой строкой из одних <th>
        head = re.search(r"<tr>((?:\s*<th>.*?</th>)+\s*)</tr>", t, re.S)
        if not head or t.index(head.group(0)) != t.index("<tr>"):
            return t
        t = t.replace(head.group(0), head.group(0).replace("<tr>", '<tr class="ld-thead">', 1), 1)
    labels = [text(c) for c in re.findall(r"<th>(.*?)</th>", head.group(1), re.S)]

    def row(m):
        cells = iter(labels)
        return re.sub(r"<td>", lambda _: f'<td data-label="{H.escape(next(cells), quote=True)}">', m.group(0))

    body = re.sub(r"<tr>(?:(?!</tr>).)*?<td>.*?</tr>", row, t, flags=re.S)
    assert body.count("<td>") == 0 and body.count("data-label=") == t.count("<td>"), t[:80]
    return body


def build(slug):
    with open(src / f"{slug}.html", encoding="utf-8", newline="") as fh:
        page = fh.read()
    example = DOCS[slug][2]

    def once(old, new):
        nonlocal page
        assert page.count(old) == 1, (slug, old[:80])
        page = page.replace(old, new)

    a = page.index('<main id="main" class="ld-main" data-legal-reader>')
    b = page.index("</main>", a) + len("</main>")
    old_main = page[a:b]
    assert page.count("<main") == 1 and old_main.count('<article class="doc">') == 1 and old_main.count("</article>") == 1
    i = old_main.index('<article class="doc">')
    j = old_main.index("</article>") + len("</article>")
    art0 = old_main[i:j]
    art = art0

    # Титул документа уходит на ночную сцену: заголовок и подзаголовок (если есть)
    h1 = re.findall(r"\s*<h1>(.*?)</h1>", art, re.S)
    assert len(h1) == 1 and "<h1" not in page[:a] + page[b:], slug
    art = re.sub(r"\s*<h1>.*?</h1>", "", art, count=1, flags=re.S)
    sub = re.search(r'\s*<p class="doc-subtitle">(.*?)</p>', art, re.S)
    if sub:
        art = art[:sub.start()] + art[sub.end():]
    # Строка редакции — карточка в начале листа; у части документов у неё ещё нет класса
    first = re.match(r'<article class="doc">\s*<p( class="doc-meta")?>', art)
    assert first, slug
    if not first.group(1):
        assert re.match(r'<article class="doc">\s*<p>Редакция \d', art), slug
        art = art.replace("<p>", '<p class="doc-meta">', 1)
    # Номера пунктов и разделов — в отдельный элемент, чтобы вынести их на поля
    art, n_p = re.subn(r"<p>(" + NUM + r"\s+)", r'<p><span class="ld-n">\1</span>', art)
    art, n_h = re.subn(r"(<h2(?: [^>]*)?>)(\d+[а-яa-z]?\.\s+)", r'\1<span class="ld-hn">\2</span>', art)
    if n_p or n_h:
        art = art.replace('<article class="doc">', '<article class="doc ld-numbered">', 1)
    art, n_t = re.sub(r"<table>.*?</table>", lambda m: '<div class="ld-table">' + label_table(m.group(0)) + "</div>", art,
                      flags=re.S), art.count("<table>")
    assert art.count('<div class="ld-table">') == art.count("</table></div>") == n_t == art.count("<table")

    # Текст документа не изменился: посимвольно (без пробелов) и по словам
    moved = f"<h1>{h1[0]}</h1>" + (f"<p>{sub.group(1)}</p>" if sub else "")
    assert re.sub(r"\s+", "", text(art0, "")) == re.sub(r"\s+", "", text(moved + art, "")), slug
    assert text(art0) == text(moved + art), slug
    assert re.findall(r'href="([^"]*)"', art0) == re.findall(r'href="([^"]*)"', art), slug
    plain = text(art0)
    assert example.lower() in plain.lower(), (slug, example)
    words = len(plain.split())
    minutes = max(1, math.ceil(words / 180))
    sections = len(re.findall(r"<h2\b", art))

    group = "consent-request" if slug.startswith("consent") else slug
    crumbs = "".join(
        f'<a href="{href(s)}"' + (' aria-current="page"' if s == slug else ' aria-current="true"' if s == group else "") + f">{label}</a>"
        for s, label in CRUMBS)
    consents = ""
    if slug.startswith("consent"):
        consents = ('<nav class="dc-consents" aria-label="Согласия">' + "".join(
            f'<a href="{href(s)}"' + (' aria-current="page"' if s == slug else "") + f">{label}</a>" for s, label in CONSENTS) + "</nav>")
    facts = (f'<ul class="dc-facts"><li><b>{sections}</b> {plural(sections, "раздел", "раздела", "разделов")}</li>'
             f'<li><b>{minutes}</b> {plural(minutes, "минута", "минуты", "минут")} чтения</li></ul>')

    hero = (
        '<div class="dc-hero ds-night"><div class="dc-hero-top">'
        f'<p class="dc-kicker">{I_DOC}Документы Салона</p><div class="dc-tools">'
        '<button type="button" data-ld-size aria-pressed="false"><span class="dc-aa" aria-hidden="true">Аа</span>'
        '<span class="dc-tool-label">Крупнее</span></button>'
        f'<button type="button" data-ld-print>{I_PRINT}<span class="dc-tool-label">Распечатать</span></button></div></div>'
        f'<div class="dc-hero-copy"><h1 class="ds-display-1">{h1[0]}</h1>'
        + (f'<p class="doc-subtitle ds-lead">{sub.group(1)}</p>' if sub else "")
        + facts + consents + "</div>" + SHEET + "</div>"
    )
    aside = (
        '<aside class="ld-sidebar" aria-label="Навигация по документу"><details open class="ld-navigation"><summary>'
        f'<span class="dc-nav-label">В этом документе</span><span class="dc-now" data-ld-now></span>{I_CHEVRON}</summary><div>'
        f'<label class="ld-search"><span>Найти в документе</span>{I_SEARCH}'
        f'<input type="search" id="ld-search" placeholder="Например, {example}" maxlength="100" autocomplete="off"></label>'
        '<div class="ld-search-actions"><span id="ld-search-status" role="status"></span>'
        '<button type="button" data-ld-next hidden>Следующее</button></div>'
        '<nav id="ld-toc" aria-label="Оглавление документа"></nav></div></details>'
        '<a class="ld-ask" href="priyomnaya.html"><span>Остался вопрос?</span><strong>Разберём вместе</strong></a></aside>'
    )
    paper = ('<div class="ld-paper">' + art +
             '<div class="ld-end"><span>Конец документа</span><a href="#main">К началу</a></div></div>')

    def card(s):
        t, d, _ = DOCS[s]
        if s == slug:
            return f'<a class="dc-doc" href="#main" aria-current="page"><b>{t}</b><span>{d}</span><em>Сейчас открыт</em></a>'
        return f'<a class="dc-doc" href="{href(s)}"><b>{t}</b><span>{d}</span></a>'

    more = ('<section class="dc-more" aria-labelledby="dc-more-title"><div class="dc-head">'
            '<h2 class="ds-display-2" id="dc-more-title">Все документы Салона</h2>'
            '<p class="ds-lead">Договор, правила и согласия в одном месте.</p></div><div class="dc-groups">'
            + "".join(f'<div class="dc-group"><h3>{g}</h3><div class="dc-docs">{"".join(card(s) for s in items)}</div></div>'
                      for g, items in GROUPS) + "</div></section>")
    final = ('<section class="dc-final ds-night" aria-labelledby="dc-final-title"><div class="dc-final-copy">'
             '<h2 class="ds-display-2" id="dc-final-title">Что-то непонятно в документах?</h2>'
             '<p class="ds-lead">Напиши в Telegram или задай вопрос в приёмной — разберём вместе, как это работает в твоём заказе.</p></div>'
             f'<div class="dc-final-actions"><a class="ds-btn ds-btn--lime" href="{TG}" target="_blank" rel="noopener" data-tg-cta="docs_final">'
             f'{PLANE}Написать в Telegram</a><a class="ds-btn ds-btn--ghost" href="priyomnaya.html">Задать вопрос</a></div></section>')
    main = ('<main id="main" class="ld-main dc-main" data-legal-reader>'
            f'<nav class="dc-crumbs" aria-label="Документы Салона">{crumbs}</nav>' + hero +
            '<div class="ld-layout">' + aside + paper + "</div>" + more + final +
            '<div class="ld-progress" aria-hidden="true"><i></i></div></main>')
    page = page[:a] + main + page[b:]

    # Призыв в подвале дублирует финальный блок страницы (как на других страницах v4)
    i = page.index('<div class="bottom-heading">')
    j = page.index("</div>", i) + len("</div>")
    assert page.count('<div class="bottom-heading">') == 1 and "<div" not in page[i + 5:j - 6]
    page = page[:i] + page[j:]

    once('<link rel="stylesheet" href="assets/css/salon-legal.css?v=189&amp;r=95c4ebb227d9b9d8">', "")
    assert 'href="assets/fonts/v4/onest-cyrillic.woff2"' in page  # Onest уже грузит шапка
    pre = '<link rel="stylesheet" href="assets/css/salon-reading.css?v=reading-20260924-v1&amp;r=738299ca23596473">'
    once(pre, pre + '<link rel="preload" href="assets/fonts/v4/literata-display-cyrillic.woff2" as="font" type="font/woff2" crossorigin>'
         f'<link rel="stylesheet" href="assets/css/ds-v4.css?v={DS_VER}"><link rel="stylesheet" href="assets/css/docs-v4.css?v={VER}">')
    once('<script src="assets/js/salon-legal.js?v=189&amp;r=586def6bad10a889"></script>',
         f'<script src="assets/js/docs-v4.js?v={VER}"></script>')
    once('<body class="salon-direct salon-experience concept-shell salon-support salon-legal">',
         '<body class="salon-direct salon-experience concept-shell salon-support salon-legal ds-v4">')
    if preview:
        robots = re.findall(r'<meta name="robots" content="[^"]*"\s*/?>', page)
        assert len(robots) == 1, slug
        once(robots[0], '<meta name="robots" content="noindex,nofollow">')

    # Все прежние id на месте (в т.ч. якоря, на которые ссылается сайт), новых совпадений нет
    ids = re.findall(r'\bid="([^"]+)"', page)
    assert len(ids) == len(set(ids)), slug
    for need in re.findall(r'\bid="([^"]+)"', old_main):
        assert need in ids, (slug, need)
    for need in ('id="ld-search"', 'id="ld-search-status"', 'id="ld-toc"', "data-ld-size", "data-ld-print", "data-ld-next", "data-ld-now",
                 'class="ld-navigation"', 'class="ld-progress"', "data-legal-reader"):
        assert page.count(need) == 1, (slug, need)
    assert "↗" not in main and "↓" not in main and "↑" not in main, slug

    name = f"{slug}-v4.html" if preview else f"{slug}.html"
    with open(out / name, "w", encoding="utf-8", newline="") as fh:
        fh.write(page)
    return f"{name}: {sections} разделов, {minutes} мин, пунктов на полях {n_p}, номеров разделов {n_h}, таблиц {n_t}"


out.mkdir(parents=True, exist_ok=True)
for s in DOCS:
    print(build(s))
for kind, f in (("css", "docs-v4.css"), ("js", "docs-v4.js")):
    (out / "assets" / kind).mkdir(parents=True, exist_ok=True)
    shutil.copyfile(here / f, out / "assets" / kind / f)
print("ok", VER, "preview" if preview else "live")
