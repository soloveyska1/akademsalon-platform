"""Новые отзывы из скриншотов Telegram: срезать обрывки чужих сообщений, запикселить аватарки
в реакциях (как в остальных отзывах), сохранить полный WebP и миниатюру шириной 420."""
import sys
from pathlib import Path
from PIL import Image

src, out = Path(sys.argv[1]), Path(sys.argv[2])
# номер файла пользователя -> (номер отзыва, срез сверху, области для пикселизации в исходных координатах)
JOBS = {
    "6": (51, 13, [(50, 187, 77, 214)]),
    "3": (52, 0, [(47, 102, 74, 129)]),
    "1": (53, 8, []),
    "7": (54, 0, []),
    "2": (55, 0, []),
    "5": (56, 0, []),
    "4": (57, 19, []),
}


def mosaic(im, box, cell=7):
    region = im.crop(box)
    w, h = region.size
    small = region.resize((max(1, w // cell), max(1, h // cell)), Image.BILINEAR)
    im.paste(small.resize((w, h), Image.NEAREST), box[:2])


for name, (no, top, boxes) in JOBS.items():
    im = Image.open(src / f"{name}.png").convert("RGB")
    for box in boxes:
        mosaic(im, box)
    im = im.crop((1, 1 + top, im.width - 1, im.height - 1))  # по пикселю с краёв — рамка окна
    full = out / f"review-{no}.webp"
    im.save(full, "WEBP", quality=92, method=6)
    th = im.resize((420, round(im.height * 420 / im.width)), Image.LANCZOS)
    th.save(out / "thumbs" / f"review-{no}.webp", "WEBP", quality=88, method=6)
    print(f"review-{no}", im.size, "thumb", th.size)
