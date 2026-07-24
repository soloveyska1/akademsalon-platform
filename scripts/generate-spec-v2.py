#!/usr/bin/env python3
"""Build the human-readable Specification v2 PDF examples.

The PDFs are presentation examples with fictional data.  The authoritative
runtime must create the same structures on the server, validate them, freeze
the accepted bytes and bind payment evidence to the exact specification
revision.  See content/legal/SPECIFICATION-V2.md.
"""

from __future__ import annotations

import hashlib
import json
import shutil
from functools import partial
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    HRFlowable,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf"
PUBLIC = ROOT / "assets" / "docs"
FONT_REGULAR = Path("/System/Library/Fonts/Supplemental/Arial.ttf")
FONT_BOLD = Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf")

INK = colors.HexColor("#26221E")
MUTE = colors.HexColor("#706A64")
WAX = colors.HexColor("#8F302E")
PAPER = colors.HexColor("#F5F1E9")
HAIR = colors.HexColor("#D8D0C5")
GREEN = colors.HexColor("#385A49")
WHITE = colors.white
CONTENT_W = 174 * mm


def rub(minor: int) -> str:
    """Format integer kopecks as Russian roubles."""
    if minor % 100:
        value = f"{minor / 100:,.2f}".replace(",", " ").replace(".", ",")
    else:
        value = f"{minor // 100:,}".replace(",", " ")
    return f"{value} руб."


def rub_plain(minor: int) -> str:
    """Rouble value for prose that supplies its own punctuation."""
    return rub(minor).rstrip(".")


def canonical_hash(payload: dict[str, Any]) -> str:
    raw = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def register_fonts() -> None:
    if not FONT_REGULAR.exists() or not FONT_BOLD.exists():
        raise RuntimeError("Arial fonts required for Cyrillic PDF generation were not found")
    pdfmetrics.registerFont(TTFont("Salon", str(FONT_REGULAR)))
    pdfmetrics.registerFont(TTFont("Salon-Bold", str(FONT_BOLD)))


def styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName="Salon",
            fontSize=9.2,
            leading=12.6,
            textColor=INK,
            spaceAfter=4.4,
        ),
        "body_tight": ParagraphStyle(
            "BodyTight",
            parent=base["BodyText"],
            fontName="Salon",
            fontSize=8.7,
            leading=11.7,
            textColor=INK,
            spaceAfter=3.5,
        ),
        "small": ParagraphStyle(
            "Small",
            parent=base["BodyText"],
            fontName="Salon",
            fontSize=7.7,
            leading=10.1,
            textColor=MUTE,
        ),
        "caps": ParagraphStyle(
            "Caps",
            parent=base["BodyText"],
            fontName="Salon-Bold",
            fontSize=7.7,
            leading=9.5,
            textColor=WAX,
            spaceAfter=4,
        ),
        "title": ParagraphStyle(
            "Title",
            parent=base["Title"],
            fontName="Salon-Bold",
            fontSize=18.5,
            leading=22,
            textColor=INK,
            alignment=TA_LEFT,
            spaceAfter=4,
        ),
        "subtitle": ParagraphStyle(
            "Subtitle",
            parent=base["BodyText"],
            fontName="Salon",
            fontSize=9.1,
            leading=12.3,
            textColor=MUTE,
            spaceAfter=8,
        ),
        "h1": ParagraphStyle(
            "H1",
            parent=base["Heading2"],
            fontName="Salon-Bold",
            fontSize=12.3,
            leading=15,
            textColor=INK,
            spaceBefore=7,
            spaceAfter=6,
            keepWithNext=True,
        ),
        "h2": ParagraphStyle(
            "H2",
            parent=base["Heading3"],
            fontName="Salon-Bold",
            fontSize=10.1,
            leading=12.8,
            textColor=INK,
            spaceBefore=3,
            spaceAfter=4,
            keepWithNext=True,
        ),
        "metric_label": ParagraphStyle(
            "MetricLabel",
            parent=base["BodyText"],
            fontName="Salon-Bold",
            fontSize=7.1,
            leading=8.4,
            textColor=MUTE,
            alignment=TA_LEFT,
            spaceAfter=3,
        ),
        "metric": ParagraphStyle(
            "Metric",
            parent=base["BodyText"],
            fontName="Salon-Bold",
            fontSize=11.2,
            leading=13.3,
            textColor=INK,
            alignment=TA_LEFT,
        ),
        "center": ParagraphStyle(
            "Center",
            parent=base["BodyText"],
            fontName="Salon",
            fontSize=8,
            leading=10,
            textColor=MUTE,
            alignment=TA_CENTER,
        ),
        "right": ParagraphStyle(
            "Right",
            parent=base["BodyText"],
            fontName="Salon",
            fontSize=8,
            leading=10,
            textColor=MUTE,
            alignment=TA_RIGHT,
        ),
    }


def para(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(text, style)


def make_table(
    rows: list[list[Any]],
    widths: list[float],
    *,
    header: bool = True,
    font_size: float = 7.8,
    aligns: list[str] | None = None,
    grid: bool = True,
) -> Table:
    cell = ParagraphStyle(
        f"Cell-{font_size}",
        fontName="Salon",
        fontSize=font_size,
        leading=font_size + 2.5,
        textColor=INK,
    )
    head = ParagraphStyle(
        f"Head-{font_size}",
        parent=cell,
        fontName="Salon-Bold",
        textColor=MUTE,
    )
    wrapped: list[list[Any]] = []
    for row_index, row in enumerate(rows):
        wrapped.append(
            [
                value
                if isinstance(value, Paragraph)
                else Paragraph(str(value), head if header and row_index == 0 else cell)
                for value in row
            ]
        )
    result = Table(
        wrapped,
        colWidths=widths,
        repeatRows=1 if header else 0,
        hAlign="LEFT",
    )
    commands: list[tuple] = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("TEXTCOLOR", (0, 0), (-1, -1), INK),
    ]
    if grid:
        commands.append(("GRID", (0, 0), (-1, -1), 0.4, HAIR))
    if header:
        commands.extend(
            [
                ("BACKGROUND", (0, 0), (-1, 0), PAPER),
                ("TEXTCOLOR", (0, 0), (-1, 0), MUTE),
            ]
        )
    for index, align in enumerate(aligns or []):
        commands.append(("ALIGN", (index, 0), (index, -1), align))
    result.setStyle(TableStyle(commands))
    return result


def heading(number: str, title: str, st: dict[str, ParagraphStyle]) -> list[Any]:
    return [
        para(f"{number}. {title}", st["h1"]),
        HRFlowable(
            width="100%",
            thickness=0.45,
            color=HAIR,
            spaceBefore=0,
            spaceAfter=5,
        ),
    ]


def clause(number: str, text: str, st: dict[str, ParagraphStyle]) -> Paragraph:
    return para(f"<b>{number}.</b> {text}", st["body"])


def note_box(title: str, text: str, st: dict[str, ParagraphStyle]) -> Table:
    content = [
        para(title.upper(), st["caps"]),
        para(text, st["body"]),
    ]
    result = Table([[content]], colWidths=[CONTENT_W])
    result.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.7, HAIR),
                ("BACKGROUND", (0, 0), (-1, -1), PAPER),
                ("LEFTPADDING", (0, 0), (-1, -1), 9),
                ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return result


def position_card(line: dict[str, Any], st: dict[str, ParagraphStyle]) -> Table:
    rows = [
        (
            "Контур и разрешённая цель",
            f"<b>{line['contour_label']}</b>. {line['permitted_purpose']}",
        ),
        ("Наименование в чеке", line["receipt_name"]),
        ("Кто участвует", line["contractor_categories"]),
        ("Что делаем", line["subject"]),
        ("Результат", line["deliverable"]),
        ("Количество", f"{line['qty_label']}. {line['unit_definition']}"),
        ("Входит", line["included"]),
        ("Не входит", line["excluded"]),
        ("Что нужно от Заказчика", line["inputs"]),
    ]
    content: list[Any] = [
        para(f"Позиция {line['position']}. {line['title']}", st["h2"]),
    ]
    for label, value in rows:
        content.append(para(f"<b>{label}:</b> {value}", st["body_tight"]))
    result = Table([[content]], colWidths=[CONTENT_W])
    result.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.65, HAIR),
                ("BACKGROUND", (0, 0), (-1, -1), WHITE),
                ("LINEBEFORE", (0, 0), (0, -1), 2.3, WAX),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return result


