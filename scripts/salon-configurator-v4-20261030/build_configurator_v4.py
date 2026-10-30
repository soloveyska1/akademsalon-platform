"""Форма заявки v4: configurator.html из живого релиза -> страница на дизайн-системе ds-v4.

python build_configurator_v4.py <configurator.html релиза> <out>

Логика отправки не меняется: те же поля и id, salon-order.js и контракт заявки остаются. Добавляются
класс ds-v4, стили configurator-v4.css, скрипт configurator-v4.js (вуз и оригинальность попадают в текст
задания), Листик и следующие шаги на экране «Принято», Telegram в сводке. Подписи без капслока и стрелок.
Каждая замена проверяется."""
import sys
from pathlib import Path

src, dst = Path(sys.argv[1]), Path(sys.argv[2])
VER = "configurator-v4-20261030-2"
DS_VER = "home-v4-20261030-4"
TG = "https://t.me/academicsaloon"
PLANE = ('<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.6 3.2 2.9 10.4c-1.3.5-1.3 1.2-.2 '
         '1.6l4.8 1.5 1.8 5.6c.2.6.4.8.8.8.4 0 .6-.2.9-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.3-.5-1.9-1.3-1.5z'
         'M9.4 13.2l8.6-5.4c.4-.3.8-.1.5.2l-7.1 6.4-.3 3.3-1.7-4.5z"/></svg>')
with open(src, encoding="utf-8", newline="") as fh:
    html = fh.read()


def once(old, new):
    global html
    assert html.count(old) == 1, old
    html = html.replace(old, new)


def after_tag(prefix, extra):
    """Вставка сразу после тега, который начинается с prefix (тег встречается ровно один раз)."""
    global html
    assert html.count(prefix) == 1, prefix
    i = html.index(prefix)
    j = html.index(">", i) + 1
    html = html[:j] + extra + html[j:]


# Стили и скрипт: последними, после слоёв формы
after_tag('<link rel="stylesheet" href="assets/css/intake-studio.css',
          '<link rel="preload" href="assets/fonts/v4/literata-display-cyrillic.woff2" as="font" type="font/woff2" crossorigin>'
          f'<link rel="stylesheet" href="assets/css/ds-v4.css?v={DS_VER}">'
          f'<link rel="stylesheet" href="assets/css/configurator-v4.css?v={VER}">')
after_tag('<script src="assets/js/intake-studio.js',
          f'</script><script src="assets/js/configurator-v4.js?v={VER}" defer>')
once('<body class="salon-experience salon-direct concept-shell salon-intake">',
     '<body class="salon-experience salon-direct concept-shell salon-intake ds-v4">')

# Заголовок: без капслока, с понятным объёмом работы
once('<span class="eyebrow">ПОЧТИ ГОТОВО</span>', '')
once('<p>Задание и контакт. Остальное можно уточнить вместе.</p>',
     '<p>Три шага, около двух минут. Цену и срок пришлём до оплаты — без регистрации.</p>')

# Билет заказа и шаги формы
once('<small>ТВОЙ ЗАКАЗ</small>', '<small>Твой заказ</small>')
once('<details id="intake-task-details" class="intake-disclosure">', '<details id="intake-task-details" class="intake-disclosure" open>')
once('<input id="volume" maxlength="100" placeholder="25 страниц, 1 глава…"></div></div>',
     '<input id="volume" maxlength="100" placeholder="25 страниц, 1 глава…"></div></div>'
     '<div class="form-two cfg4-extra">'
     '<div><label for="cfg4-university">Вуз <span class="ic-optional">необязательно</span></label>'
     '<input id="cfg4-university" maxlength="120" placeholder="Например, РАНХиГС" autocomplete="organization"></div>'
     '<div><label for="cfg4-originality">Оригинальность <span class="ic-optional">если есть требование</span></label>'
     '<input id="cfg4-originality" maxlength="120" placeholder="Например, от 70% в Антиплагиат.ВУЗ"></div>'
     '</div><p class="field-note cfg4-extra-note">Попадут в текст задания — так точнее оценим работу.</p>')
once('Получить расчёт <span aria-hidden="true">→</span>', 'Получить расчёт')
once('Есть полное задание? Вставить текст ↗</button>', 'Вставить текст задания</button>')

# Сводка: обычный регистр, Telegram под рукой
once('<span class="small-label">ВАШ ЗАКАЗ</span>', '<span class="small-label">Твой заказ</span>')
once('<span class="small-label">ЧТО ПОЛУЧИТЕ</span>', '<span class="small-label">Что получишь</span>')
once('<a class="text-link" href="priyomnaya.html">Нужно обсудить задачу? ↗</a></aside>',
     f'<div class="cfg4-help"><p>Не уверен, что выбрать? Спроси — ответим за 15–30 минут в рабочее время.</p>'
     f'<a class="cfg4-tg" href="{TG}" target="_blank" rel="noopener" data-tg-cta="order">{PLANE}Спросить в Telegram</a>'
     f'<a class="text-link" href="priyomnaya.html">Другие способы связи</a></div></aside>')

# Экран «Принято»: Листик, что дальше, Telegram
once('<span class="eyebrow">ЗАЯВКА ПОДТВЕРЖДЕНА</span>', '')
once('Точную цену и срок пришлём по вашему контакту.</p>',
     'Точную цену и срок пришлём по контакту из заявки.</p>'
     '<ol class="cfg4-next">'
     '<li><b>Проверим задание и файлы</b><span>Если чего-то не хватит, спросим сами.</span></li>'
     '<li><b>Пришлём цену и срок</b><span>В рабочее время обычно за 15–30 минут.</span></li>'
     '<li><b>Согласуем и начнём</b><span>Работа стартует после согласования и оплаты.</span></li>'
     '</ol>')
once('<a id="success-cabinet" class="button large" href="dashboard.html">Открыть мой заказ ↗</a>',
     '<div class="cfg4-success-actions"><a id="success-cabinet" class="button large" href="dashboard.html">Открыть мой заказ</a>'
     f'<a class="cfg4-tg" href="{TG}" target="_blank" rel="noopener" data-tg-cta="order_success">{PLANE}Написать в Telegram</a></div>')
once('<section id="order-success" class="order-success" tabindex="-1" hidden>',
     '<section id="order-success" class="order-success" tabindex="-1" hidden>'
     '<img class="cfg4-listik" src="assets/img/home-v4/listik-wave.webp" width="388" height="440" alt="" decoding="async">')

# Страница заявки и так закрыта от индексации, отдельный режим превью не нужен
assert '<meta name="robots" content="noindex,follow">' in html
for gone in ("ПОЧТИ ГОТОВО", "ВАШ ЗАКАЗ", "ЧТО ПОЛУЧИТЕ", "ЗАЯВКА ПОДТВЕРЖДЕНА"):
    assert gone not in html, gone
assert 'id="cfg4-university"' in html and html.count("configurator-v4.js") == 1
dst.parent.mkdir(parents=True, exist_ok=True)
with open(dst, "w", encoding="utf-8", newline="") as fh:
    fh.write(html)
print("ok", len(html))
