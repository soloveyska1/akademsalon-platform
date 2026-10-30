"""«Примеры» v4: samples.html из живого релиза -> витрина всех работ на дизайн-системе ds-v4.

python build_samples_v4.py <samples.html релиза> <salon-portfolio-data.js> <salon-portfolio.js> <salon-products.js> <out-папка> [--preview]

Пишет <out>/samples.html (или samples-v4.html с --preview и noindex) и <out>/assets/js/salon-portfolio.js
с одной добавленной строкой: читалка открывается из новых карточек. Логика читалки не меняется.
Прежний блок «библиотеки» остаётся в разметке скрытым: на нём держится salon-portfolio.js."""
import html as H
import json
import re
import sys
from pathlib import Path

src, data_js, reader_js, products_js, out = (Path(a) for a in sys.argv[1:6])
preview = "--preview" in sys.argv[6:]
VER = "samples-v4-20261030-1"
DS_VER = "home-v4-20261030-4"
TG = "https://t.me/academicsaloon"
PLANE = ('<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.6 3.2 2.9 10.4c-1.3.5-1.3 1.2-.2 '
         '1.6l4.8 1.5 1.8 5.6c.2.6.4.8.8.8.4 0 .6-.2.9-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.3-.5-1.9-1.3-1.5z'
         'M9.4 13.2l8.6-5.4c.4-.3.8-.1.5.2l-7.1 6.4-.3 3.3-1.7-4.5z"/></svg>')
CHECK = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" '
         'stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>')

raw = data_js.read_text(encoding="utf-8")
docs = json.loads(raw[raw.index("["):raw.rindex("]") + 1])
by_id = {d["id"]: d for d in docs}
ORDER = ["method", "project", "practice", "risk", "referat", "essay", "comparison"]  # курсовая — первой, большой
assert set(ORDER) == set(by_id), sorted(by_id)
SIZES = {"method": (480, 621)}
total_pages = sum(d["pages"] for d in docs)

# Цены «от …» — из каталога сайта; на странице их ещё раз сверяет samples-v4.js
PRICES = {k: (None if v == "null" else int(v))
          for k, v in re.findall(r"id:'([a-z0-9_-]+)'[^}]*?price:([0-9]+|null)", products_js.read_text(encoding="utf-8"))}
assert all(d["product"] in PRICES for d in docs)


def esc(s):
    return H.escape(str(s), quote=True)


def plural(n, one, few, many):
    if n % 10 == 1 and n % 100 != 11:
        return one
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return few
    return many


def price(product):
    p = PRICES[product]
    return "от " + f"{p:,}".replace(",", " ") + " ₽" if p else "по заданию"


LEADS = {  # что внутри главной работы витрины (сверено с PDF)
    "method": "Пять разделов: от теории до обзора методик обследования. В конце — список литературы "
              "и приложения с диагностическими материалами.",
}


def card(d, featured=False):
    w, h = SIZES.get(d["id"], (480, 678))
    jumps = "".join(
        f'<li><a class="sm-jump" href="{esc(d["pdf"])}#page={j["page"]}" data-open="{d["id"]}" data-page="{j["page"]}">'
        f'{esc(j["label"])} <span aria-hidden="true">с. {j["page"]}</span><span class="ds-sr">, страница {j["page"]}</span></a></li>'
        for j in sorted(d["jumps"], key=lambda j: j["page"]))
    return (
        f'<article class="sm-card{" sm-card--featured" if featured else ""}">'
        f'<a class="sm-sheet" href="{esc(d["pdf"])}" data-open="{d["id"]}" tabindex="-1" aria-hidden="true">'
        f'<img src="assets/img/samples-v4/{d["id"]}.webp" width="{w}" height="{h}" alt="" '
        f'loading="{"eager" if featured else "lazy"}" decoding="async"></a>'
        f'<div class="sm-body"><p class="sm-kind">{esc(d["kind"])}<span>{d["pages"]} {plural(d["pages"], "страница", "страницы", "страниц")}</span></p>'
        f'<h3>{esc(d["title"])}</h3><p class="sm-meta">{esc(d["discipline"])}</p>'
        + (f'<p class="sm-lead">{esc(LEADS[d["id"]])}</p>' if featured and d["id"] in LEADS else "")
        + (f'<ul class="sm-jumps" aria-label="Открыть на странице">{jumps}</ul>' if jumps else "")
        + f'<div class="sm-actions"><a class="ds-btn ds-btn--violet sm-read" href="{esc(d["pdf"])}" data-open="{d["id"]}">Читать целиком</a>'
        f'<a class="sm-order" href="configurator.html?product={d["product"]}&amp;sample={d["id"]}">'
        f'<span>Заказать такую</span><b data-price-for="{d["product"]}">{price(d["product"])}</b></a></div></div></article>'
    )


