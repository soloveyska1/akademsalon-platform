"""Фирменное PDF-подтверждение оплаты услуги.

Документ подтверждает факт платежа в деле заказа, но не подменяет
фискальный чек плательщика НПД. Функция синхронная, не обращается к сети и
возвращает готовые PDF-байты.
"""
from __future__ import annotations

import os
import re
import unicodedata
from collections.abc import Mapping
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from fpdf import FPDF
from fpdf.enums import XPos, YPos


BRAND_NAME = "АКАДЕМИЧЕСКИЙ САЛОН"
EXECUTOR_NAME = "Семёнов Семён Юрьевич"
EXECUTOR_INN = "212885750445"
EXECUTOR_NPD_STATUS = "Плательщик налога на профессиональный доход (НПД), самозанятый"
CORRESPONDENCE_ADDRESS = (
    "420054, Республика Татарстан, г. Казань, ул. Актайская, д. 7"
)

_FONT_REGULAR = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/TTF/DejaVuSans.ttf",
    "/Applications/LibreOffice.app/Contents/Resources/fonts/truetype/DejaVuSans.ttf",
    "/opt/homebrew/lib/python3.11/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSans.ttf",
    "/Library/Fonts/DejaVuSans.ttf",
    os.path.expanduser("~/Library/Fonts/DejaVuSans.ttf"),
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
]
_FONT_BOLD = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
    "/Applications/LibreOffice.app/Contents/Resources/fonts/truetype/DejaVuSans-Bold.ttf",
    "/opt/homebrew/lib/python3.11/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSans-Bold.ttf",
    "/Library/Fonts/DejaVuSans-Bold.ttf",
    os.path.expanduser("~/Library/Fonts/DejaVuSans-Bold.ttf"),
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
]

# Фирменная палитра «Оттиск».
PAPER = (247, 243, 234)
SHEET = (255, 254, 250)
INK = (34, 32, 27)
MUTE = (105, 100, 90)
HAIR = (205, 197, 180)
WAX = (166, 57, 35)
WAX_DEEP = (121, 39, 24)
NOTICE = (246, 232, 225)

_PAID_STATUSES = {"paid", "confirmed", "succeeded", "success", "completed"}
_DASHES = str.maketrans({
    "\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2013": "-",
    "\u2014": "-", "\u2015": "-", "\u2212": "-",
})
_METHOD_NAMES = {
    "manual": "Банковский перевод (подтверждён вручную)",
    "robokassa": "Robokassa",
    "yookassa": "ЮKassa",
    "sbp": "СБП",
    "card": "Банковская карта",
    "bank": "Банковский перевод",
}


class PaymentDocumentError(ValueError):
    """Некорректный контекст для подтверждения платежа."""


def _first_existing(paths: list[str]) -> str | None:
    for path in paths:
        if os.path.exists(path):
            return path
    return None


def _font_codepoints(path: str) -> set[int] | None:
    """Вернуть cmap шрифта, если fontTools доступен.

    fpdf2 сам зависит от fontTools, но мягкий fallback оставляет генератор
    рабочим и в минимальных окружениях.
    """
    try:
        from fontTools.ttLib import TTFont

        font = TTFont(path, lazy=True)
        try:
            return set((font.getBestCmap() or {}).keys())
        finally:
            font.close()
    except Exception:  # noqa: BLE001 - проверка cmap является улучшением
        return None


def _safe_text(value: Any, supported: set[int] | None) -> str:
    """Нормализовать произвольный Unicode и заменить отсутствующие глифы."""
    # NFC сохраняет семантические символы №/₽. NFKC превращал «№» в ``No``,
    # из-за чего визуально корректный документ менял исходные реквизиты.
    text = unicodedata.normalize("NFC", str(value or ""))
    text = text.translate(_DASHES).replace("\u00ad", "").replace("\u00a0", " ")
    clean: list[str] = []
    for char in text.replace("\r\n", "\n").replace("\r", "\n"):
        if char == "\n":
            clean.append(char)
            continue
        if char == "\t":
            clean.append(" ")
            continue
        category = unicodedata.category(char)
        if category in {"Cc", "Cs"}:
            clean.append(" ")
        elif supported is not None and ord(char) not in supported:
            clean.append("?")
        else:
            clean.append(char)
    return "\n".join(" ".join(line.split()) for line in "".join(clean).splitlines())


