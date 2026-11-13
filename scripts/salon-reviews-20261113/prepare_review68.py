"""Отзыв 68 (13.11.2026): скриншот Telegram с итогом проверки Антиплагиата внутри переписки.
Закрыто плашками: дата последней проверки и постраничная структура документа (по ним работу можно
найти в системе вуза); аватарка в реакции запикселена; сверху срезан край чужого сообщения.
Полный WebP и миниатюра шириной 420.

python prepare_review68.py <папка с 1.png> <out>"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

src, out = Path(sys.argv[1]), Path(sys.argv[2])
NO = 68
GREY = (214, 218, 223)
BARS = [
    (217, 254, 252, 264),  # дата последней проверки
    (129, 286, 523, 296),  # структура документа, строка 1
    (129, 299, 362, 308),  # структура документа, строка 2
]
AVATARS = [(57, 51, 86, 79)]
TOP = 6


def mosaic(im, box, cell=7):
    region = im.crop(box)
    w, h = region.size
    small = region.resize((max(1, w // cell), max(1, h // cell)), Image.BILINEAR)
    im.paste(small.resize((w, h), Image.NEAREST), box[:2])


im = Image.open(src / "1.png").convert("RGB")
d = ImageDraw.Draw(im)
for box in BARS:
    d.rounded_rectangle(box, radius=3, fill=GREY)
for box in AVATARS:
    mosaic(im, box)
im = im.crop((1, TOP, im.width - 1, im.height - 1))

(out / "thumbs").mkdir(parents=True, exist_ok=True)
im.save(out / f"review-{NO}.webp", "WEBP", quality=92, method=6)
th = im.resize((420, round(im.height * 420 / im.width)), Image.LANCZOS)
th.save(out / "thumbs" / f"review-{NO}.webp", "WEBP", quality=88, method=6)
im.save(out / f"review-{NO}-check.png")
print(f"review-{NO}", im.size, "thumb", th.size)