# Как читать пример: шесть мест магистерской, каждое открывается на своей странице (сверено с PDF)
TOC_DOC = by_id["project"]
TOC = [
    ("Введение", 3, "Актуальность, гипотеза, цель и задачи, объект и предмет: весь аппарат исследования на пяти страницах."),
    ("Выводы по главе 1", 25, "Глава заканчивается выводами. Их сверяют с задачами из введения."),
    ("Таблица 2.1", 31, "Как оформлена таблица: номер, название, подписанные графы."),
    ("Рисунок 2.1", 36, "График по данным ведомств: подпись, источник и разбор в тексте."),
    ("Заключение", 99, "Итоги исследования на трёх страницах."),
    ("Список использованных источников", 102, "107 источников: законы, научные статьи и данные ведомств."),
]
toc_rows = "".join(
    f'<li><a class="sm-toc-row" href="{esc(TOC_DOC["pdf"])}#page={p}" data-open="{TOC_DOC["id"]}" data-page="{p}">'
    f'<span class="sm-toc-line"><b>{esc(t)}</b><i aria-hidden="true"></i><span class="sm-toc-page"><span class="ds-sr">страница </span>{p}</span></span>'
    f'<span class="sm-toc-note">{esc(n)}</span></a></li>'
    for t, p, n in TOC)

SECTIONS = [  # образцы разделов: id, заголовок, что показывает (по подписям в самих PDF)
    ("obrazec-vvedenie-vkr", "Введение ВКР",
     "Канон введения: актуальность, проблема, аппарат исследования, методики, новизна."),
    ("obrazec-glava-analiz", "Аналитический параграф",
     "Работа с данными: таблица, расчёт, интерпретация и вывод по параграфу."),
    ("obrazec-spisok-literatury", "Список литературы",
     "Оформление по ГОСТ Р 7.0.100-2018: законы, монографии, статьи, электронные и иностранные источники."),
]
section_cards = "".join(
    f'<article class="sm-sample"><a class="sm-sample-sheet" href="assets/samples/{sid}.pdf" data-open="{sid}" tabindex="-1" aria-hidden="true">'
    f'<img src="assets/img/samples-v4/{sid}.webp" width="480" height="679" alt="" loading="lazy" decoding="async"></a>'
    f'<h3>{esc(t)}</h3><p>{esc(p)}</p><a class="ds-link" href="assets/samples/{sid}.pdf" data-open="{sid}">Открыть образец'
    f'<span class="ds-sr">: {esc(t).lower()}</span></a></article>'
    for sid, t, p in SECTIONS)

FAN = ["essay", "comparison", "project", "method", "risk", "practice", "referat"]  # курсовая в центре, сверху
assert sorted(FAN) == sorted(ORDER)
stack = "".join(f'<img src="assets/img/samples-v4/{i}.webp" width="480" height="{SIZES.get(i, (480, 678))[1]}" alt="" '
                f'decoding="async" fetchpriority="low">' for i in FAN)

