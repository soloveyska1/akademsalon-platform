"""PDF подарочного сертификата — фирменный лист «Оттиск» для печати и вручения.

A4 альбомный: бумага, двойная рамка-паспарту, номинал крупно, именные строки,
код в пунктирной марке, сургучная печать «АС». Шрифты — DejaVu (как в
contract.py): свободная кириллица, на сервере ставится пакетом.
Функция render() синхронная — звать через asyncio.to_thread.
"""
from __future__ import annotations

import logging
import os

from fpdf import FPDF

log = logging.getLogger(__name__)

_FONT_REGULAR = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/TTF/DejaVuSans.ttf",
    "/Applications/LibreOffice.app/Contents/Resources/fonts/truetype/DejaVuSans.ttf",
    "/opt/homebrew/lib/python3.11/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSans.ttf",
    "/Library/Fonts/DejaVuSans.ttf",
    os.path.expanduser("~/Library/Fonts/DejaVuSans.ttf"),
]
_FONT_BOLD = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
    "/Applications/LibreOffice.app/Contents/Resources/fonts/truetype/DejaVuSans-Bold.ttf",
    "/opt/homebrew/lib/python3.11/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSans-Bold.ttf",
    "/Library/Fonts/DejaVuSans-Bold.ttf",
    os.path.expanduser("~/Library/Fonts/DejaVuSans-Bold.ttf"),
]

PAPER = (246, 241, 231)     # бумага «Оттиска»
SHEET = (255, 254, 249)     # лист-паспарту
INK = (34, 32, 27)          # чернила
SOFT = (107, 102, 90)       # приглушённый
FAINT = (133, 126, 108)     # совсем тихий
HAIR = (194, 184, 159)      # линейки
WAX = (178, 59, 34)         # сургуч
MARK = (239, 229, 204)      # плашка кода


def _font(paths: list[str]) -> str | None:
    for p in paths:
        if os.path.exists(p):
            return p
    return None


def _fmt(n) -> str:
    return f"{int(n or 0):,}".replace(",", " ")


def _ru_date(iso: str | None) -> str:
    if not iso:
        return "—"
    return f"{iso[8:10]}.{iso[5:7]}.{iso[:4]}"


