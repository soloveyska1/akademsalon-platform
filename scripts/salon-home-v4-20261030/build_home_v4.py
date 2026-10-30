"""Собирает главную v4 из index.html release230: новый <main> с калькулятором, дизайн-система
ds-v4, свои шрифты; старые скрипты калькулятора (salon-home, salon-select) с главной убраны.
Каждая замена проверяется."""
import sys
from pathlib import Path

src, partial, dst = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
with open(src, encoding="utf-8", newline="") as fh:
    html = fh.read()
main = partial.read_text(encoding="utf-8")

TG = "https://t.me/academicsaloon"
VER = "home-v4-20261030-4"
ICON = ('<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.6 3.2 2.9 10.4c-1.3.5-1.3 1.2-.2 '
        '1.6l4.8 1.5 1.8 5.6c.2.6.4.8.8.8.4 0 .6-.2.9-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.3-.5-1.9-1.3-1.5z'
        'M9.4 13.2l8.6-5.4c.4-.3.8-.1.5.2l-7.1 6.4-.3 3.3-1.7-4.5z"/></svg>')

VOICES = [  # (скриншот, высота миниатюры при ширине 420, подпись по тексту сообщения)
    ("05", 722, "Диплом приняли без единой правки"),
    ("12", 108, "«ВКР — 5!»"),
    ("09", 197, "«Не думала, что на следующий день всё отправишь»"),
    ("02", 382, "«У меня 5 без защиты, работа очень хорошая»"),
    ("13", 109, "Диплом на 5, госэкзамены на 5"),
    ("15", 211, "«Спасибо, особенно за нормоконтроль»"),
    ("45", 431, "«5 с отличием!» Позвали в магистратуру"),
    ("40", 193, "Правки по титульнику в тот же час"),
    ("33", 560, "«Похвалили — сказали, очень уверенно выступаю»"),
]
CATALOG = [
    ("kursovaya-rabota.html", "Курсовая работа"),
    ("diplomnaya-rabota.html", "Дипломная работа и ВКР"),
    ("otchet-po-praktike.html", "Отчёт по практике"),
    ("magisterskaya-dissertaciya.html", "Магистерская диссертация"),
    ("kandidatskaya-dissertaciya.html", "Кандидатская диссертация"),
    ("referat.html", "Реферат"),
    ("nauchnaya-statya.html", "Научная статья"),
    ("kursovaya-po-psihologii.html", "Курсовая по психологии"),
    ("kursovaya-po-pedagogike.html", "Курсовая по педагогике"),
    ("kursovaya-po-ekonomike.html", "Курсовая по экономике"),
    ("kursovaya-po-yurisprudencii.html", "Курсовая по юриспруденции"),
    ("kursovaya-po-menedzhmentu.html", "Курсовая по менеджменту"),
    ("kursovaya-po-informatike.html", "Курсовая по информатике"),
    ("diplomnaya-po-psihologii.html", "Диплом по психологии"),
    ("diplomnaya-po-ekonomike.html", "Диплом по экономике"),
    ("diplomnaya-po-yurisprudencii.html", "Диплом по юриспруденции"),
    ("razbor-zamechaniy-nauchruka.html", "Разбор замечаний научрука"),
    ("normokontrol-vkr.html", "Нормоконтроль ВКР"),
    ("redaktura-posle-ii.html", "Редактура после ИИ"),
    ("dorabotka-otcheta-po-praktike.html", "Доработка отчёта по практике"),
    ("komissiya-0.html#rehearsal", "Тренажёр вопросов к защите"),
]


def svg(body):
    return ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>')