def execution_card(line: dict[str, Any], st: dict[str, ParagraphStyle]) -> Table:
    rows = [
        ("Когда начинаем", line["start_conditions"]),
        ("Срок", line["due"]),
        ("Как проверить результат", line["criteria"]),
        ("Исправления и поддержка", line["corrections"]),
        ("Связь с другими позициями", line["dependency"]),
    ]
    if line["contract_contour"] == "A":
        rows.append(("Права на материалы", line["rights"]))
    content: list[Any] = [para("Срок, проверка и связь позиций", st["h2"])]
    for label, value in rows:
        content.append(para(f"<b>{label}:</b> {value}", st["body_tight"]))
    result = Table([[content]], colWidths=[CONTENT_W])
    result.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.65, HAIR),
                ("BACKGROUND", (0, 0), (-1, -1), WHITE),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return result


def author_rights_card(
    line: dict[str, Any], st: dict[str, ParagraphStyle]
) -> Table | None:
    """Human-readable mandatory rights block for B1/B2 positions."""
    if line["contract_contour"] == "A":
        return None
    rights = line["author_rights"]
    rows = [
        ("Заказанное произведение", rights["work_description"]),
        (
            "Фактический автор",
            f"{rights['actual_author']}. Способ указания: {rights['author_name_mode']}",
        ),
        ("Основание прав", rights["rights_basis"]),
        ("Режим предоставления прав", rights["rights_mode"]),
        ("Вознаграждение", rights["remuneration"]),
        ("Момент предоставления прав", rights["effective_on"]),
    ]
    if rights["mode"] == "license":
        rows.extend(
            [
                ("Вид лицензии", rights["license_type"]),
                ("Способы использования", rights["use_methods"]),
                (
                    "Территория и срок",
                    f"{rights['territory']}; {rights['term']}",
                ),
                ("Переработка", rights["adaptation"]),
                ("Сублицензирование", rights["sublicensing"]),
            ]
        )
    else:
        rows.extend(
            [
                ("Объём отчуждения", rights["alienation_scope"]),
                ("Момент перехода", rights["alienation_moment"]),
                ("Допустимые изменения", rights["adaptation"]),
            ]
        )
    rows.extend(
        [
            ("Объекты третьих лиц", rights["third_party_objects"]),
            ("Участие другого автора/исполнителя", rights["third_author_or_contractor"]),
            (
                "Неизменное правило",
                "Передача прав не меняет фактического авторства и не позволяет Заказчику "
                "указывать себя автором вопреки фактам.",
            ),
        ]
    )
    content: list[Any] = [
        para("Автор и интеллектуальные права по этой позиции", st["h2"])
    ]
    for label, value in rows:
        content.append(para(f"<b>{label}:</b> {value}", st["body_tight"]))
    result = Table([[content]], colWidths=[CONTENT_W])
    result.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.7, HAIR),
                ("BACKGROUND", (0, 0), (-1, -1), PAPER),
                ("LINEBEFORE", (0, 0), (0, -1), 2.3, GREEN),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return result


class FooterCanvas(canvas.Canvas):
    """Canvas that can draw an exact “page N of M” technical footer."""

    def __init__(self, *args, footer_title: str, hash_lines: list[str], **kwargs):
        super().__init__(*args, **kwargs)
        self._footer_title = footer_title
        self._hash_lines = hash_lines
        self._saved_page_states: list[dict[str, Any]] = []

    def showPage(self) -> None:  # noqa: N802 - ReportLab API
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self) -> None:
        page_count = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self._draw_footer(page_count)
            super().showPage()
        super().save()

    def _draw_footer(self, page_count: int) -> None:
        self.saveState()
        self.setStrokeColor(HAIR)
        self.setLineWidth(0.45)
        self.line(18 * mm, 16 * mm, 192 * mm, 16 * mm)
        self.setFillColor(MUTE)
        self.setFont("Salon", 6.8)
        self.drawString(18 * mm, 12.1 * mm, self._footer_title)
        self.drawRightString(
            192 * mm,
            12.1 * mm,
            f"страница {self._pageNumber} из {page_count}",
        )
        y = 8.9 * mm
        self.setFont("Salon", 5.9)
        for line in self._hash_lines:
            self.drawString(18 * mm, y, line)
            y -= 3.0 * mm
        self.restoreState()


class SpecificationDocument(BaseDocTemplate):
    def __init__(self, target: Path, title: str):
        super().__init__(
            str(target),
            pagesize=A4,
            leftMargin=18 * mm,
            rightMargin=18 * mm,
            topMargin=16 * mm,
            bottomMargin=25 * mm,
            title=title,
            author="Академический Салон",
            subject="Заполненный образец индивидуальных условий заказа",
        )
        frame = Frame(
            self.leftMargin,
            self.bottomMargin,
            self.width,
            self.height,
            id="body",
        )
        self.addPageTemplates(PageTemplate(id="spec", frames=[frame]))


SINGLE = {
    "schema_version": "2.0",
    "document_type": "specification",
    "spec_id": "SPEC-DEMO-ONE-2026",
    "revision": 1,
    "status": "offered",
    "offered_at": "2026-07-24T12:00:00+03:00",
    "valid_until": "2026-07-27T23:59:00+03:00",
    "display_date": "24 июля 2026 г.",
    "contractor": {
        "name": "Семёнов Семён Юрьевич",
        "inn": "212885750445",
        "tax_regime": "НПД",
        "npd_status_checked_at": "2026-07-24",
    },
    "customer": "Орлов Алексей Сергеевич (вымышленное лицо), 18+",
    "payer": "Заказчик",
    "channel": "личный кабинет и подтверждённый email a***@example.test",
    "headline": "Диагностическая консультация по собственному черновику",
    "final_due": "30 июля 2026 г.",
    "currency": "RUB",
    "lines": [
        {
            "line_id": "LN-001",
            "position": 1,
            "contract_contour": "A",
            "contour_label": "Контур А — академическое сопровождение",
            "permitted_purpose": "помочь Заказчику самостоятельно доработать собственный черновик; результат не предназначен для выдачи за выполненную Исполнителем аттестационную работу",
            "receipt_name": "Консультация и анализ собственного черновика Заказчика",
            "contractor_categories": "лично Исполнитель; соисполнители не привлекаются",
            "title": "Диагностическая консультация по собственному черновику",
            "subject": "анализ структуры, логики и оформления собственного черновика Заказчика с последующим разбором замечаний",
            "quantity": 1,
            "unit": "комплект",
            "qty_label": "1 комплект",
            "unit_definition": "Комплект включает письменную карту замечаний и одну онлайн-встречу продолжительностью 90 минут",
            "deliverable": "PDF с картой замечаний и кратким маршрутом самостоятельной доработки; онлайн-разбор 90 минут",
            "included": "чтение DOCX объёмом до 35 расчётных страниц; классификация замечаний; ответы на вопросы; письменный маршрут следующих действий",
            "excluded": "написание или замена содержательных частей; создание данных, выводов и источников; гарантия решения преподавателя или комиссии",
            "inputs": "черновик DOCX и действующие методические требования до 27.07.2026, 18:00 МСК",
            "start_conditions": "после получения обоих файлов и первого платежа",
            "due": "карта замечаний — до 30.07.2026, 14:00 МСК; встреча — 30.07.2026 по согласованному времени",
            "criteria": "карта охватывает структуру, логику и оформление всего согласованного объёма; замечания привязаны к фрагментам; встреча длится не менее 90 минут",
            "corrections": "несоответствие указанным критериям устраняется без доплаты; новые вопросы вне согласованного предмета оформляются отдельно",
            "dependency": "самостоятельная позиция; зависит только от своевременной передачи файлов Заказчиком",
            "dependency_line_ids": [],
            "separability": "independent",
            "rights_profile": "consultation_result",
            "rights": "права на исходный черновик остаются у Заказчика; карта и методические пояснения после полной оплаты доступны ему для личного использования, без передачи исключительных прав",
            "gross_minor": 850_000,
            "discount_minor": 0,
            "contract_minor": 850_000,
        }
    ],
    "pricing": {
        "subtotal_minor": 850_000,
        "discount_minor": 0,
        "contract_price_minor": 850_000,
        "gift_credit_minor": 0,
        "deposit_credit_minor": 0,
        "cash_due_minor": 850_000,
    },
    "payment_schedule": [
        {
            "stage_id": "P-01",
            "event": "акцепт и бронирование времени",
            "cash_minor": 400_000,
            "gift_credit_minor": 0,
            "deposit_credit_minor": 0,
            "allocations": [{"line_id": "LN-001", "amount_minor": 400_000}],
        },
        {
            "stage_id": "P-02",
            "event": "после передачи карты замечаний, до онлайн-встречи",
            "cash_minor": 450_000,
            "gift_credit_minor": 0,
            "deposit_credit_minor": 0,
            "allocations": [{"line_id": "LN-001", "amount_minor": 450_000}],
        },
    ],
    "documents": {
        "offer": {
            "version": "3.0",
            "url": "https://akademsalon.ru/oferta.html",
        },
        "privacy": {
            "version": "3.0",
            "url": "https://akademsalon.ru/privacy.html",
        },
        "loyalty": {
            "applicable": False,
            "version": "",
            "url": "",
        },
    },
}


