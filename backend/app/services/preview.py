"""Защищённый предпросмотр работы: клиент видит документ, «сдать» его нельзя.

Зачем: правило «сначала оплата — потом файл» иногда упирается в клиента,
который хочет увидеть работу ДО оплаты. Отдавать оригинал — риск, что
«кинут»; не отдавать — конфликт и недоверие. Предпросмотр развязывает узел.

Слои защиты (важно понимать, от чего каждый):
1. РАСТР: в файле нет текстового слоя — обычное выделение/копирование
   и «вставить в чистый док» не работают, знаки не убрать PDF-редактором.
2. ЛОВУШКИ против OCR-копирования (macOS Live Text, Google Lens и т.п.
   распознают текст на картинках!): частая сетка контрастных строк
   «·ОБРАЗЕЦ·№N·сP·NN·» поверх и между строк — распознавалка вплетает их
   в КАЖДУЮ строку копии. В каждой ловушке уникальный код (страница/ряд),
   поэтому массовая автозамена бессильна — чистка равна перенабору.
3. ВОЛНА: страница деформирована синусоидой (человек не замечает,
   OCR-сегментация строк плывёт и склеивает ловушки с текстом).
4. Крупные диагонали и кромки — «сдать» немыслимо: пометки видны сразу.
5. Разрешение экранное: читать удобно, печать выглядит блёкло.

Абсолютной защиты от перенабора не существует (читаемое человеком
распознаваемо в принципе) — задача слоёв: сделать «скопировать и сдать»
дороже и рискованнее, чем оплатить заказ.

DOC/DOCX/ODT/RTF/TXT и PPT/PPTX конвертируются в PDF LibreOffice'ом (headless),
дальше PyMuPDF рендерит страницы и собирает растровый PDF.
"""
from __future__ import annotations

import asyncio
import logging
import math
import os
import subprocess
import tempfile

log = logging.getLogger(__name__)

CONVERTIBLE = {".doc", ".docx", ".odt", ".rtf", ".txt", ".ppt", ".pptx"}
DPI = 88                  # экранное качество; пакет должен уверенно пройти Telegram
JPEG_QUALITY = 50         # читаемо с увеличением, длинная ВКР не раздувается
MAX_PAGES = 180           # страховка по памяти/размеру (ВКР ~100 страниц)

WM_MAIN = "ОБРАЗЕЦ · НЕ ДЛЯ СДАЧИ"
WM_EDGE = "Защищённый предпросмотр · Академический Салон · заказ №{no}"
WM_FOOT = "стр. {p} из {n} · оригинал файла — сразу после оплаты этапа"

# сетка ловушек: шаг по вертикали (pt), кегль, непрозрачность.
# Опыт: op<0.2 OCR отбрасывает ловушки и отдаёт чистый текст; op ~0.3
# читается человеком как лёгкий фон, но для OCR — полноценные строки.
TRAP_STEP = 20.0
TRAP_SIZE = 7.6
TRAP_OPACITY = 0.30
TRAP_WORDS = ["ОБРАЗЕЦ", "НЕ ДЛЯ СДАЧИ", "АКАДЕМИЧЕСКИЙ САЛОН", "ПРЕДПРОСМОТР"]

WAVE_AMP = 2.6            # px при DPI=112 — человек не замечает
WAVE_PERIOD = 230.0       # px

_FONT_PATHS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
    "/Library/Fonts/DejaVuSans-Bold.ttf",
    os.path.expanduser("~/Library/Fonts/DejaVuSans-Bold.ttf"),
]


def can_convert(filename: str) -> bool:
    ext = os.path.splitext(filename or "")[1].lower()
    return ext == ".pdf" or ext in CONVERTIBLE


