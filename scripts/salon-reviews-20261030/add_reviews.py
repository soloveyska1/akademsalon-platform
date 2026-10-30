"""Добавляет новые отзывы в начало reviews.html и обновляет число отзывов на главной.

python add_reviews.py <папка с HTML релиза> <папка с картинками out/>

Карточки повторяют разметку остальных (rv-card, миниатюра 420 px, подпись — слова клиента)."""
import sys
from pathlib import Path
from PIL import Image

root, imgs = Path(sys.argv[1]), Path(sys.argv[2])
NEW = [  # номер, тема фильтра, подпись
    (51, "result", "«Защитилась на 5. Он похвалил работу!»"),
    (52, "result", "«Вчера сдала НПР на хорошо. Работу похвалили!»"),
    (53, "result", "«Никаких исправлений не прислал, сказал, что принимает»"),
    (54, "result", "«Всё ок, 5 поставил с минусом»"),
    (55, "care", "«Всё сдала, всё супер. По ВКР работаем?»"),
    (56, "result", "«Сдала НПР, всё супер! Спасибо за твоё существование»"),
    (57, "care", "«Да, всё в порядке, работа огонь»"),
]
OLD_TOTAL, NEW_TOTAL = 47, 47 + len(NEW)


def card(no, topic, cap):
    w, h = Image.open(imgs / "thumbs" / f"review-{no}.webp").size
    assert w == 420
    return (f'<a class="rv-card" data-topic="{topic}" href="assets/img/reviews/review-{no}.webp" '
            f'aria-label="Открыть отзыв: {cap}"><span class="rv-card-top">Сообщение клиента '
            f'<span aria-hidden="true">↗</span></span><div class="rv-shot"><img src="assets/img/reviews/thumbs/review-{no}.webp" '
            f'width="420" height="{h}" alt="{cap}" loading="lazy"></div><h2>{cap}</h2>'
            f'<span class="rv-card-foot">Прочитать целиком <span aria-hidden="true">＋</span></span></a>')


def rewrite(name, pairs):
    p = root / name
    with open(p, encoding="utf-8", newline="") as fh:
        html = fh.read()
    for old, new in pairs:
        assert html.count(old) == 1, (name, old[:60])
        html = html.replace(old, new)
    with open(p, "w", encoding="utf-8", newline="") as fh:
        fh.write(html)


GRID = '<section class="rv-grid" aria-label="Отзывы клиентов">'
with open(root / "reviews.html", encoding="utf-8") as fh:
    assert "review-51.webp" not in fh.read(), "уже добавлено"
rewrite("reviews.html", [(GRID, GRID + "".join(card(*x) for x in NEW))])
for page in ("index.html", "home-v4.html"):
    rewrite(page, [(f"{OLD_TOTAL} сообщений из переписки с клиентами", f"{NEW_TOTAL} сообщения из переписки с клиентами"),
                   (f'<a href="reviews.html">{OLD_TOTAL} отзывов</a>', f'<a href="reviews.html">{NEW_TOTAL} отзыва</a>')])
print("ok", NEW_TOTAL)