MULTI = {
    "schema_version": "2.0",
    "document_type": "specification",
    "spec_id": "SPEC-DEMO-MIXED-2026",
    "revision": 1,
    "status": "offered",
    "offered_at": "2026-07-24T12:10:00+03:00",
    "valid_until": "2026-07-29T23:59:00+03:00",
    "display_date": "24 июля 2026 г.",
    "contractor": {
        "name": "Семёнов Семён Юрьевич",
        "inn": "212885750445",
        "tax_regime": "НПД",
        "npd_status_checked_at": "2026-07-24",
    },
    "customer": "Миронова Елена Викторовна (вымышленное лицо), 18+",
    "payer": "Петров Максим Игоревич (вымышленное лицо), платит за Заказчика",
    "channel": "личный кабинет Заказчика и подтверждённый email Плательщика",
    "headline": "Просветительский интернет-проект: А + Б1 + Б2",
    "final_due": "18 августа 2026 г.",
    "currency": "RUB",
    "lines": [
        {
            "line_id": "LN-001",
            "position": 1,
            "contract_contour": "A",
            "contour_label": "Контур А — академическое сопровождение",
            "permitted_purpose": "разобрать структуру просветительского проекта Заказчика и помочь ему сформулировать собственное редакционное задание; позиция не связана с аттестацией",
            "receipt_name": "Консультации по структуре просветительского проекта",
            "contractor_categories": "лично Исполнитель; соисполнители не привлекаются",
            "title": "Консультации по структуре просветительского проекта",
            "subject": "две консультации по концепции, аудитории и структуре интернет-проекта на основании материалов Заказчика",
            "quantity": 2,
            "unit": "час",
            "qty_label": "2 часа",
            "unit_definition": "Две одинаковые консультационные единицы по 60 минут; тема и требования едины",
            "deliverable": "2 онлайн-встречи и письменная карта разделов проекта",
            "included": "разбор цели, аудитории и структуры; ответы на заранее направленные вопросы; карта следующих редакционных действий",
            "excluded": "создание заказанных произведений из позиций 2 и 3; исследование рынка; гарантия коммерческого результата",
            "inputs": "описание проекта, аудитории и список вопросов до 31.07.2026, 18:00 МСК",
            "start_conditions": "после зачёта сертификата и получения входных материалов",
            "due": "встречи 01.08 и 03.08.2026 по согласованному времени; карта разделов — в день второй встречи",
            "criteria": "обе встречи проведены по 60 минут; карта содержит аудиторию, разделы, очередность публикаций и открытые вопросы",
            "corrections": "фактическая ошибка или пропуск согласованного вопроса исправляется без доплаты; новая тема считается новой услугой",
            "dependency": "самостоятельная позиция",
            "dependency_line_ids": [],
            "separability": "independent",
            "rights_profile": "consultation_result",
            "rights": "исходные материалы остаются у Заказчика; карта разделов и пояснения предоставляются для использования в его проекте после полной оплаты позиции",
            "gross_minor": 600_000,
            "discount_minor": 50_000,
            "contract_minor": 550_000,
        },
        {
            "line_id": "LN-002",
            "position": 2,
            "contract_contour": "B1",
            "contour_label": "Контур Б1 — авторский заказ, автором является Исполнитель",
            "permitted_purpose": "публикация на сайте просветительского проекта и его продвижение; использование для аттестации, экзамена, научной квалификации или указание Заказчика автором запрещено",
            "receipt_name": "Создание авторского лонгрида и простая лицензия",
            "contractor_categories": "творческое создание — лично Исполнитель; технический корректор может привлекаться без приобретения авторства",
            "title": "Авторский лонгрид для сайта",
            "subject": "создание оригинального научно-популярного лонгрида «Как городские архивы сохраняют память» для открытой публикации",
            "quantity": 1,
            "unit": "произведение",
            "qty_label": "1 произведение",
            "unit_definition": "Один оригинальный текст объёмом от 18 000 до 22 000 знаков с пробелами",
            "deliverable": "DOCX и HTML-текст с заголовком, лидом, 5 разделами и списком использованных открытых источников",
            "included": "разработка структуры; написание текста; две согласованные иллюстративные подписи; один раунд добровольной редакторской доработки",
            "excluded": "полевое исследование; платные архивные материалы; юридическая экспертиза; использование как аттестационной или научно-квалификационной работы",
            "inputs": "бренд-гайд, описание аудитории и фактические справочные материалы до 04.08.2026",
            "start_conditions": "после позиции 1, получения входов и оплаты этапа P-01",
            "due": "черновик — 10.08.2026; финальная версия — 14.08.2026 после одного консолидированного комментария",
            "criteria": "объём соблюдён; присутствуют лид и 5 разделов; фактические утверждения связаны с перечисленными источниками; текст не содержит аттестационного задания",
            "corrections": "недостатки устраняются без доплаты; дополнительно включён один консолидированный раунд творческих правок в пределах исходного задания",
            "dependency": "стартует после позиции 1; может быть принята или отменена отдельно",
            "dependency_line_ids": ["LN-001"],
            "separability": "independent",
            "rights_profile": "b1_simple_license",
            "rights": "права предоставляются по простой (неисключительной) лицензии в объёме, указанном ниже",
            "author_rights": {
                "work_description": "оригинальный научно-популярный лонгрид, прямо описанный в результате позиции",
                "actual_author": "Семёнов Семён Юрьевич, лично создающий произведение",
                "author_name_mode": "«Семён Семёнов» в подписи к публикации",
                "rights_basis": "договор авторского заказа по статье 1288 ГК РФ между Исполнителем-автором и Заказчиком в составе Оферты и этой Спецификации",
                "mode": "license",
                "rights_mode": "простая (неисключительная) лицензия; исключительное право остаётся у автора",
                "remuneration": "за создание — 10 000 руб.; за лицензию — 2 000 руб.; обе суммы входят в цену позиции 12 000 руб. до скидки",
                "effective_on": "после передачи финального файла и полной оплаты договорной цены позиции",
                "license_type": "простая (неисключительная)",
                "use_methods": "воспроизведение; размещение на сайте; доведение до всеобщего сведения; распространение фрагментов в рекламе проекта со ссылкой на публикацию",
                "territory": "весь мир",
                "term": "5 лет с момента начала лицензии",
                "adaptation": "разрешены корректура, вёрстка, сокращение не более 15% и адаптация заголовка без искажения смысла; иная переработка — с письменного согласия автора",
                "sublicensing": "не допускается; техническое размещение через хостинг и CMS не считается выдачей сублицензии",
                "third_party_objects": "открытые источники используются как сведения и цитаты в допустимом объёме; права на них не передаются",
                "third_author_or_contractor": "не участвует; творческое создание Б1 лично выполняет Исполнитель",
            },
            "gross_minor": 1_200_000,
            "discount_minor": 90_000,
            "contract_minor": 1_110_000,
        },
        {
            "line_id": "LN-003",
            "position": 3,
            "contract_contour": "B2",
            "contour_label": "Контур Б2 — авторский заказ, произведение создаёт другой фактический автор",
            "permitted_purpose": "иллюстрирование лонгрида из позиции 2 и анонсов просветительского сайта; вне аттестации и без приписывания авторства Заказчику",
            "receipt_name": "Создание комплекта иллюстраций и отчуждение исключительного права",
            "contractor_categories": "фактический автор Анна Кузнецова; Исполнитель организует создание и отвечает перед Заказчиком",
            "title": "Комплект авторских иллюстраций",
            "subject": "создание трёх оригинальных цифровых иллюстраций по мотивам городских архивов",
            "quantity": 3,
            "unit": "комплект",
            "qty_label": "3 иллюстрации",
            "unit_definition": "Три одинаковые по формату иллюстрации 2400 × 1600 px; индивидуальная тема каждой перечислена в брифе",
            "deliverable": "3 файла PNG, 3 исходника SVG и превью-лист PDF",
            "included": "эскиз каждой иллюстрации; одна консолидированная корректировка эскизов; финальная отрисовка; подготовка PNG и SVG",
            "excluded": "анимация; печатные макеты; шрифты и фотографии третьих лиц; товарный знак; новые сюжеты после утверждения эскизов",
            "inputs": "финальный текст позиции 2, бренд-гайд и референсы, права на которые Заказчик вправе передать для ознакомления",
            "start_conditions": "после черновика позиции 2, получения брифа и оплаты этапа P-02",
            "due": "эскизы — 13.08.2026; финальные файлы — 18.08.2026",
            "criteria": "переданы 3 разных сюжета в PNG и SVG; размеры соответствуют заданию; в файлах нет непредусмотренных объектов третьих лиц",
            "corrections": "недостатки устраняются без доплаты; одна корректировка эскизов включена, новый сюжет оформляется новой редакцией",
            "dependency": "зависит от позиции 2; при её отмене Заказчик отдельно выбирает отмену позиции 3 либо передаёт другой законный текстовый бриф",
            "dependency_line_ids": ["LN-002"],
            "separability": "dependent",
            "rights_profile": "b2_exclusive_alienation",
            "rights": "исключительное право отчуждается Заказчику после получения Исполнителем полной цепочки прав и выполнения условий перехода",
            "author_rights": {
                "work_description": "три оригинальные цифровые иллюстрации с сюжетами из утверждённого брифа",
                "actual_author": "Кузнецова Анна Игоревна (вымышленное лицо), фактический автор",
                "author_name_mode": "«Анна Кузнецова» в разделе благодарностей/авторов проекта",
                "rights_basis": "письменный авторский заказ № B2-DEMO-03 от 23.07.2026 между автором и Исполнителем с отчуждением исключительного права Исполнителю; акт и получение права обязательны до передачи Заказчику",
                "mode": "alienation",
                "rights_mode": "отчуждение исключительного права от Исполнителя Заказчику после получения права от фактического автора",
                "remuneration": "за создание и организацию — 7 000 руб.; за отчуждение исключительного права — 3 000 руб.; обе суммы входят в цену позиции 10 000 руб. до скидки",
                "effective_on": "не ранее одновременного выполнения трёх условий: передача финальных файлов, получение Исполнителем исключительного права от автора и полная оплата позиции",
                "alienation_scope": "исключительное право в полном объёме на весь срок его действия без территориального ограничения; личные неимущественные права автора не передаются",
                "alienation_moment": "дата последнего из трёх событий, перечисленных в условии предоставления прав; событие и акт фиксируются в деле заказа",
                "adaptation": "Заказчик вправе перерабатывать, кадрировать, масштабировать, менять цветовую гамму и объединять иллюстрации с текстом без искажения, порочащего автора",
                "third_party_objects": "не включаются; шрифты, фотографии и иные охраняемые объекты третьих лиц в результат не входят",
                "third_author_or_contractor": "да: фактический автор — Анна Кузнецова; Исполнитель организует создание, отвечает перед Заказчиком и обеспечивает цепочку прав",
            },
            "gross_minor": 1_000_000,
            "discount_minor": 60_000,
            "contract_minor": 940_000,
        },
    ],
    "pricing": {
        "subtotal_minor": 2_800_000,
        "discount_minor": 200_000,
        "contract_price_minor": 2_600_000,
        "gift_credit_minor": 500_000,
        "deposit_credit_minor": 0,
        "cash_due_minor": 2_100_000,
    },
    "payment_schedule": [
        {
            "stage_id": "C-01",
            "event": "при акцепте: зачёт ранее оплаченного сертификата",
            "cash_minor": 0,
            "gift_credit_minor": 500_000,
            "deposit_credit_minor": 0,
            "allocations": [
                {"line_id": "LN-001", "amount_minor": 500_000},
            ],
        },
        {
            "stage_id": "P-01",
            "event": "акцепт, консультации и запуск авторского текста",
            "cash_minor": 800_000,
            "gift_credit_minor": 0,
            "deposit_credit_minor": 0,
            "allocations": [
                {"line_id": "LN-001", "amount_minor": 50_000},
                {"line_id": "LN-002", "amount_minor": 750_000},
            ],
        },
        {
            "stage_id": "P-02",
            "event": "после черновика текста и до утверждения эскизов",
            "cash_minor": 700_000,
            "gift_credit_minor": 0,
            "deposit_credit_minor": 0,
            "allocations": [
                {"line_id": "LN-002", "amount_minor": 360_000},
                {"line_id": "LN-003", "amount_minor": 340_000},
            ],
        },
        {
            "stage_id": "P-03",
            "event": "после передачи финального текста и иллюстраций",
            "cash_minor": 600_000,
            "gift_credit_minor": 0,
            "deposit_credit_minor": 0,
            "allocations": [
                {"line_id": "LN-003", "amount_minor": 600_000},
            ],
        },
    ],
    "documents": {
        "offer": {
            "version": "3.0",
            "url": "https://akademsalon.ru/oferta.html",
        },
        "privacy": {
            "version": "3.0",
            "url": "https://akademsalon.ru/privacy.html",
        },
        "loyalty": {
            "applicable": True,
            "version": "1.7",
            "url": "https://akademsalon.ru/loyalty.html",
        },
    },
}


