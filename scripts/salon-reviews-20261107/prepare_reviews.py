"""Отзывы 62–64 из скриншотов Telegram (07.11.2026): аватарка в реакции (63, 64) запикселены,
рамка окна срезана по пикселю с краёв, полный WebP и миниатюра шириной 420.

python prepare_reviews.py <папка со скриншотами 1.png, 2.png, 3.png> <out> [имена через запятую]"""
import sys
from pathlib import Path
from PIL import Image

src, out = Path(sys.argv[1]), Path(sys.argv[2])
# файл -> (номер отзыва, области для пикселизации)
JOBS = {
    "1": (62, []),                    # «посмотрела, спасибо огромное» + ответ мастера
    "2": (63, [(48, 68, 71, 91)]),    # «Семен ты машина», аватарка в реакции
    "3": (64, [(36, 72, 59, 94)]),    # «Спасибо большое от души… я медсестра же», аватарка в реакции
}
only = sys.argv[3].split(",") if len(sys.argv) > 3 else None


def mosaic(im, box, cell=5):
    region = im.crop(box)
    w, h = region.size
    small = region.resize((max(1, w // cell), max(1, h // cell)), Image.BILINEAR)
    im.paste(small.resize((w, h), Image.NEAREST), box[:2])


(out / "thumbs").mkdir(parents=True, exist_ok=True)
for name, (no, boxes) in JOBS.items():
    if only and name not in only:
        continue
    im = Image.open(src / f"{name}.png").convert("RGB")
    for box in boxes:
        mosaic(im, box)
    im = im.crop((1, 1, im.width - 1, im.height - 1))
    im.save(out / f"review-{no}.webp", "WEBP", quality=92, method=6)
    th = im.resize((420, round(im.height * 420 / im.width)), Image.LANCZOS)
    th.save(out / "thumbs" / f"review-{no}.webp", "WEBP", quality=88, method=6)
    print(f"review-{no}", im.size, "thumb", th.size)
