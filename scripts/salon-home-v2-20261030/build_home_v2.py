"""Собирает главную v2 из живой index.html: меняет <main>, убирает дубль призыва
из подвала и подключает home-v2.css/js вместо home-trust. Каждая замена проверяется."""
import sys
from pathlib import Path

src, partial, dst = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
with open(src, encoding="utf-8", newline="") as fh:
    html = fh.read()
main = partial.read_text(encoding="utf-8")

TG = "https://t.me/academicsaloon"
VER = "home-v2-20261030-4"
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

# 3. Стили и скрипт главной v2 вместо home-trust
replace_once('<link rel="stylesheet" href="assets/css/home-trust.css?v=trust-20261030-v2">',
             f'<link rel="stylesheet" href="assets/css/home-v2.css?v={VER}">')
replace_once('<script src="assets/js/home-trust.js?v=trust-20261030-v2" defer></script>',
             f'<script src="assets/js/home-v2.js?v={VER}" defer></script>')

assert "home-trust" not in html and "home-voices" not in html
assert html.count("data-home-workbench") == 1 and html.count("data-home-faq") == 1
dst.parent.mkdir(parents=True, exist_ok=True)
dst.write_text(html, encoding="utf-8", newline="")
print("ok", len(html), "catalog:", " ".join(h for h, _ in CATALOG))
