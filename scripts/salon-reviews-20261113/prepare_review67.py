"""Отзыв 67 (13.11.2026): переписка из Telegram + итог проверки из отчёта Антиплагиата одной картинкой.
Закрыто плашками: имя файла работы в цитате, номер и дата в имени отчёта, дата в имени снимка экрана,
название вуза в сообщении; аватарки в реакциях запикселены. Полный WebP и миниатюра шириной 420.

python prepare_review67.py <папка с 1.png (переписка) и 2.png (итог проверки)> <out>"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

src, out = Path(sys.argv[1]), Path(sys.argv[2])
NO = 67
BARS = [  # область, цвет плашки
    ((62, 107, 221, 129), (176, 214, 160)),   # «Психологическая…» в цитате (зелёная подложка)
    ((155, 286, 286, 310), (205, 210, 216)),  # Report_<номер_дата>.pdf
    ((251, 353, 393, 377), (205, 210, 216)),  # Снимок экрана <дата время>.png
    ((103, 464, 158, 488), (205, 210, 216)),  # вуз после «через АП»
]
AVATARS = [(52, 227, 79, 253), (52, 538, 79, 565)]
BG = (114, 177, 224)
CHAT_SCALE, PANEL_W, PAD = 1.25, 748, 16


def mosaic(im, box, cell=7):
    region = im.crop(box)
    w, h = region.size
    small = region.resize((max(1, w // cell), max(1, h // cell)), Image.BILINEAR)
    im.paste(small.resize((w, h), Image.NEAREST), box[:2])


chat = Image.open(src / "1.png").convert("RGB")
d = ImageDraw.Draw(chat)
for box, color in BARS:
    d.rounded_rectangle(box, radius=5, fill=color)
for box in AVATARS:
    mosaic(chat, box)
chat = chat.crop((1, 1, chat.width - 1, chat.height - 1))
chat = chat.resize((round(chat.width * CHAT_SCALE), round(chat.height * CHAT_SCALE)), Image.LANCZOS)

panel = Image.open(src / "2.png").convert("RGB")
panel = panel.crop((8, 8, panel.width - 4, panel.height - 4))
panel = panel.resize((PANEL_W, round(panel.height * PANEL_W / panel.width)), Image.LANCZOS)
mask = Image.new("L", panel.size, 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, panel.width - 1, panel.height - 1), radius=18, fill=255)

W = max(chat.width, PANEL_W + 2 * PAD)
im = Image.new("RGB", (W, chat.height + panel.height + PAD), BG)
im.paste(chat, (0, 0))
im.paste(panel, ((W - PANEL_W) // 2, chat.height), mask)

(out / "thumbs").mkdir(parents=True, exist_ok=True)
im.save(out / f"review-{NO}.webp", "WEBP", quality=92, method=6)
th = im.resize((420, round(im.height * 420 / im.width)), Image.LANCZOS)
th.save(out / "thumbs" / f"review-{NO}.webp", "WEBP", quality=88, method=6)
im.save(out / f"review-{NO}-check.png")
print(f"review-{NO}", im.size, "thumb", th.size)