CHANGE_BEFORE = {
    "schema_version": "2.0",
    "spec_id": "SPEC-DEMO-CHANGE-2026",
    "revision": 1,
    "status": "accepted",
    "contract_price_minor": 3_300_000,
    "deposit_credit_minor": 500_000,
    "cash_due_minor": 2_800_000,
    "lines": [
        {"line_id": "LN-001", "title": "Аудит требований", "qty": "1 отчёт", "due": "29.07.2026", "price_minor": 700_000},
        {"line_id": "LN-002", "title": "Методические консультации", "qty": "3 часа", "due": "08.08.2026", "price_minor": 900_000},
        {"line_id": "LN-003", "title": "Редактура собственного текста", "qty": "20 страниц", "due": "12.08.2026", "price_minor": 1_200_000},
        {"line_id": "LN-004", "title": "Репетиция выступления", "qty": "1 встреча", "due": "16.08.2026", "price_minor": 500_000},
    ],
}

CHANGE_AFTER = {
    "schema_version": "2.0",
    "spec_id": "SPEC-DEMO-CHANGE-2026",
    "revision": 2,
    "status": "offered_change",
    "contract_price_minor": 3_600_000,
    "deposit_credit_minor": 500_000,
    "cash_due_minor": 3_100_000,
    "lines": [
        {"line_id": "LN-001", "title": "Аудит требований", "qty": "1 отчёт", "due": "29.07.2026", "price_minor": 700_000},
        {"line_id": "LN-002", "title": "Методические консультации", "qty": "3 часа", "due": "08.08.2026", "price_minor": 900_000},
        {"line_id": "LN-003", "title": "Редактура собственного текста", "qty": "20 страниц", "due": "12.08.2026", "price_minor": 1_200_000},
        {"line_id": "LN-004", "title": "Репетиция выступления", "qty": "2 встречи", "due": "18.08.2026", "price_minor": 800_000},
    ],
}

