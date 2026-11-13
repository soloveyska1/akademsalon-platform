"""Отзыв 69 (13.11.2026): скриншот Telegram. Имя клиента в цитате ответа закрыто плашкой,
аватарка в реакции запикселена, сверху срезан край чужого сообщения.
Полный WebP и миниатюра шириной 420.

python prepare_review69.py <папка с 1.png> <out>"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

src, out = Path(sys.argv[1]), Path(sys.argv[2])
NO = 69
BARS = [((731, 181, 950, 201), (168, 205, 235))]  # имя в цитате
AVATARS = [(741, 254, 769, 282)]
TOP = 18


def mosaic(im, box, cell=7):
    region = im.crop(box)
    w, h = region.size
    small = region.resize((max(1, w // cell), max(1, h // cell)), Image.BILINEAR)
    im.paste(small.resize((w, h), Image.NEAREST), box[:2])


im = Image.open(src / "1.png").convert("RGB")
d = ImageDraw.Draw(im)
for box, color in BARS:
    d.rounded_rectangle(box, radius=5, fill=color)
for box in AVATARS:
    mosaic(im, box)
im = im.crop((1, TOP, im.width - 1, im.height - 1))

(out / "thumbs").mkdir(parents=True, exist_ok=True)
im.save(out / f"review-{NO}.webp", "WEBP", quality=92, method=6)
th = im.resize((420, round(im.height * 420 / im.width)), Image.LANCZOS)
th.save(out / "thumbs" / f"review-{NO}.webp", "WEBP", quality=88, method=6)
im.save(out / f"review-{NO}-check.png")
print(f"review-{NO}", im.size, "thumb", th.size)
