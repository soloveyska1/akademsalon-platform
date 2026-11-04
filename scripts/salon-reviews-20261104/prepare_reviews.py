"""Два новых отзыва из скриншотов Telegram (04.11.2026): запикселить аватарки в реакциях,
срезать ответ мастера под сообщением клиента, сохранить полный WebP и миниатюру шириной 420.

python prepare_reviews.py <папка со скриншотами 1.png, 2.png> <out>"""
import sys
from pathlib import Path
from PIL import Image

src, out = Path(sys.argv[1]), Path(sys.argv[2])
# файл -> (номер отзыва, нижняя граница кадра или None, области для пикселизации)
JOBS = {
    "1": (58, None, [(44, 124, 79, 146)]),  # «Всё было на высоте», две аватарки в реакциях
    "2": (59, 120, []),                      # ответ мастера «Крутяк)» с аватаркой срезан целиком
}


def mosaic(im, box, cell=7):
    region = im.crop(box)
    w, h = region.size
    small = region.resize((max(1, w // cell), max(1, h // cell)), Image.BILINEAR)
    im.paste(small.resize((w, h), Image.NEAREST), box[:2])


(out / "thumbs").mkdir(parents=True, exist_ok=True)
for name, (no, bottom, boxes) in JOBS.items():
    im = Image.open(src / f"{name}.png").convert("RGB")
    for box in boxes:
        mosaic(im, box)
    im = im.crop((1, 1, im.width - 1, (bottom or im.height) - 1))
    im.save(out / f"review-{no}.webp", "WEBP", quality=92, method=6)
    th = im.resize((420, round(im.height * 420 / im.width)), Image.LANCZOS)
    th.save(out / "thumbs" / f"review-{no}.webp", "WEBP", quality=88, method=6)
    print(f"review-{no}", im.size, "thumb", th.size)