CHANGE = {
    "schema_version": "2.0",
    "document_type": "change_sheet",
    "spec_id": "SPEC-DEMO-CHANGE-2026",
    "revision": 2,
    "status": "offered_change",
    "display_date": "24 июля 2026 г.",
    "customer": "Соколова Дарья Андреевна (вымышленное лицо), 18+",
    "channel": "личный кабинет и подтверждённый Telegram",
    "documents": {
        "offer": {
            "version": "3.0",
            "url": "https://akademsalon.ru/oferta.html",
        },
        "privacy": {
            "version": "3.0",
            "url": "https://akademsalon.ru/privacy.html",
        },
        "loyalty": {
            "applicable": False,
            "version": "",
            "url": "",
        },
    },
    "reason": "Заказчик попросил добавить вторую репетицию после появления даты предзащиты.",
    "previous_snapshot": CHANGE_BEFORE,
    "new_snapshot": CHANGE_AFTER,
    "changes": [
        ["Контур и цель", "А: репетиция выступления по собственному материалу", "А: без изменения", "аттестационный результат за Заказчика не создаётся"],
        ["Количество", "1 встреча по 60 минут", "2 встречи по 60 минут", "увеличен объём позиции 4"],
        ["Результат", "1 репетиция и список вопросов", "2 репетиции, обновлённый хронометраж и список вопросов", "добавлен самостоятельный результат второй встречи"],
        ["Срок позиции 4", "16.08.2026", "18.08.2026", "перенос на 2 календарных дня"],
        ["Цена позиции 4", "5 000 руб.", "8 000 руб.", "увеличение на 3 000 руб."],
        ["Цена заказа", "33 000 руб.", "36 000 руб.", "увеличение на 3 000 руб."],
        ["Осталось деньгами", "28 000 руб.", "31 000 руб.", "депозит 5 000 руб. уже зачтён и не меняется"],
    ],
}


def first_cash_stage(spec: dict[str, Any]) -> dict[str, Any]:
    return next(stage for stage in spec["payment_schedule"] if stage["cash_minor"] > 0)


def validate_spec(spec: dict[str, Any]) -> None:
    lines = spec["lines"]
    line_ids = [line["line_id"] for line in lines]
    if not lines or len(line_ids) != len(set(line_ids)):
        raise ValueError(f"{spec['spec_id']}: positions must be present and unique")
    gross = sum(line["gross_minor"] for line in lines)
    discount = sum(line["discount_minor"] for line in lines)
    contractual = sum(line["contract_minor"] for line in lines)
    pricing = spec["pricing"]
    if gross != pricing["subtotal_minor"]:
        raise ValueError(f"{spec['spec_id']}: line subtotal mismatch")
    if discount != pricing["discount_minor"]:
        raise ValueError(f"{spec['spec_id']}: discount allocation mismatch")
    if contractual != pricing["contract_price_minor"] or gross - discount != contractual:
        raise ValueError(f"{spec['spec_id']}: contract price mismatch")
    expected_cash = (
        contractual
        - pricing["gift_credit_minor"]
        - pricing["deposit_credit_minor"]
    )
    if expected_cash != pricing["cash_due_minor"]:
        raise ValueError(f"{spec['spec_id']}: cash due mismatch")

    funded: dict[str, int] = {line_id: 0 for line_id in line_ids}
    cash_total = gift_total = deposit_total = 0
    for stage in spec["payment_schedule"]:
        stage_total = (
            stage["cash_minor"]
            + stage["gift_credit_minor"]
            + stage["deposit_credit_minor"]
        )
        allocation_total = sum(x["amount_minor"] for x in stage["allocations"])
        if stage_total != allocation_total:
            raise ValueError(f"{spec['spec_id']} {stage['stage_id']}: allocation mismatch")
        cash_total += stage["cash_minor"]
        gift_total += stage["gift_credit_minor"]
        deposit_total += stage["deposit_credit_minor"]
        for allocation in stage["allocations"]:
            if allocation["line_id"] not in funded:
                raise ValueError(f"{spec['spec_id']}: allocation points to unknown line")
            funded[allocation["line_id"]] += allocation["amount_minor"]
    if cash_total != pricing["cash_due_minor"]:
        raise ValueError(f"{spec['spec_id']}: cash stages mismatch")
    if gift_total != pricing["gift_credit_minor"]:
        raise ValueError(f"{spec['spec_id']}: gift credit mismatch")
    if deposit_total != pricing["deposit_credit_minor"]:
        raise ValueError(f"{spec['spec_id']}: deposit credit mismatch")
    expected_funded = {line["line_id"]: line["contract_minor"] for line in lines}
    if funded != expected_funded:
        raise ValueError(f"{spec['spec_id']}: line funding mismatch: {funded}")

    graph = {line["line_id"]: line["dependency_line_ids"] for line in lines}
    for line_id, dependencies in graph.items():
        if any(dep not in graph for dep in dependencies):
            raise ValueError(f"{spec['spec_id']} {line_id}: unknown dependency")

    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(line_id: str) -> None:
        if line_id in visiting:
            raise ValueError(f"{spec['spec_id']}: dependency cycle")
        if line_id in visited:
            return
        visiting.add(line_id)
        for dependency in graph[line_id]:
            visit(dependency)
        visiting.remove(line_id)
        visited.add(line_id)

    for line_id in graph:
        visit(line_id)

    required_line_fields = (
        "contract_contour",
        "contour_label",
        "permitted_purpose",
        "receipt_name",
        "contractor_categories",
        "unit_definition",
        "deliverable",
        "included",
        "excluded",
        "inputs",
        "start_conditions",
        "due",
        "criteria",
        "corrections",
        "rights_profile",
        "rights",
    )
    for line in lines:
        missing = [field for field in required_line_fields if not line.get(field)]
        if missing:
            raise ValueError(f"{spec['spec_id']} {line['line_id']}: missing {missing}")
        contour = line["contract_contour"]
        if contour not in {"A", "B1", "B2"}:
            raise ValueError(f"{spec['spec_id']} {line['line_id']}: bad contour")
        if contour in {"B1", "B2"}:
            author_rights = line.get("author_rights") or {}
            required_rights = (
                "work_description",
                "actual_author",
                "author_name_mode",
                "rights_basis",
                "mode",
                "rights_mode",
                "remuneration",
                "effective_on",
                "adaptation",
                "third_party_objects",
                "third_author_or_contractor",
            )
            missing_rights = [
                field for field in required_rights if not author_rights.get(field)
            ]
            if missing_rights:
                raise ValueError(
                    f"{spec['spec_id']} {line['line_id']}: "
                    f"B position missing {missing_rights}"
                )
            if contour == "B1" and "Семёнов Семён Юрьевич" not in author_rights["actual_author"]:
                raise ValueError(
                    f"{spec['spec_id']} {line['line_id']}: B1 author mismatch"
                )
            if author_rights["mode"] == "license":
                license_fields = (
                    "license_type",
                    "use_methods",
                    "territory",
                    "term",
                    "sublicensing",
                )
                if any(not author_rights.get(field) for field in license_fields):
                    raise ValueError(
                        f"{spec['spec_id']} {line['line_id']}: "
                        "license parameters incomplete"
                    )
            elif author_rights["mode"] == "alienation":
                alienation_fields = ("alienation_scope", "alienation_moment")
                if any(not author_rights.get(field) for field in alienation_fields):
                    raise ValueError(
                        f"{spec['spec_id']} {line['line_id']}: "
                        "alienation parameters incomplete"
                    )
            else:
                raise ValueError(
                    f"{spec['spec_id']} {line['line_id']}: unknown rights mode"
                )
        if line["quantity"] > 1 and "одинаков" not in line["unit_definition"].lower() and line["unit"] != "расчётная страница":
            raise ValueError(f"{spec['spec_id']} {line['line_id']}: quantity semantics unclear")