def render(g: dict) -> bytes:
    """Собрать PDF сертификата из строки gifts (dict)."""
    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.set_auto_page_break(False)
    pdf.set_margin(0)
    reg, bold = _font(_FONT_REGULAR), _font(_FONT_BOLD)
    if not reg or not bold:
        raise RuntimeError("DejaVu fonts not found")
    pdf.add_font("DV", "", reg)
    pdf.add_font("DV", "B", bold)
    pdf.add_page()
    W, H = 297, 210

    # бумага и лист
    pdf.set_fill_color(*PAPER)
    pdf.rect(0, 0, W, H, "F")
    m = 11
    pdf.set_fill_color(*SHEET)
    pdf.rect(m, m, W - 2 * m, H - 2 * m, "F")

    # двойная рамка-паспарту
    pdf.set_draw_color(*INK)
    pdf.set_line_width(0.9)
    pdf.rect(m + 3, m + 3, W - 2 * m - 6, H - 2 * m - 6)
    pdf.set_line_width(0.25)
    pdf.set_draw_color(*HAIR)
    pdf.rect(m + 5.5, m + 5.5, W - 2 * m - 11, H - 2 * m - 11)

    def center(y: float, text: str, size: float, *, style: str = "",
               color=INK, spacing: float = 0.0) -> None:
        pdf.set_font("DV", style, size)
        pdf.set_text_color(*color)
        if spacing:
            text = (" " * max(1, round(spacing))).join(list(text))
        tw = pdf.get_string_width(text)
        pdf.text((W - tw) / 2, y, text)

    # шапка-гриф
    center(31, "АКАДЕМИЧЕСКИЙ САЛОН", 13.5, style="B", spacing=1)
    center(37.5, "МАСТЕРСКАЯ УЧЕБНЫХ И НАУЧНЫХ РАБОТ", 7, color=FAINT, spacing=1)

    # линейка с ромбом
    pdf.set_draw_color(*HAIR)
    pdf.set_line_width(0.3)
    pdf.line(W / 2 - 58, 43, W / 2 - 4, 43)
    pdf.line(W / 2 + 4, 43, W / 2 + 58, 43)
    pdf.set_fill_color(*WAX)
    pdf.set_draw_color(*WAX)
    with pdf.rotation(45, W / 2, 43):
        pdf.rect(W / 2 - 1.1, 43 - 1.1, 2.2, 2.2, "F")

    # титул и номинал
    center(58, "ПОДАРОЧНЫЙ СЕРТИФИКАТ", 24, style="B", spacing=0.5)
    center(80, f"{_fmt(g.get('amount'))} ₽", 46, style="B", color=WAX)
    center(89, "на любые работы и услуги мастерской — от курсовой и диплома",
           9.5, color=SOFT)
    center(94.5, "до разбора плана и подготовки к защите", 9.5, color=SOFT)

    # именные строки
    y = 106
    recip = (g.get("recip_name") or "").strip()
    buyer = (g.get("buyer_name") or "").strip()
    if recip:
        center(y, f"Для: {recip}" + (f"   ·   от: {buyer}" if buyer and buyer != "мастерская" else ""),
               11.5, style="B")
        y += 7
    congrats = (g.get("congrats") or "").strip()
    if congrats:
        pdf.set_font("DV", "", 9.5)
        pdf.set_text_color(*SOFT)
        # поздравление — по центру, максимум две строки
        words, lines, cur = congrats.split(), [], ""
        for w_ in words:
            probe = (cur + " " + w_).strip()
            if pdf.get_string_width("«" + probe + "»") > 190 and cur:
                lines.append(cur)
                cur = w_
            else:
                cur = probe
        lines.append(cur)
        for ln in lines[:2]:
            quoted = f"«{ln}»" if len(lines) == 1 else ln
            tw = pdf.get_string_width(quoted)
            pdf.text((W - tw) / 2, y, quoted)
            y += 5.4
        y += 1

    # марка с кодом
    code = str(g.get("code") or "")
    pdf.set_font("DV", "B", 19)
    box_w = max(pdf.get_string_width(code) + 26, 120)
    box_h = 16
    bx, by = (W - box_w) / 2, max(y, 118)
    pdf.set_fill_color(*MARK)
    pdf.set_draw_color(*HAIR)
    pdf.set_line_width(0.4)
    pdf.set_dash_pattern(dash=1.6, gap=1.4)
    pdf.rect(bx, by, box_w, box_h, "DF")
    pdf.set_dash_pattern()
    pdf.set_text_color(*INK)
    pdf.text((W - pdf.get_string_width(code)) / 2, by + 10.4, code)
    center(by + 21.5, "код предъявляется при заказе на akademsalon.ru", 8, color=FAINT)

    # сургучная печать
    sx, sy, r = W - 52, H - 47, 15
    pdf.set_fill_color(*WAX)
    pdf.set_draw_color(*WAX)
    pdf.ellipse(sx - r, sy - r, 2 * r, 2 * r, "F")
    pdf.set_draw_color(*SHEET)
    pdf.set_line_width(0.5)
    pdf.ellipse(sx - r + 2.2, sy - r + 2.2, 2 * r - 4.4, 2 * r - 4.4)
    pdf.set_font("DV", "B", 17)
    pdf.set_text_color(*SHEET)
    pdf.text(sx - pdf.get_string_width("АС") / 2, sy + 2.3, "АС")
    pdf.set_font("DV", "", 5.6)
    pdf.set_text_color(*WAX)  # подпись живёт на белом листе — сургучным тоном
    t = "ОПЛАЧЕНО · ПОДЛИННО"
    pdf.text(sx - pdf.get_string_width(t) / 2, sy + r + 4.6, t)

    # реквизитная строка внизу слева
    pdf.set_text_color(*SOFT)
    pdf.set_font("DV", "", 8.6)
    lx, ly = m + 14, H - 52
    pdf.text(lx, ly, f"Серия АС · № {int(g.get('id') or 0):06d}")
    pdf.text(lx, ly + 5.4, f"Действителен до: {_ru_date(g.get('expires_at'))}")
    pdf.text(lx, ly + 10.8, "Проверить остаток: akademsalon.ru/gift.html")
    pdf.set_font("DV", "", 7.2)
    pdf.set_text_color(*FAINT)
    pdf.text(lx, ly + 17.6, "Сертификат — аванс за информационно-консультационные услуги "
                            "(оферта, р. 14). Остаток хранится на коде до конца срока;")
    pdf.text(lx, ly + 21.6, "деньгами не выдаётся. Если стоимость работы выше номинала, "
                            "разница доплачивается любым удобным способом.")
    pdf.text(lx, ly + 25.6, "Исполнитель: самозанятый, ИНН 212885750445 · "
                            "support@akademsalon.ru · Telegram @academicsaloon")

    out = pdf.output()
    return bytes(out)
