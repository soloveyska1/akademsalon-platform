"""Скриншоты 05 и 47: закрыть то, что на остальных скриншотах уже замазано.

05 — в цитате письма видны имя и отчество научного руководителя;
47 — видно имя файла с темой работы (на 02, 08, 40 такие имена скрыты).

python fix_screenshots.py <assets/img/reviews релиза> <out>
Пишет <out>/review-NN.webp и <out>/thumbs/review-NN.webp (миниатюра шириной 420, как у остальных)."""
import sys
from pathlib import Path
from PIL import Image

src, out = Path(sys.argv[1]), Path(sys.argv[2])
JOBS = {  # номер: (размер скриншота, размер клетки, области для пикселизации)
    5: ((590, 1014), 7, [(42, 363, 141, 382)]),    # «Елена Александровна,»
    47: ((946, 472), 14, [(148, 26, 866, 66)]),     # «Пониженный_уровень_са … вания_созависимых»
}


def mosaic(im, box, cell=7):
    region = im.crop(box)
    w, h = region.size
    small = region.resize((max(1, w // cell), max(1, h // cell)), Image.BILINEAR)
    im.paste(small.resize((w, h), Image.NEAREST), box[:2])


(out / "thumbs").mkdir(parents=True, exist_ok=True)
for no, (size, cell, boxes) in JOBS.items():
    im = Image.open(src / f"review-{no:02d}.webp").convert("RGB")
    assert im.size == size, (no, im.size)
    for box in boxes:
        mosaic(im, box, cell)
    im.save(out / f"review-{no:02d}.webp", "WEBP", quality=92, method=6)
    th = im.resize((420, round(im.height * 420 / im.width)), Image.LANCZOS)
    th.save(out / "thumbs" / f"review-{no:02d}.webp", "WEBP", quality=88, method=6)
    print(f"review-{no:02d}", im.size, "thumb", th.size)