main = (
    '<main id="main" class="sm-main" data-portfolio>'
    '<section class="sm-hero ds-night" aria-labelledby="sm-title"><div class="sm-hero-copy">'
    '<h1 class="ds-display-1" id="sm-title">Примеры работ</h1>'
    '<p class="ds-lead">Настоящие работы из архива целиком: введение, главы, таблицы и список литературы. '
    'Полистай перед заказом и посмотри, что получишь.</p>'
    f'<ul class="sm-facts"><li><b>{len(docs)}</b> {plural(len(docs), "работа", "работы", "работ")}: от эссе до магистерской</li>'
    f'<li><b>{total_pages}</b> {plural(total_pages, "страница", "страницы", "страниц")} можно листать</li>'
    f'<li><b>{CHECK}</b> Копии обезличены</li></ul>'
    '<div class="sm-hero-actions"><a class="ds-btn ds-btn--lime" href="#works">Смотреть работы</a>'
    f'<a class="ds-btn ds-btn--ghost" href="{TG}" target="_blank" rel="noopener" data-tg-cta="samples_hero">{PLANE}Написать в Telegram</a></div></div>'
    f'<div class="sm-hero-stack" aria-hidden="true">{stack}</div></section>'

    '<section class="sm-section" id="works" aria-labelledby="sm-works-title"><div class="sm-head">'
    '<h2 class="ds-display-2" id="sm-works-title">Работы из архива</h2>'
    '<p class="ds-lead">Каждая открывается целиком: листай, ищи по тексту, переходи сразу к введению или таблицам.</p></div>'
    '<div class="sm-grid">' + card(by_id[ORDER[0]], featured=True) + "".join(card(by_id[i]) for i in ORDER[1:]) + '</div>'
    '<p class="sm-note">Настоящие архивные документы. Для просмотра подготовлены обезличенные копии: личные данные и сведения '
    'о заказчиках исключены. Служебные листы заменены. Содержание основной части сохранено.</p></section>'

    '<section class="sm-section sm-read-guide" aria-labelledby="sm-toc-title"><div class="sm-head">'
    '<h2 class="ds-display-2" id="sm-toc-title">На что смотреть в примере</h2>'
    '<p class="ds-lead">Пройди по магистерской так, как её читает проверяющий. Каждая строка открывает нужную страницу.</p>'
    f'<a class="ds-link sm-toc-all" href="{esc(TOC_DOC["pdf"])}" data-open="{TOC_DOC["id"]}">Открыть магистерскую целиком</a></div>'
    f'<div class="sm-toc"><p class="sm-toc-kind">{esc(TOC_DOC["kind"])}, {TOC_DOC["pages"]} {plural(TOC_DOC["pages"], "страница", "страницы", "страниц")}</p>'
    f'<p class="sm-toc-title">{esc(TOC_DOC["title"])}</p><ol class="sm-toc-list">{toc_rows}</ol></div></section>'

    '<section class="sm-section sm-panel ds-panel" aria-labelledby="sm-samples-title"><div class="sm-head">'
    '<h2 class="ds-display-2" id="sm-samples-title">Образцы разделов</h2>'
    '<p class="ds-lead">Мастерская написала их, чтобы показать подход к частым вопросам: как построить введение, '
    'как работать с данными и как оформить список литературы.</p></div>'
    f'<div class="sm-samples">{section_cards}</div></section>'

    '<section class="sm-final ds-night" aria-labelledby="sm-final-title"><div>'
    '<h2 class="ds-display-2" id="sm-final-title">Нужна такая же работа?</h2>'
    '<p class="ds-lead">Напиши тему, срок и пришли методичку. Цену и срок назовём до оплаты.</p></div>'
    f'<div class="sm-final-actions"><a class="ds-btn ds-btn--lime" href="{TG}" target="_blank" rel="noopener" data-tg-cta="samples_final">{PLANE}Написать в Telegram</a>'
    '<a class="ds-btn ds-btn--ghost" href="services.html">Посчитать стоимость</a></div></section>'

    # Прежняя библиотека: скрыта, но нужна salon-portfolio.js (кнопки типов и закладки читалки)
    '<section class="document-library" aria-hidden="true" hidden><nav id="library-types" class="library-types"></nav>'
    '<div class="library-stage"><div id="library-variants" class="library-variants"></div>'
    '<article id="library-document" class="library-document"></article></div></section>'
    '<noscript><p class="sm-note">Для просмотра документов в читалке включи JavaScript — или открой PDF по ссылкам выше. '
    '<a href="configurator.html">Перейти к заказу</a>.</p></noscript>'
    '</main>'
)

