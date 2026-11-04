"""Добавляет два новых отзыва в начало reviews.html и обновляет число отзывов на главной.

python add_reviews.py <папка с HTML релиза> <папка с картинками img/>

Повторяет scripts/salon-reviews-20261030/add_reviews.py: та же разметка rv-card,
миниатюра 420 px, подпись — слова клиента. Применять к HTML release250 и новее."""
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # на сервере Pillow может не быть: размеры миниатюр из img/thumbs/
    Image = None
THUMB_SIZES = {58: (420, 154), 59: (420, 116)}

root, imgs = Path(sys.argv[1]), Path(sys.argv[2])
NEW = [  # номер, тема фильтра, подпись
    (59, "result", "«Защита прошла отлично, ничего не спросили, похвалили авторскую анкету»"),
    (58, "care", "«Всё было на высоте! Выручаешь как всегда»"),
]
OLD_TOTAL, NEW_TOTAL = 54, 54 + len(NEW)


def card(no, topic, cap):
    thumb = imgs / "thumbs" / f"review-{no}.webp"
    w, h = Image.open(thumb).size if Image else THUMB_SIZES[no]
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
    assert "review-58.webp" not in fh.read(), "уже добавлено"
rewrite("reviews.html", [(GRID, GRID + "".join(card(*x) for x in NEW))])
for page in ("index.html", "home-v4.html"):
    if not (root / page).exists():
        continue
    rewrite(page, [(f"{OLD_TOTAL} сообщения из переписки с клиентами", f"{NEW_TOTAL} сообщений из переписки с клиентами"),
                   (f'<a href="reviews.html">{OLD_TOTAL} отзыва</a>', f'<a href="reviews.html">{NEW_TOTAL} отзывов</a>')])
print("ok", NEW_TOTAL)