ICONS = {
    "I_CHAT": svg('<path d="M4 5.5h16v10.5H10l-4.5 3.5V16H4z"/><path d="M8.5 10.5h7"/>'),
    "I_RECEIPT": svg('<path d="M6 3h12v18l-2.5-1.6L13 21l-2.5-1.6L8 21l-2-1.3z"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
    "I_WALLET": svg('<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18"/><path d="M16 14.5h2"/>'),
    "I_FILECHECK": svg('<path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3v5h5"/><path d="M9 14.5l2 2 4-4"/>'),
    "I_CLIPBOARD": svg('<rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 3h6v3H9z"/><path d="M9 11h6M9 15h4"/>'),
    "I_REFRESH": svg('<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>'),
    "I_SHIELD": svg('<path d="M12 3l7 3v5.5c0 4.6-3 8-7 9.5-4-1.5-7-4.9-7-9.5V6z"/><path d="M9 12l2 2 4-4"/>'),
    "I_CLOCK": svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    "I_RETURN": svg('<path d="M9 8L4.5 12.5 9 17"/><path d="M4.5 12.5H15a4.5 4.5 0 0 1 0 9h-2"/>'),
    "I_CARD": svg('<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 9.5h18"/><path d="M7 14.5h4"/>'),
    "I_DOC": svg('<path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3v5h5"/><path d="M8.5 13h7M8.5 16.5h5"/>'),
    "I_LOCK": svg('<rect x="5" y="10.5" width="14" height="10.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'),
}


NB = " "


def money(n):
    return f"{n:,}".replace(",", NB) + NB + "₽"


def chip(name, value, label, small=None, checked=False, kind="radio", price_for=False):
    attr = ' checked' if checked else ''
    sm = ''
    if small is not None:
        pf = f' data-price-for="{value}"' if price_for else ''
        sm = f'<small{pf}>{small}</small>'
    return (f'        <label class="ds-choice"><input type="{kind}" name="{name}" value="{value}"{attr}>'
            f'<span class="ds-chip">{label}{sm}</span></label>')


WORK_MAIN = [("course", "Курсовая", 14000), ("diplom", "Диплом / ВКР", 40000), ("practice", "Отчёт по практике", 14000),
             ("master", "Магистерская", 60000), ("referat", "Реферат", 2500), ("essay", "Эссе", 2500)]
WORK_MORE = [("self", "Контрольная, самостоятельная", 2500), ("chapter", "Отдельная глава", 30000),
             ("rinc", "Научная статья", 9000), ("kandidat", "Кандидатская", 200000),
             ("editing", "Доработка текста", None), ("intro", "Введение или заключение", None),
             ("custom", "Другая задача", None)]
SCOPES = [("whole", "Целиком"), ("part", "Часть"), ("editing", "Доработка")]
DISCS = [("hum", "Гуманитарные и экономика"), ("jurisprudence", "Юриспруденция"), ("pedagogy", "Педагогика"),
         ("psychology", "Психология"), ("tech", "Технические и IT"), ("med", "Медицина и финансы")]
TERMS = [("later", "Не срочно", "от месяца"), ("weeks", "2–4 недели", "+15%"), ("soon", "До 2 недель", "+45%"),
         ("tomorrow", "За сутки", "×2")]
ADDONS = [("defense", "Презентация и речь", "+6" + NB + "000" + NB + "₽"),
          ("norm", "Нормоконтроль", "+5" + NB + "000" + NB + "₽"),
          ("tutor", "Разобраться в работе", "+3" + NB + "000" + NB + "₽")]

CALC = {
    "WORK_CHIPS": "\n".join(chip("work", v, l, "от " + money(p), v == "course", price_for=True) for v, l, p in WORK_MAIN),
    "WORK_MORE": "\n".join(chip("work", v, l, ("от " + money(p)) if p else "по заданию", price_for=True) for v, l, p in WORK_MORE),
    "SCOPE_SEG": "\n".join(chip("scope", v, l, None, v == "whole") for v, l in SCOPES),
    "DISC_CHIPS": "\n".join(chip("disc", v, l, None, v == "hum") for v, l in DISCS),
    "TERM_SEG": "\n".join(chip("term", v, l, s, v == "later") for v, l, s in TERMS),
    "ADDON_CHIPS": "\n".join(chip("addon", v, l, s, kind="checkbox") for v, l, s in ADDONS),
}


def replace_once(old, new):
    global html
    n = html.count(old)
    assert n == 1, (old[:70], n)
    html = html.replace(old, new)


voices = "\n".join(
    f'    <figure class="hv-voice"><a href="assets/img/reviews/review-{n}.webp">'
    f'<span class="hv-voice-shot"><img src="assets/img/reviews/thumbs/review-{n}.webp" width="420" height="{h}" '
    f'alt="Скриншот переписки: {cap.strip("«»")}" loading="lazy" decoding="async"></span></a>'
    f'<figcaption>{cap}</figcaption></figure>'
    for n, h, cap in VOICES
)
catalog = "\n".join(f'    <li><a href="{href}">{label}</a></li>' for href, label in CATALOG)
main = (main.replace("{{TG}}", TG).replace("{{ICON}}", ICON)
        .replace("{{VOICES}}", voices).replace("{{CATALOG}}", catalog)).rstrip("\n")
for k, v in ICONS.items():
    main = main.replace("{{" + k + "}}", v)
for k, v in CALC.items():
    main = main.replace("{{" + k + "}}", v)
assert "{{" not in main

# 1. Новый <main> (и липкая панель сразу после него)
start = html.index('<main id="main">')
end = html.index("</main>", start) + len("</main>")
assert html.count('<main id="main">') == 1 and html.count("</main>") == 1
html = html[:start] + main + html[end:]

# 2. Призыв в подвале дублирует финальный блок страницы
i = html.index('<div class="bottom-heading">')
j = html.index("</div>", i) + len("</div>")
assert "<div" not in html[i + 5:j - 6]
html = html[:i] + html[j:]

# 3. Шрифты, стили и скрипт главной v4 вместо home-trust
replace_once('<link rel="stylesheet" href="assets/css/home-trust.css?v=trust-20261030-v2">',
             f'<link rel="preload" href="assets/fonts/v4/onest-cyrillic.woff2" as="font" type="font/woff2" crossorigin>'
             f'<link rel="preload" href="assets/fonts/v4/literata-display-cyrillic.woff2" as="font" type="font/woff2" crossorigin>'
             f'<link rel="stylesheet" href="assets/css/ds-v4.css?v={VER}">'
             f'<link rel="stylesheet" href="assets/css/home-v4.css?v={VER}">')
# Старый калькулятор главной больше не нужен: его заменил новый в home-v4.js
replace_once('<script src="assets/js/salon-home.js?v=20260909catalog1&amp;r=156d82ab1e1e94ef"></script>', '')
replace_once('<script src="assets/js/salon-select.js?v=20260909portfolio1&amp;r=33c4498ec9f32dce"></script>', '')
replace_once('<link rel="stylesheet" href="assets/css/salon-select.css?v=20260909portfolio1&amp;r=6c41671409283630">', '')
replace_once('<body class="salon-experience salon-direct concept-shell salon-home">', '<body class="salon-experience salon-direct concept-shell salon-home ds-v4">')
replace_once('<script src="assets/js/home-trust.js?v=trust-20261030-v2" defer></script>',
             f'<script src="assets/js/home-v4.js?v={VER}" defer></script>')

assert "home-trust" not in html and "home-voices" not in html
assert "data-home-workbench" not in html and "salon-home.js" not in html and "salon-select" not in html
assert html.count('id="calc-form"') == 1 and 'class="salon-experience salon-direct concept-shell salon-home ds-v4"' in html
dst.parent.mkdir(parents=True, exist_ok=True)
dst.write_text(html, encoding="utf-8", newline="")
print("ok", len(html), "catalog:", " ".join(h for h, _ in CATALOG))