def summary_header(spec: dict[str, Any], st: dict[str, ParagraphStyle]) -> list[Any]:
    first_stage = first_cash_stage(spec)
    count = len(spec["lines"])
    count_label = f"{count} позиция" if count == 1 else f"{count} позиции"
    pricing = spec["pricing"]
    lead = (
        "Индивидуальные условия к Публичной оферте ред. 3.0. Здесь простыми словами "
        "зафиксированы состав, результат, срок, цена и правила по каждой позиции."
    )
    story: list[Any] = [
        para(
            f"АКАДЕМИЧЕСКИЙ САЛОН · ЗАПОЛНЕННЫЙ ОБРАЗЕЦ · {spec['display_date']}",
            st["caps"],
        ),
        para("Спецификация заказа", st["title"]),
        para(lead, st["subtitle"]),
        HRFlowable(width="100%", thickness=0.8, color=WAX, spaceAfter=8),
        para("Коротко о заказе", st["h1"]),
        make_table(
            [
                [
                    para("СОСТАВ", st["metric_label"]),
                    para("ФИНАЛЬНЫЙ СРОК", st["metric_label"]),
                    para("ТВЁРДАЯ ЦЕНА", st["metric_label"]),
                    para("ПЕРВЫЙ ПЛАТЁЖ", st["metric_label"]),
                ],
                [
                    para(count_label, st["metric"]),
                    para(spec["final_due"], st["metric"]),
                    para(rub(pricing["contract_price_minor"]), st["metric"]),
                    para(rub(first_stage["cash_minor"]), st["metric"]),
                ],
            ],
            [34 * mm, 47 * mm, 46 * mm, 47 * mm],
            header=False,
            font_size=8,
        ),
        Spacer(1, 3 * mm),
        para(
            f"<b>Заказчик:</b> {spec['customer']}<br/>"
            f"<b>Плательщик:</b> {spec['payer']}<br/>"
            f"<b>Канал подтверждения:</b> {spec['channel']}",
            st["body_tight"],
        ),
        note_box(
            "Главное перед оплатой",
            "Проверьте, что в таблице перечислены все нужные позиции, а в карточках ниже "
            "верно указаны исходные материалы, результат, срок и цена. Не оплачивайте "
            "документ, если хотя бы одно условие требует изменения.",
            st,
        ),
        Spacer(1, 2 * mm),
        para("Состав и цена", st["h1"]),
    ]
    rows: list[list[Any]] = [
        ["№", "Контур", "Позиция", "Количество", "Результат", "Срок", "Цена"]
    ]
    for line in spec["lines"]:
        rows.append(
            [
                str(line["position"]),
                line["contract_contour"],
                line["title"],
                line["qty_label"],
                line["deliverable"],
                line["due"].split(";")[0],
                rub(line["contract_minor"]),
            ]
        )
    story.append(
        make_table(
            rows,
            [8 * mm, 17 * mm, 36 * mm, 24 * mm, 40 * mm, 25 * mm, 24 * mm],
            font_size=6.9,
            aligns=["CENTER", "CENTER", "LEFT", "CENTER", "LEFT", "LEFT", "RIGHT"],
        )
    )
    if pricing["discount_minor"] or pricing["gift_credit_minor"] or pricing["deposit_credit_minor"]:
        details = [
            f"Цена строк до скидки — {rub_plain(pricing['subtotal_minor'])}",
            f"скидка — {rub_plain(pricing['discount_minor'])}",
            f"твёрдая цена — {rub_plain(pricing['contract_price_minor'])}",
        ]
        if pricing["gift_credit_minor"]:
            details.append(
                f"зачтено сертификатом — {rub_plain(pricing['gift_credit_minor'])}"
            )
        if pricing["deposit_credit_minor"]:
            details.append(
                f"зачтено депозитом — {rub_plain(pricing['deposit_credit_minor'])}"
            )
        details.append(f"осталось деньгами — {rub_plain(pricing['cash_due_minor'])}")
        story.append(para("; ".join(details) + ".", st["small"]))
    return story


def payment_allocations(stage: dict[str, Any], lines_by_id: dict[str, dict]) -> str:
    return "; ".join(
        f"позиция {lines_by_id[x['line_id']]['position']} — {rub(x['amount_minor'])}"
        for x in stage["allocations"]
    )


def document_reference(label: str, document: dict[str, Any]) -> str:
    if document.get("applicable") is False:
        return f"{label}: не применяется"
    return f"{label} ред. {document['version']} ({document['url']})"


def common_terms(spec: dict[str, Any], st: dict[str, ParagraphStyle]) -> list[Any]:
    pricing = spec["pricing"]
    by_id = {line["line_id"]: line for line in spec["lines"]}
    price_rows: list[list[Any]] = [
        ["Позиция", "До скидки", "Скидка", "Договорная цена"]
    ]
    for line in spec["lines"]:
        price_rows.append(
            [
                f"{line['position']}. {line['title']}",
                rub(line["gross_minor"]),
                rub(line["discount_minor"]),
                rub(line["contract_minor"]),
            ]
        )
    price_rows.append(
        [
            "Итого",
            rub(pricing["subtotal_minor"]),
            rub(pricing["discount_minor"]),
            rub(pricing["contract_price_minor"]),
        ]
    )
    payment_rows: list[list[Any]] = [
        ["Этап", "Когда", "Деньгами", "Зачёт", "Распределение"]
    ]
    for stage in spec["payment_schedule"]:
        credit = stage["gift_credit_minor"] + stage["deposit_credit_minor"]
        payment_rows.append(
            [
                stage["stage_id"],
                stage["event"],
                rub(stage["cash_minor"]),
                rub(credit),
                payment_allocations(stage, by_id),
            ]
        )
    payment_rows.append(
        [
            "Итого",
            "",
            rub(pricing["cash_due_minor"]),
            rub(pricing["gift_credit_minor"] + pricing["deposit_credit_minor"]),
            rub(pricing["contract_price_minor"]),
        ]
    )

    terms: list[Any] = []
    terms.extend(heading("1", "Предмет и границы заказа", st))
    terms.extend(
        [
            clause(
                "1.1",
                "Каждая позиция отнесена ровно к одному договорному контуру. В Контуре А "
                "Исполнитель оказывает услугу сопровождения, не создавая за Заказчика "
                "аттестационный результат. В Б1 Исполнитель лично создаёт указанное "
                "произведение вне аттестации. В Б2 произведение создаёт названный "
                "фактический автор, а Исполнитель организует создание и обеспечивает "
                "указанную цепочку прав.",
                st,
            ),
            clause(
                "1.2",
                "По каждой позиции договорный предмет определяется одновременно её "
                "карточкой: Контуром, разрешённой целью, описанием, входными материалами, "
                "результатом, критериями, сроком, правами и ценой. Позиция без Контура, "
                "а Б1/Б2 без заполненного блока автора и прав оплате не подлежит.",
                st,
            ),
            clause(
                "1.3",
                "Исполнитель не гарантирует оценку, допуск, решение преподавателя, "
                "комиссии или иной третьей стороны. Он отвечает за соответствие "
                "собственного результата прямо согласованным критериям.",
                st,
            ),
        ]
    )
    terms.extend(heading("2", "Цена и порядок расчётов", st))
    terms.append(
        make_table(
            price_rows,
            [70 * mm, 35 * mm, 31 * mm, 38 * mm],
            font_size=7.4,
            aligns=["LEFT", "RIGHT", "RIGHT", "RIGHT"],
        )
    )
    if pricing["gift_credit_minor"] or pricing["deposit_credit_minor"]:
        terms.append(
            para(
                f"Зачёт сертификата: {rub_plain(pricing['gift_credit_minor'])}. "
                f"Зачёт депозита: {rub_plain(pricing['deposit_credit_minor'])}. "
                f"К оплате деньгами: <b>{rub_plain(pricing['cash_due_minor'])}</b>. "
                "Сертификат и депозит являются зачётом ранее внесённого аванса, а не скидкой.",
                st["body"],
            )
        )
    terms.append(
        make_table(
            payment_rows,
            [17 * mm, 55 * mm, 24 * mm, 23 * mm, 55 * mm],
            font_size=7.0,
            aligns=["LEFT", "LEFT", "RIGHT", "RIGHT", "LEFT"],
        )
    )
    terms.extend(
        [
            clause(
                "2.1",
                "Юридически значимы рублёвые суммы и их распределение по позициям. "
                "Проценты, если показываются в интерфейсе, имеют только справочный характер.",
                st,
            ),
            clause(
                "2.2",
                "Исполнитель применяет налог на профессиональный доход; НДС Заказчику "
                "не предъявляется. Чек НПД формируется на каждое подтверждённое денежное "
                "поступление с наименованием услуги и суммой.",
                st,
            ),
        ]
    )
    terms.extend(heading("3", "Сроки и зависимости", st))
    terms.extend(
        [
            clause(
                "3.1",
                "Срок каждой позиции указан в её карточке. Если срок зависит от "
                "материалов или результата другой позиции, работа начинается только "
                "после выполнения прямо названных условий старта.",
                st,
            ),
            clause(
                "3.2",
                "Задержка обязательного материала, ответа или оплаты приостанавливает "
                "затронутую позицию на период задержки. Новый срок фиксируется в деле "
                "заказа с учётом фактической продолжительности паузы и разумного времени "
                "на возобновление; остальные независимые позиции продолжаются.",
                st,
            ),
            clause(
                "3.3",
                "Изменение темы, объёма, исходных требований, результата или срока "
                "после акцепта оформляется листом изменений. До его отдельного "
                "подтверждения новые условия не применяются.",
                st,
            ),
        ]
    )
    terms.extend(heading("4", "Передача, проверка и исправления", st))
    terms.extend(
        [
            clause(
                "4.1",
                "Результат размещается в деле заказа. В журнале указываются дата, "
                "версия, имя файла и контрольная сумма переданного файла. Если в "
                "карточке предусмотрена встреча, факт и продолжительность встречи "
                "также фиксируются.",
                st,
            ),
            clause(
                "4.2",
                "В течение 7 календарных дней Заказчик проводит первичную проверку и "
                "сообщает конкретные несоответствия критериям. Это организационный "
                "срок быстрой проверки: его истечение, молчание или начало использования "
                "не сокращают обязательные права потребителя и сроки требований по закону.",
                st,
            ),
            clause(
                "4.3",
                "Подтверждённое несоответствие согласованным критериям устраняется без "
                "доплаты в разумный срок с учётом характера недостатка. Новое пожелание, "
                "которое меняет предмет, объём или результат, является изменением заказа, "
                "а не исправлением недостатка.",
                st,
            ),
            clause(
                "4.4",
                "Исполнитель не отвечает за изменения, внесённые после передачи "
                "Заказчиком или третьими лицами, а также за изменение алгоритма внешней "
                "системы проверки после даты зафиксированного отчёта.",
                st,
            ),
        ]
    )
    terms.extend(heading("5", "Отказ от позиции и возврат", st))
    terms.extend(
        [
            clause(
                "5.1",
                "Заказчик вправе отказаться от всего заказа или самостоятельной "
                "позиции в порядке статьи 32 Закона РФ «О защите прав потребителей». "
                "Отказ от самостоятельной позиции не прекращает остальные.",
                st,
            ),
            clause(
                "5.2",
                "При отмене зависимой позиции Заказчик отдельно выбирает её отмену либо "
                "предоставляет допустимый заменяющий результат. Исполнитель не продолжает "
                "зависимую позицию на неподтверждённых исходных данных.",
                st,
            ),
            clause(
                "5.3",
                "Возвращается неоспариваемая часть аванса за вычетом документально "
                "подтверждённых необходимых расходов отменённой позиции. Стоимость "
                "фактически предоставленного самостоятельного результата учитывается "
                "только в пределах заранее согласованной цены этой позиции. Предпросмотр "
                "и внутренний процент готовности сами по себе не подтверждают оказание "
                "или приёмку.",
                st,
            ),
        ]
    )
    terms.extend(heading("6", "Права на материалы и допустимое использование", st))
    terms.extend(
        [
            clause(
                "6.1",
                "Права на исходные тексты, данные и иные материалы Заказчика остаются "
                "у их правообладателей. Заказчик разрешает Исполнителю обрабатывать их "
                "только для исполнения заказа и подтверждает наличие необходимых прав "
                "на их передачу.",
                st,
            ),
            clause(
                "6.2",
                "Профиль прав по каждой позиции указан в её карточке. Исключительные "
                "права не переходят молчанием. Для Б1/Б2 обязательны фактический автор, "
                "основание прав, вознаграждение, режим предоставления, момент его начала, "
                "способы использования и допустимые изменения. При лицензии также "
                "фиксируются вид, территория, срок и сублицензирование; при отчуждении — "
                "объём и момент перехода исключительного права.",
                st,
            ),
            clause(
                "6.3",
                "Заказчик не использует произведение Б для аттестации и не указывает себя "
                "автором вопреки фактам. Право авторства и право на имя неотчуждаемы. "
                "Разрешённая цель каждой позиции является существенной границей заказа.",
                st,
            ),
        ]
    )
    terms.extend(heading("7", "Стороны, электронное подтверждение и документы", st))
    terms.extend(
        [
            clause(
                "7.1",
                "Исполнитель: Семёнов Семён Юрьевич, плательщик НПД, ИНН 212885750445; "
                "статус НПД проверен по сервису ФНС 24.07.2026. "
                f"Заказчик: {spec['customer']}. Плательщик: {spec['payer']}. "
                "Оплата третьим лицом не делает его Заказчиком и не даёт ему доступ к "
                "содержанию дела без отдельного полномочия.",
                st,
            ),
            clause(
                "7.2",
                f"Подтверждённый канал: {spec['channel']}. Действие из подтверждённой "
                "учётной записи или по выданному персональному ключу фиксируется вместе "
                "с текстом действия, временем и редакцией документа. Заказчик не "
                "передаёт такой доступ третьим лицам.",
                st,
            ),
            clause(
                "7.3",
                "Применимые документы: "
                f"{document_reference('Публичная оферта', spec['documents']['offer'])}; "
                f"{document_reference('Политика обработки персональных данных', spec['documents']['privacy'])}; "
                f"{document_reference('Правила программы лояльности', spec['documents']['loyalty'])}. "
                "Обязательные нормы закона имеют "
                "приоритет. Затем применяются принятый лист изменений, настоящая "
                "Спецификация и Оферта; индивидуальное условие Спецификации имеет "
                "приоритет над общим условием Оферты в части конкретного заказа.",
                st,
            ),
            clause(
                "7.4",
                "До акцепта Заказчик получает неизменяемый снимок. Принятая редакция "
                "не перезаписывается: исправление значимого условия создаёт новую "
                "редакцию с таблицей «было / стало» и требует отдельного подтверждения.",
                st,
            ),
        ]
    )
    terms.append(
        note_box(
            "Статус образца",
            "Все имена, контакты, даты и параметры в этом PDF вымышлены. Документ "
            "показывает рекомендуемую структуру и не является предложением конкретному лицу.",
            st,
        )
    )
    return terms