async def build(data: bytes, filename: str, order_id: int,
                first_half: bool = False) -> bytes | None:
    """PDF-предпросмотр из файла мастера; None — не получилось (см. лог)."""
    try:
        return await asyncio.to_thread(_build_sync, data, filename, order_id, first_half)
    except Exception:  # noqa: BLE001 — фича не должна ронять бота
        log.exception("preview build failed for order %s (%s)", order_id, filename)
        return None


def _build_sync(data: bytes, filename: str, order_id: int,
                first_half: bool = False) -> bytes | None:
    import fitz  # PyMuPDF — импорт тут, чтобы бот стартовал и без него

    ext = os.path.splitext(filename or "")[1].lower()
    if ext in CONVERTIBLE:
        data = _office_to_pdf(data, ext)
        if not data:
            return None
    elif ext != ".pdf":
        log.warning("preview: unsupported extension %s", ext)
        return None

    font_file = next((p for p in _FONT_PATHS if os.path.exists(p)), None)
    src = fitz.open(stream=data, filetype="pdf")
    out = fitz.open()
    wanted = max(1, math.ceil(src.page_count / 2)) if first_half else src.page_count
    pages = min(wanted, MAX_PAGES)
    for i in range(pages):
        page = src[i]
        pix = page.get_pixmap(dpi=DPI)
        # промежуточная страница: растр оригинала + векторные водяные знаки…
        mid = fitz.open()
        mp = mid.new_page(width=page.rect.width, height=page.rect.height)
        mp.insert_image(mp.rect, pixmap=pix)
        _stamp(mp, fitz, font_file, order_id, i + 1, pages)
        # …повторный рендер (знаки ВЖИГАЮТСЯ в пиксели), затем волна:
        # деформируются вместе и текст, и ловушки — слой неотделим
        baked = mp.get_pixmap(dpi=DPI)
        mid.close()
        jpeg = _wave_jpeg(baked, phase=i * 37.0)
        op = out.new_page(width=page.rect.width, height=page.rect.height)
        op.insert_image(op.rect, stream=jpeg)
    if not first_half and src.page_count > pages:
        op = out.new_page()
        _center_note(op, fitz, font_file,
                     f"…ещё {src.page_count - pages} стр. — в оригинале после оплаты")
    src.close()
    res = out.tobytes(garbage=3, deflate=True)
    out.close()
    return res


def _wave_jpeg(pix, phase: float = 0.0) -> bytes:
    """Синусоидальная деформация страницы: колонки плывут по вертикали.

    Человеку незаметно (≈2–3 px), а OCR-сегментация строк ломается и
    смешивает ловушки с текстом. Без numpy/Pillow отдаём кадр как есть.
    """
    try:
        import io

        import numpy as np
        from PIL import Image
    except Exception:  # noqa: BLE001 — волна опциональна
        return pix.tobytes("jpeg", jpg_quality=JPEG_QUALITY)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    arr = np.asarray(img).copy()
    band = 4  # колонками по 4 px — быстрее, изгиб всё равно плавный
    for x0 in range(0, arr.shape[1], band):
        dy = int(round(WAVE_AMP * math.sin(2 * math.pi * (x0 + phase) / WAVE_PERIOD)))
        if dy:
            arr[:, x0:x0 + band] = np.roll(arr[:, x0:x0 + band], dy, axis=0)
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="JPEG", quality=JPEG_QUALITY)
    return buf.getvalue()