def _source_dict(payment: Mapping[str, Any]) -> dict[str, Any]:
    try:
        source = dict(payment)
    except (TypeError, ValueError) as exc:
        raise PaymentDocumentError("payment должен быть словарём с данными платежа") from exc
    if not source:
        raise PaymentDocumentError("данные платежа не переданы")
    return source


def _pick(source: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key not in source or source[key] is None:
            continue
        value = source[key]
        if not isinstance(value, str) or value.strip():
            return value
    return None


def _required(source: dict[str, Any], label: str, *keys: str) -> Any:
    value = _pick(source, *keys)
    if value is None:
        raise PaymentDocumentError(f"не заполнено поле «{label}»")
    return value


def _amount(value: Any) -> Decimal:
    if isinstance(value, bool):
        raise PaymentDocumentError("сумма платежа должна быть числом")
    if isinstance(value, Decimal):
        amount = value
    else:
        raw = str(value).strip().lower()
        raw = raw.replace("₽", "").replace("рублей", "").replace("руб.", "")
        raw = raw.replace("\u00a0", "").replace("\u202f", "").replace(" ", "")
        if "," in raw and "." in raw:
            if raw.rfind(",") > raw.rfind("."):
                raw = raw.replace(".", "").replace(",", ".")
            else:
                raw = raw.replace(",", "")
        else:
            raw = raw.replace(",", ".")
        try:
            amount = Decimal(raw)
        except (InvalidOperation, ValueError) as exc:
            raise PaymentDocumentError("сумма платежа должна быть числом") from exc
    if not amount.is_finite() or amount <= 0:
        raise PaymentDocumentError("сумма платежа должна быть больше нуля")
    return amount.quantize(Decimal("0.01"))


def _money(value: Decimal) -> str:
    whole = f"{int(value):,}".replace(",", " ")
    if value == value.to_integral_value():
        return f"{whole} ₽"
    kopecks = f"{value:.2f}".split(".", 1)[1]
    return f"{whole},{kopecks} ₽"


def _payment_date(value: Any) -> str:
    if isinstance(value, datetime):
        return value.strftime("%d.%m.%Y %H:%M")
    if isinstance(value, date):
        return value.strftime("%d.%m.%Y")
    raw = str(value).strip()
    probe = raw.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(probe)
    except ValueError:
        try:
            return date.fromisoformat(raw).strftime("%d.%m.%Y")
        except ValueError:
            return raw
    return parsed.strftime("%d.%m.%Y %H:%M")


def _payment_method(value: Any) -> str:
    raw = str(value).strip()
    return _METHOD_NAMES.get(raw.lower(), raw)


def build_payment_confirmation(payment: Mapping[str, Any]) -> bytes:
    """Создать PDF «Подтверждение платежа» из подтверждённого платежа.

    Поддерживаемые ключи:
    ``status``, ``id``/``payment_number``, ``order_id``/``order_number``,
    ``amount``/``amount_rub``, ``paid_at``/``payment_date``/``date``,
    ``method`` и ``service_name``/``work_label``.
    """
    source = _source_dict(payment)
    status = str(_required(source, "статус", "status")).strip().lower()
    if status not in _PAID_STATUSES:
        raise PaymentDocumentError(
            "подтверждение формируется только для оплаченного платежа"
        )

    reference_label = _pick(source, "reference_label") or "Заказ"
    reference_value = _pick(source, "reference_value")
    if reference_value is None:
        reference_value = _required(
            source, "номер заказа", "order_number", "order_id"
        )
    payment_number = _required(
        source, "номер платежа", "payment_number", "id", "external_id"
    )
    amount = _amount(_required(source, "сумма", "amount_rub", "amount"))
    paid_at = _required(
        source, "дата платежа", "paid_at", "payment_date", "confirmed_at", "date"
    )
    method = _required(source, "способ оплаты", "method", "payment_method")
    service_name = _required(
        source, "наименование услуги", "service_name", "work_label",
        "service", "description",
    )

    regular = _first_existing(_FONT_REGULAR)
    bold = _first_existing(_FONT_BOLD) or regular
    if not regular or not bold:
        raise RuntimeError("Unicode TTF-шрифты для PDF не найдены")
    regular_cmap = _font_codepoints(regular)
    bold_cmap = _font_codepoints(bold)
    if regular_cmap is not None and bold_cmap is not None:
        supported = regular_cmap & bold_cmap
    else:
        supported = regular_cmap or bold_cmap

    def text(value: Any) -> str:
        return _safe_text(value, supported)

    values = {
        "reference_label": text(reference_label),
        "reference": text(reference_value),
        "payment": text(payment_number),
        "amount": text(_money(amount)),
        "date": text(_payment_date(paid_at)),
        "method": text(_payment_method(method)),
        "service": text(service_name),
    }

    class PaymentPDF(FPDF):
        def header(self):  # noqa: N802 - API fpdf2
            self.set_fill_color(*PAPER)
            self.rect(0, 0, self.w, self.h, style="F")
            self.set_fill_color(*SHEET)
            self.rect(8, 8, self.w - 16, self.h - 16, style="F")
            self.set_y(14)
            self.set_font("DV", "B", 9)
            self.set_text_color(*WAX)
            self.cell(
                0, 5, text(BRAND_NAME), align="C",
                new_x=XPos.LMARGIN, new_y=YPos.NEXT,
            )
            self.set_font("DV", "", 6.8)
            self.set_text_color(*MUTE)
            self.cell(
                0, 4, text("ДОКУМЕНТ ОБ ОПЛАТЕ"), align="C",
                new_x=XPos.LMARGIN, new_y=YPos.NEXT,
            )
            line_y = self.get_y() + 2
            self.set_draw_color(*HAIR)
            self.set_line_width(0.3)
            self.line(self.l_margin, line_y, self.w - self.r_margin, line_y)
            self.set_y(line_y + 5)

        def footer(self):  # noqa: N802 - API fpdf2
            self.set_y(-18)
            self.set_draw_color(*HAIR)
            self.set_line_width(0.2)
            self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
            self.set_font("DV", "", 6.8)
            self.set_text_color(*MUTE)
            self.cell(
                0, 7,
                text(
                    "Академический Салон · akademsalon.ru · "
                    f"страница {self.page_no()} из {{nb}}"
                ),
                align="C",
            )

    pdf = PaymentPDF(format="A4", unit="mm")
    pdf.alias_nb_pages()
    pdf.set_margins(19, 14, 19)
    pdf.set_auto_page_break(auto=True, margin=23)
    pdf.add_font("DV", "", regular)
    pdf.add_font("DV", "B", bold)
    pdf.set_title(text(f"Подтверждение платежа № {values['payment']}"))
    pdf.set_author(text(BRAND_NAME.title()))
    pdf.set_subject(text("Подтверждение оплаты услуги; не налоговый чек НПД"))
    pdf.add_page()

    width = pdf.w - pdf.l_margin - pdf.r_margin
    home = {"new_x": XPos.LMARGIN, "new_y": YPos.NEXT}

    pdf.set_font("DV", "B", 20)
    pdf.set_text_color(*INK)
    pdf.multi_cell(width, 9, text("Подтверждение платежа"), align="C", **home)
    pdf.ln(1)
    pdf.set_font("DV", "", 8)
    pdf.set_text_color(*MUTE)
    pdf.cell(
        width, 4.5,
        text(
            f"Платёж № {values['payment']} · "
            f"{values['reference_label'].lower()} № {values['reference']}"
        ),
        align="C", **home,
    )
    pdf.ln(5)

    # Ключевой факт платежа.
    box_y = pdf.get_y()
    pdf.set_fill_color(*SHEET)
    pdf.set_draw_color(*HAIR)
    pdf.set_line_width(0.35)
    pdf.rect(pdf.l_margin, box_y, width, 29, style="DF")
    pdf.set_xy(pdf.l_margin + 6, box_y + 4)
    pdf.set_font("DV", "B", 7.7)
    pdf.set_text_color(*WAX)
    pdf.cell(
        width - 12, 4.5, text("ОПЛАТА ПОДТВЕРЖДЕНА"),
        align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT,
    )
    pdf.set_x(pdf.l_margin + 6)
    pdf.set_font("DV", "B", 22)
    pdf.set_text_color(*INK)
    pdf.cell(
        width - 12, 10.5, values["amount"],
        align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT,
    )
    pdf.set_x(pdf.l_margin + 6)
    pdf.set_font("DV", "", 8)
    pdf.set_text_color(*MUTE)
    pdf.cell(
        width - 12, 4.5, text(f"{values['date']} · {values['method']}"),
        align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT,
    )
    pdf.set_y(box_y + 34)

    def field(label: str, value: str) -> None:
        if pdf.get_y() > pdf.h - pdf.b_margin - 24:
            pdf.add_page()
        pdf.set_font("DV", "B", 7.3)
        pdf.set_text_color(*WAX)
        pdf.multi_cell(width, 4.2, text(label.upper()), **home)
        pdf.set_font("DV", "", 10)
        pdf.set_text_color(*INK)
        pdf.multi_cell(width, 5.4, value, **home)
        y = pdf.get_y() + 1.4
        pdf.set_draw_color(*HAIR)
        pdf.set_line_width(0.2)
        pdf.line(pdf.l_margin, y, pdf.l_margin + width, y)
        pdf.set_y(y + 3.2)

    field(values["reference_label"], text(f"№ {values['reference']}"))
    field("Платёж", text(f"№ {values['payment']}"))
    field("Наименование услуги", values["service"])
    field("Способ оплаты", values["method"])
    field("Дата подтверждения", values["date"])

    if pdf.get_y() > pdf.h - pdf.b_margin - 50:
        pdf.add_page()
    pdf.set_font("DV", "B", 11)
    pdf.set_text_color(*INK)
    pdf.multi_cell(width, 6, text("Исполнитель"), **home)
    pdf.ln(1)
    executor_lines = (
        EXECUTOR_NAME,
        f"Статус: {EXECUTOR_NPD_STATUS}",
        f"ИНН: {EXECUTOR_INN}",
        f"Адрес для корреспонденции: {CORRESPONDENCE_ADDRESS}",
    )
    for line in executor_lines:
        pdf.set_font("DV", "B" if line == EXECUTOR_NAME else "", 8.8)
        pdf.set_text_color(*INK if line == EXECUTOR_NAME else MUTE)
        pdf.multi_cell(width, 4.8, text(line), **home)
    pdf.ln(4)

    if pdf.get_y() > pdf.h - pdf.b_margin - 47:
        pdf.add_page()
    notice_y = pdf.get_y()
    notice_h = 39
    pdf.set_fill_color(*NOTICE)
    pdf.set_draw_color(*WAX)
    pdf.set_line_width(0.45)
    pdf.rect(pdf.l_margin, notice_y, width, notice_h, style="DF")
    pdf.set_fill_color(*WAX)
    pdf.rect(pdf.l_margin, notice_y, 1.3, notice_h, style="F")
    pdf.set_xy(pdf.l_margin + 5, notice_y + 4)
    pdf.set_font("DV", "B", 9.1)
    pdf.set_text_color(*WAX_DEEP)
    pdf.multi_cell(
        width - 10, 5,
        text("ВАЖНО: ЭТО ПОДТВЕРЖДЕНИЕ, А НЕ ФИСКАЛЬНЫЙ ЧЕК"),
        align="L",
        **home,
    )
    pdf.set_x(pdf.l_margin + 5)
    pdf.set_font("DV", "", 8.5)
    pdf.set_text_color(*INK)
    pdf.multi_cell(
        width - 10, 4.8,
        text(
            "Настоящий документ подтверждает оплату услуги и не является "
            "налоговым чеком НПД. Официальный чек формируется платёжным "
            "сервисом Robokassa и/или в приложении «Мой налог» и "
            "направляется плательщику отдельно."
        ),
        align="L",
        **home,
    )
    pdf.set_y(notice_y + notice_h + 4)

    pdf.set_font("DV", "", 7.5)
    pdf.set_text_color(*MUTE)
    pdf.multi_cell(
        width, 4.2,
        text(
            "Документ сформирован по данным подтверждённого платежа. Для сверки "
            "сообщите указанное основание и номер платежа."
        ),
        align="C",
        **home,
    )
    return bytes(pdf.output())


def render(payment: Mapping[str, Any]) -> bytes:
    """Совместимый короткий вызов по аналогии с другими PDF-сервисами."""
    return build_payment_confirmation(payment)


__all__ = [
    "BRAND_NAME",
    "CORRESPONDENCE_ADDRESS",
    "EXECUTOR_INN",
    "EXECUTOR_NAME",
    "EXECUTOR_NPD_STATUS",
    "PaymentDocumentError",
    "build_payment_confirmation",
    "render",
]