def specification_story(spec: dict[str, Any], st: dict[str, ParagraphStyle]) -> list[Any]:
    story = summary_header(spec, st)
    story.append(PageBreak())
    story.append(para("Подробно по позициям", st["title"]))
    story.append(
        para(
            "Карточка позиции отвечает на четыре практических вопроса: что именно "
            "делаем, что получит Заказчик, когда и как проверить результат.",
            st["subtitle"],
        )
    )
    for index, line in enumerate(spec["lines"]):
        if index:
            story.append(PageBreak())
            story.append(
                para(f"Позиция {line['position']} — подробные условия", st["title"])
            )
        story.append(KeepTogether([position_card(line, st)]))
        story.append(Spacer(1, 3 * mm))
        story.append(KeepTogether([execution_card(line, st)]))
        author_block = author_rights_card(line, st)
        if author_block is not None:
            story.append(Spacer(1, 3 * mm))
            story.append(author_block)
        if index != len(spec["lines"]) - 1:
            story.append(Spacer(1, 2 * mm))
    story.append(PageBreak())
    story.append(para("Общие условия заказа", st["title"]))
    story.append(
        para(
            "Эти правила читаются вместе с карточками позиций и Публичной офертой.",
            st["subtitle"],
        )
    )
    story.extend(common_terms(spec, st))
    return story