def _stamp(page, fitz, font_file: str | None, order_id: int, p: int, n: int) -> None:
    """Водяные знаки: сетка ловушек против OCR + диагонали + кромки."""
    font = fitz.Font(fontfile=font_file) if font_file else fitz.Font("helv")
    w, h = page.rect.width, page.rect.height

    # 1) ловушки: контрастные строки через каждые TRAP_STEP pt — Live Text
    # и прочий OCR вплетает их в каждую строку копии. Уникальный код в
    # каждой ловушке (№ заказа, страница, ряд) убивает автозамену.
    row = 0
    y = TRAP_STEP * 0.8
    while y < h - 6:
        seg_word = TRAP_WORDS[row % len(TRAP_WORDS)]
        text = ""
        x_shift = (row % 3) * (TRAP_STEP / 2.0)
        while font.text_length(text, fontsize=TRAP_SIZE) < w + 40:
            text += f"·{seg_word}·№{order_id}·с{p}·{row:02d}{len(text) % 7}·"
        tw = fitz.TextWriter(page.rect, opacity=TRAP_OPACITY, color=(0.55, 0.12, 0.12))
        tw.append(fitz.Point(-20 + x_shift, y), text, font=font, fontsize=TRAP_SIZE)
        # лёгкий переменный наклон: ловушки нельзя отфильтровать «по ровности»
        tilt = (-1.6, 0.0, 1.6)[row % 3]
        pivot = fitz.Point(w / 2, y)
        tw.write_text(page, morph=(pivot, fitz.Matrix(1, 1).prerotate(tilt)))
        row += 1
        y += TRAP_STEP

    # 2) крупные диагонали — маркировка «сдавать нельзя» с первого взгляда
    size = max(22.0, w / 13)
    tile_w = font.text_length(WM_MAIN, fontsize=size)
    for cy in (h * 0.22, h * 0.5, h * 0.78):
        tw = fitz.TextWriter(page.rect, opacity=0.15, color=(0.62, 0.10, 0.10))
        pos = fitz.Point((w - tile_w) / 2, cy)
        tw.append(pos, WM_MAIN, font=font, fontsize=size)
        pivot = fitz.Point(w / 2, cy)
        tw.write_text(page, morph=(pivot, fitz.Matrix(1, 1).prerotate(-30)))

    # 3) кромки: сверху — кто и что, снизу — страница и условие
    small = 8.5
    tw2 = fitz.TextWriter(page.rect, opacity=0.7, color=(0.45, 0.08, 0.08))
    head = WM_EDGE.format(no=order_id)
    tw2.append(fitz.Point(max(10, (w - font.text_length(head, fontsize=small)) / 2), 14),
               head, font=font, fontsize=small)
    foot = WM_FOOT.format(p=p, n=n)
    tw2.append(fitz.Point(max(10, (w - font.text_length(foot, fontsize=small)) / 2), h - 8),
               foot, font=font, fontsize=small)
    tw2.write_text(page)


def _center_note(page, fitz, font_file: str | None, text: str) -> None:
    font = fitz.Font(fontfile=font_file) if font_file else fitz.Font("helv")
    tw = fitz.TextWriter(page.rect, opacity=0.8, color=(0.3, 0.3, 0.3))
    tw.append(fitz.Point(60, page.rect.height / 2), text, font=font, fontsize=13)
    tw.write_text(page)


def _office_to_pdf(data: bytes, ext: str) -> bytes | None:
    """DOCX и родня → PDF через LibreOffice headless (отдельный профиль)."""
    soffice = next((p for p in ("/usr/bin/soffice", "/usr/local/bin/soffice",
                                "/opt/homebrew/bin/soffice",
                                "/Applications/LibreOffice.app/Contents/MacOS/soffice")
                    if os.path.exists(p)), None)
    if not soffice:
        log.warning("preview: soffice not found — docx conversion unavailable")
        return None
    with tempfile.TemporaryDirectory(prefix="salon-prev-") as td:
        src = os.path.join(td, "in" + ext)
        with open(src, "wb") as f:
            f.write(data)
        try:
            subprocess.run(
                [soffice, "--headless", "--norestore",
                 f"-env:UserInstallation=file://{td}/lo",
                 "--convert-to", "pdf", "--outdir", td, src],
                check=True, capture_output=True, timeout=180)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
            log.warning("preview: soffice failed: %s", e)
            return None
        dst = os.path.join(td, "in.pdf")
        if not os.path.exists(dst):
            return None
        with open(dst, "rb") as f:
            return f.read()