with open(src, encoding="utf-8", newline="") as fh:
    page = fh.read()


def once(old, new):
    global page
    assert page.count(old) == 1, old[:80]
    page = page.replace(old, new)


def after_tag(prefix, extra):
    global page
    assert page.count(prefix) == 1, prefix
    i = page.index(prefix)
    j = page.index(">", i) + 1
    page = page[:j] + extra + page[j:]


a = page.index('<main id="main" data-portfolio>')
b = page.index("</main>", a) + len("</main>")
page = page[:a] + main + page[b:]

# Призыв в подвале дублирует финальный блок страницы (как на главной)
i = page.index('<div class="bottom-heading">')
j = page.index("</div>", i) + len("</div>")
assert "<div" not in page[i + 5:j - 6]
page = page[:i] + page[j:]

assert 'href="assets/fonts/v4/onest-cyrillic.woff2"' in page  # Onest уже грузит ds-shell
after_tag('<link rel="stylesheet" href="assets/css/salon-reading.css',
          '<link rel="preload" href="assets/fonts/v4/literata-display-cyrillic.woff2" as="font" type="font/woff2" crossorigin>'
          f'<link rel="stylesheet" href="assets/css/ds-v4.css?v={DS_VER}">'
          f'<link rel="stylesheet" href="assets/css/samples-v4.css?v={VER}">')
after_tag('<script src="assets/js/salon-portfolio-data.js', f'</script><script src="assets/js/samples-v4-data.js?v={VER}">')
once('<script src="assets/js/salon-portfolio.js?v=reading-20260924-v1&amp;r=1db103769466a8b1"></script>',
     f'<script src="assets/js/salon-portfolio.js?v={VER}"></script><script src="assets/js/samples-v4.js?v={VER}" defer></script>')
once('<a id="pdf-order" class="button" href="configurator.html">Заказать работу ↗</a>',
     '<a id="pdf-order" class="button" href="configurator.html">Заказать такую работу</a>')
once('<body class="salon-direct salon-experience concept-shell salon-portfolio">',
     '<body class="salon-direct salon-experience concept-shell salon-portfolio ds-v4">')
if preview:
    once('<meta name="robots" content="index,follow,max-image-preview:large">', '<meta name="robots" content="noindex,nofollow">')

for need in ('id="library-types"', 'id="library-variants"', 'id="library-document"', 'id="pdf-reader"'):
    assert page.count(need) == 1, need
assert page.count('data-open="') == 2 * len(docs) + sum(len(d["jumps"]) for d in docs) + len(TOC) + 1 + 2 * len(SECTIONS)
assert all(p <= TOC_DOC["pages"] for _, p, _ in TOC)

# Читалка: одна строка — открыть документ из новых карточек
js = reader_js.read_text(encoding="utf-8")
tail = "\ndirectOpen();\n\n})();"
assert js.count(tail) == 1 and "SalonPortfolioReader" not in js
js = js.replace(tail, "\ndirectOpen();\n// Витрина примеров v4 открывает документы в этой же читалке\nwindow.SalonPortfolioReader={open:open};\n"
                    "function pagesWord(n){const a=n%10,b=n%100;return a===1&&b!==11?'страница':a>1&&a<5&&(b<12||b>14)?'страницы':'страниц'}\n\n})();")
kind = "$('pdf-kind').textContent=doc.kind+' · '+doc.pages+' страниц';"
assert js.count(kind) == 1
js = js.replace(kind, "$('pdf-kind').textContent=doc.kind+' · '+doc.pages+' '+pagesWord(doc.pages);")

(out / "assets/js").mkdir(parents=True, exist_ok=True)
name = "samples-v4.html" if preview else "samples.html"
with open(out / name, "w", encoding="utf-8", newline="") as fh:
    fh.write(page)
with open(out / "assets/js/salon-portfolio.js", "w", encoding="utf-8", newline="") as fh:
    fh.write(js)
print("ok", name, len(page), "docs", len(docs), "pages", total_pages)