def change_story(change: dict[str, Any], st: dict[str, ParagraphStyle]) -> list[Any]:
    before = change["previous_snapshot"]
    after = change["new_snapshot"]
    story: list[Any] = [
        para(
            f"АКАДЕМИЧЕСКИЙ САЛОН · ЗАПОЛНЕННЫЙ ОБРАЗЕЦ · {change['display_date']}",
            st["caps"],
        ),
        para("Лист изменений к спецификации заказа", st["title"]),
        para(
            "Показывает только изменяемые условия. Полная обновлённая спецификация "
            "выдаётся вместе с этим листом и подтверждается отдельно.",
            st["subtitle"],
        ),
        HRFlowable(width="100%", thickness=0.8, color=WAX, spaceAfter=8),
        para("Коротко: что меняется", st["h1"]),
        make_table(
            [
                [
                    para("ИЗМЕНЕНА", st["metric_label"]),
                    para("БЫЛО", st["metric_label"]),
                    para("СТАЛО", st["metric_label"]),
                    para("ВЛИЯНИЕ", st["metric_label"]),
                ],
                [
                    para("Позиция 4", st["metric"]),
                    para("1 встреча", st["metric"]),
                    para("2 встречи", st["metric"]),
                    para("+3 000 руб. · +2 дня", st["metric"]),
                ],
            ],
            [38 * mm, 38 * mm, 38 * mm, 60 * mm],
            header=False,
        ),
        Spacer(1, 3 * mm),
        para(
            f"<b>Причина:</b> {change['reason']}<br/>"
            f"<b>Заказчик:</b> {change['customer']}<br/>"
            f"<b>Канал подтверждения:</b> {change['channel']}",
            st["body"],
        ),
        note_box(
            "До подтверждения ничего не меняется",
            "Принятая редакция 1 продолжает действовать, пока Заказчик отдельно не "
            "подтвердит редакцию 2. Молчание, продолжение переписки и просмотр файла "
            "не считаются согласием с изменением.",
            st,
        ),
        Spacer(1, 2 * mm),
        para("Таблица «было / стало»", st["h1"]),
        make_table(
            [["Условие", "Было", "Стало", "Что это меняет"]] + change["changes"],
            [34 * mm, 40 * mm, 49 * mm, 51 * mm],
            font_size=7.4,
        ),
        Spacer(1, 3 * mm),
        para(
            "Позиции 1–3, их результаты, сроки, критерии, цена и порядок приёмки "
            "не меняются. Зависимостей от позиции 4 у них нет.",
            st["body"],
        ),
        PageBreak(),
        para("Как применяется изменение", st["title"]),
        para(
            "Этот лист нужен, чтобы новая договорённость не растворилась в переписке.",
            st["subtitle"],
        ),
    ]
    story.extend(heading("1", "Новая позиция 4", st))
    story.extend(
        [
            clause(
                "1.1",
                "Исполнитель проводит две репетиции по 60 минут по материалам "
                "Заказчика. После каждой встречи фиксируются хронометраж, замечания "
                "по ясности и вопросы для самостоятельной подготовки.",
                st,
            ),
            clause(
                "1.2",
                "Вторая встреча является самостоятельным дополнительным результатом. "
                "Общая цена позиции 4 составляет 8 000 руб.; увеличение к принятой "
                "редакции — 3 000 руб.",
                st,
            ),
            clause(
                "1.3",
                "Срок позиции 4 — 18.08.2026. Условия старта: слайды и текст "
                "выступления Заказчика переданы не позднее 15.08.2026.",
                st,
            ),
        ]
    )
    story.extend(heading("2", "Расчёты после подтверждения", st))
    story.append(
        make_table(
            [
                ["Показатель", "Редакция 1", "Редакция 2", "Разница"],
                ["Твёрдая цена заказа", rub(before["contract_price_minor"]), rub(after["contract_price_minor"]), "+3 000 руб."],
                ["Зачтённый депозит", rub(before["deposit_credit_minor"]), rub(after["deposit_credit_minor"]), "без изменений"],
                ["Осталось деньгами", rub(before["cash_due_minor"]), rub(after["cash_due_minor"]), "+3 000 руб."],
            ],
            [61 * mm, 39 * mm, 39 * mm, 35 * mm],
            font_size=7.8,
            aligns=["LEFT", "RIGHT", "RIGHT", "RIGHT"],
        )
    )
    story.extend(
        [
            clause(
                "2.1",
                "Дополнительные 3 000 руб. целиком относятся к позиции 4 и включаются "
                "в её финальный платёж. Ранее зачтённый депозит не списывается повторно.",
                st,
            ),
            clause(
                "2.2",
                "Если Заказчик не подтверждает изменение, цена, объём и срок остаются "
                "по редакции 1; дополнительная встреча не бронируется.",
                st,
            ),
        ]
    )
    story.extend(heading("3", "Подтверждение и доказательства", st))
    story.extend(
        [
            clause(
                "3.1",
                "До подтверждения Заказчик получает этот лист и полную редакцию 2. "
                "Кнопка подтверждения повторяет: «2 встречи, 18.08.2026, увеличение "
                "цены на 3 000 руб.».",
                st,
            ),
            clause(
                "3.2",
                "Журнал сохраняет обе редакции, их контрольные суммы, время показа и "
                "подтверждения, подтверждённый канал и точный текст действия. "
                "Редакция 1 остаётся доступной в архиве.",
                st,
            ),
            clause(
                "3.3",
                "После подтверждения редакция 2 заменяет редакцию 1 только в объёме "
                "прямо указанных изменений. Все остальные принятые условия сохраняются.",
                st,
            ),
            clause(
                "3.4",
                "Лист действует вместе с Публичной офертой ред. 3.0 "
                "(https://akademsalon.ru/oferta.html) и Политикой обработки персональных "
                "данных ред. 3.0 (https://akademsalon.ru/privacy.html). Правила программы "
                "лояльности к этому примеру не применяются.",
                st,
            ),
            note_box(
                "Статус образца",
                "Все имена, контакты, даты и параметры вымышлены. Это пример отдельного "
                "листа изменений, а не предложение конкретному лицу.",
                st,
            ),
        ]
    )
    return story


def build_pdf(
    target: Path,
    story: list[Any],
    *,
    title: str,
    footer_title: str,
    hash_lines: list[str],
) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    doc = SpecificationDocument(target, title)
    doc.build(
        story,
        canvasmaker=partial(
            FooterCanvas,
            footer_title=footer_title,
            hash_lines=hash_lines,
        ),
    )


def main() -> None:
    register_fonts()
    st = styles()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)

    for spec in (SINGLE, MULTI):
        validate_spec(spec)

    single_hash = canonical_hash(SINGLE)
    multi_hash = canonical_hash(MULTI)
    previous_hash = canonical_hash(CHANGE_BEFORE)
    new_hash = canonical_hash(CHANGE_AFTER)

    targets = {
        "single": OUTPUT / "specifikaciya-v2-01-odna-poziciya.pdf",
        "multi": OUTPUT / "specifikaciya-v2-02-neskolko-poziciy.pdf",
        "change": OUTPUT / "specifikaciya-v2-03-list-izmeneniy.pdf",
    }
    build_pdf(
        targets["single"],
        specification_story(SINGLE, st),
        title="Спецификация заказа - одна позиция",
        footer_title=f"{SINGLE['spec_id']} · редакция {SINGLE['revision']} · ОБРАЗЕЦ",
        hash_lines=[f"SHA-256 данных: {single_hash}"],
    )
    build_pdf(
        targets["multi"],
        specification_story(MULTI, st),
        title="Спецификация заказа - несколько позиций",
        footer_title=f"{MULTI['spec_id']} · редакция {MULTI['revision']} · ОБРАЗЕЦ",
        hash_lines=[f"SHA-256 данных: {multi_hash}"],
    )
    build_pdf(
        targets["change"],
        change_story(CHANGE, st),
        title="Лист изменений к спецификации заказа",
        footer_title=f"{CHANGE['spec_id']} · лист изменений · редакция {CHANGE['revision']} · ОБРАЗЕЦ",
        hash_lines=[
            f"SHA-256 условий редакции 2: {new_hash}",
            f"SHA-256 принятой редакции 1: {previous_hash}",
        ],
    )

    public_targets = {
        "single": PUBLIC / "specifikaciya-obrazec-odna-poziciya.pdf",
        "multi": PUBLIC / "specifikaciya-obrazec-neskolko-poziciy.pdf",
        "change": PUBLIC / "specifikaciya-obrazec-list-izmeneniy.pdf",
    }
    for key, source in targets.items():
        shutil.copy2(source, public_targets[key])

    # Stable legacy URLs and QA filenames continue to resolve, but now point
    # to the same canonical generator instead of a second layout.
    aliases = {
        PUBLIC / "specifikaciya-obrazec.pdf": targets["multi"],
        OUTPUT / "specifikaciya-obrazec.pdf": targets["multi"],
        OUTPUT / "specifikaciya-test-01-odna-poziciya.pdf": targets["single"],
        OUTPUT / "specifikaciya-test-02-tri-pozicii.pdf": targets["multi"],
        OUTPUT / "specifikaciya-test-03-redakciya-2.pdf": targets["change"],
    }
    for alias, source in aliases.items():
        alias.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, alias)

    manifest: dict[str, Any] = {
        "schema_version": "2.0",
        "generator": "scripts/generate-spec-v2.py",
        "documents": {},
    }
    data_hashes = {
        "single": single_hash,
        "multi": multi_hash,
        "change": new_hash,
    }
    for key, target in targets.items():
        manifest["documents"][key] = {
            "path": str(target.relative_to(ROOT)),
            "data_sha256": data_hashes[key],
            "pdf_sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
            "bytes": target.stat().st_size,
        }
    manifest["documents"]["change"]["previous_data_sha256"] = previous_hash
    (OUTPUT / "specifikaciya-v2-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    for key, row in manifest["documents"].items():
        print(f"{key}: {row['path']}")
        print(f"  data SHA-256: {row['data_sha256']}")
        print(f"  PDF SHA-256:  {row['pdf_sha256']}")


if __name__ == "__main__":
    main()
