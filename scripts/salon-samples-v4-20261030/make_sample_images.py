"""Картинки витрины примеров: обложки семи работ (страница-превью из архива) и первые страницы
трёх образцов разделов, WebP шириной 480 px."""
import sys
from pathlib import Path
import pymupdf
from PIL import Image

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
for cid in ("comparison", "risk", "method", "referat", "essay", "practice", "project"):
    im = Image.open(src / f"{cid}.png").convert("RGB")
    im = im.resize((480, round(im.height * 480 / im.width)), Image.LANCZOS)
    im.save(out / f"{cid}.webp", "WEBP", quality=84, method=6)
    print(cid, im.size)
for name in ("obrazec-vvedenie-vkr", "obrazec-glava-analiz", "obrazec-spisok-literatury"):
    page = pymupdf.open(src / f"{name}.pdf")[0]
    pix = page.get_pixmap(dpi=110)
    im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    im = im.resize((480, round(im.height * 480 / im.width)), Image.LANCZOS)
    im.save(out / f"{name}.webp", "WEBP", quality=84, method=6)
    print(name, im.size)
