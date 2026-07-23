#!/usr/bin/env python3
"""Generate the public multi-item specification sample."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    HRFlowable,
    KeepTogether,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "specifikaciya-obrazec.pdf"
PUBLIC = ROOT / "assets" / "docs" / "specifikaciya-obrazec.pdf"
FONT = Path("/System/Library/Fonts/Supplemental/Arial.ttf")
FONT_BOLD = Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf")

INK = colors.HexColor("#28231E")
SOFT = colors.HexColor("#6D655C")
PAPER = colors.HexColor("#F7F2E8")
WAX = colors.HexColor("#9E2F2F")
HAIR = colors.HexColor("#D8CEC0")
GREEN = colors.HexColor("#365C4A")


SPEC_DATA = {
    "schema_version": "2.0",
    "spec_id": "SPEC-DEMO-2026-0724",
    "revision": 1,
    "offer": "2.0",
    "currency": "RUB",
    "lines": [
        {
            "line_id": "LN-001",
            "type": "consultation",
            "title": "Консультация по структуре собственного черновика",
            "qty": 2,
            "unit": "час",
            "price_minor": 600000,
            "due": "2026-08-05T20:00:00+03:00",
        },
        {
            "line_id": "LN-002",
            "type": "editing",
            "title": "Редактура и комментарии к черновику Заказчика",
            "qty": 30,
            "unit": "расчётная страница",
            "price_minor": 1800000,
            "due": "2026-08-12T20:00:00+03:00",
        },
        {
            "line_id": "LN-003",
            "type": "formatting",
            "title": "Оформление собственного текста по методическим требованиям",
            "qty": 1,
            "unit": "комплект",
            "price_minor": 700000,
            "due": "2026-08-15T20:00:00+03:00",
            "parent_line_id": "LN-002",
        },
    ],
    "subtotal_minor": 3100000,
    "discount_minor": 200000,
    "contract_price_minor": 2900000,
}
SPEC_HASH = hashlib.sha256(
    json.dumps(SPEC_DATA, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
).hexdigest()


def rub(value: int) -> str:
    return f"{value // 100:,.0f}".replace(",", " ") + " руб."


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont("Salon", str(FONT)))
    pdfmetrics.registerFont(TTFont("Salon-Bold", str(FONT_BOLD)))


def build_styles():
    base = getSampleStyleSheet()
    return {
        "body": ParagraphStyle(
            "Body", parent=base["BodyText"], fontName="Salon", fontSize=9.1,
            leading=12.2, textColor=INK, spaceAfter=5,
        ),
        "small": ParagraphStyle(
            "Small", parent=base["BodyText"], fontName="Salon", fontSize=7.7,
            leading=10, textColor=SOFT,
        ),
        "title": ParagraphStyle(
            "Title", parent=base["Title"], fontName="Salon-Bold", fontSize=22,
            leading=25, textColor=INK, alignment=TA_LEFT, spaceAfter=4,
        ),
        "subtitle": ParagraphStyle(
            "Subtitle", parent=base["BodyText"], fontName="Salon", fontSize=10.2,
            leading=13, textColor=SOFT, spaceAfter=11,
        ),
        "h1": ParagraphStyle(
            "H1", parent=base["Heading2"], fontName="Salon-Bold", fontSize=13,
            leading=16, textColor=INK, spaceBefore=10, spaceAfter=7,
        ),
        "h2": ParagraphStyle(
            "H2", parent=base["Heading3"], fontName="Salon-Bold", fontSize=10.2,
            leading=13, textColor=INK, spaceBefore=6, spaceAfter=4,
        ),
        "caps": ParagraphStyle(
            "Caps", parent=base["BodyText"], fontName="Salon-Bold", fontSize=7.5,
            leading=9, textColor=WAX, spaceAfter=4,
        ),
        "right": ParagraphStyle(
            "Right", parent=base["BodyText"], fontName="Salon", fontSize=8.2,
            leading=10, textColor=SOFT, alignment=TA_RIGHT,
        ),
        "center": ParagraphStyle(
            "Center", parent=base["BodyText"], fontName="Salon", fontSize=7.5,
            leading=9, textColor=SOFT, alignment=TA_CENTER,
        ),
    }


def p(text: str, style) -> Paragraph:
    return Paragraph(text, style)


def table(data, widths, header=True, aligns=None, font_size=8.1):
    cell_style = ParagraphStyle(
        "TableCell", fontName="Salon", fontSize=font_size,
        leading=font_size + 2.4, textColor=INK,
    )
    head_style = ParagraphStyle(
        "TableHead", parent=cell_style, fontName="Salon-Bold", textColor=SOFT,
    )
    wrapped = []
    for row_index, row in enumerate(data):
        wrapped.append([
            value if isinstance(value, Paragraph) else Paragraph(
                str(value), head_style if header and row_index == 0 else cell_style
            )
            for value in row
        ])
    t = Table(wrapped, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("FONTNAME", (0, 0), (-1, -1), "Salon"),
        ("FONTSIZE", (0, 0), (-1, -1), font_size),
        ("LEADING", (0, 0), (-1, -1), font_size + 2.4),
        ("TEXTCOLOR", (0, 0), (-1, -1), INK),
        ("GRID", (0, 0), (-1, -1), 0.45, HAIR),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    if header:
        commands += [
            ("BACKGROUND", (0, 0), (-1, 0), PAPER),
            ("TEXTCOLOR", (0, 0), (-1, 0), SOFT),
        ]
    for idx, align in enumerate(aligns or []):
        commands.append(("ALIGN", (idx, 0), (idx, -1), align))
    t.setStyle(TableStyle(commands))
    return t


def card(title: str, rows: list[tuple[str, str]], styles):
    body = [p(title, styles["h2"])]
    for label, value in rows:
        body.append(p(f"<b>{label}:</b> {value}", styles["body"]))
    box = Table([[body]], colWidths=[174 * mm])
    box.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.7, HAIR),
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return box


class SpecDoc(BaseDocTemplate):
    def __init__(self, filename, styles):
        super().__init__(
            str(filename), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
            topMargin=18 * mm, bottomMargin=18 * mm,
            title="Образец многопозиционной спецификации заказа",
            author="Академический Салон",
            subject="Персональные условия заказа, образец",
        )
        self.styles = styles
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="main")
        self.addPageTemplates(PageTemplate(id="spec", frames=[frame], onPage=self.draw_page))

    def draw_page(self, canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(HAIR)
        canvas.setLineWidth(0.5)
        canvas.line(18 * mm, 13 * mm, 192 * mm, 13 * mm)
        canvas.setFont("Salon", 7.4)
        canvas.setFillColor(SOFT)
        canvas.drawString(18 * mm, 8 * mm, "SPEC-DEMO-2026-0724 · ред. 1 · образец")
        canvas.drawRightString(192 * mm, 8 * mm, f"Страница {doc.page}")
        canvas.restoreState()


def build_story(styles):
    story = []
    story += [
        p("АКАДЕМИЧЕСКИЙ САЛОН · ОБРАЗЕЦ", styles["caps"]),
        p("Спецификация заказа", styles["title"]),
        p("Индивидуальные условия к Публичной оферте ред. 2.0 · многопозиционный заказ", styles["subtitle"]),
        table([
            [p("Документ", styles["small"]), p("Предложение", styles["small"]), p("Действует до", styles["small"]), p("Статус", styles["small"])],
            ["SPEC-DEMO-2026-0724 · ред. 1", "24.07.2026 · 12:00 МСК", "31.07.2026 · 23:59 МСК", p("<b>ОБРАЗЕЦ</b>", styles["small"])],
        ], [55 * mm, 43 * mm, 43 * mm, 33 * mm]),
        Spacer(1, 5 * mm),
        p("Контрольная сумма данных Спецификации (SHA-256)", styles["caps"]),
        p(SPEC_HASH, styles["small"]),
        Spacer(1, 3 * mm),
        p("Стороны и роли", styles["h1"]),
        table([
            ["Роль", "Сведения"],
            ["Исполнитель", "Семёнов Семён Юрьевич · ИНН 212885750445 · НПД"],
            ["Заказчик", "Иванова Мария Петровна (вымышленное лицо), 18+"],
            ["Плательщик", "Заказчик"],
            ["Подтверждённый канал", "Личный кабинет + email m***@example.test"],
        ], [42 * mm, 132 * mm]),
        p("Спецификация определяет только законные консультационные, редакторские и оформительские услуги. Результаты не предназначены для представления как выполненная Исполнителем аттестационная работа Заказчика.", styles["body"]),
        p("Итог заказа", styles["h1"]),
        table([
            ["Позиций", "Цена строк", "Скидка", "Твёрдая цена", "Первый платёж"],
            ["3", rub(3_100_000), rub(200_000), rub(2_900_000), rub(9_000_00)],
        ], [26 * mm, 38 * mm, 34 * mm, 40 * mm, 36 * mm], aligns=["CENTER", "RIGHT", "RIGHT", "RIGHT", "RIGHT"]),
        p("Состав", styles["h1"]),
        table([
            ["ID", "Позиция", "Кол-во", "Результат", "Срок", "Цена"],
            ["LN-001", "Консультация по структуре собственного черновика", "2 часа", "2 онлайн-встречи + краткий план действий", "05.08.2026", rub(600_000)],
            ["LN-002", "Редактура и комментарии к черновику Заказчика", "30 стр.", "DOCX с правками и комментариями", "12.08.2026", rub(1_800_000)],
            ["LN-003", "Оформление собственного текста по методическим требованиям", "1 комплект", "DOCX + PDF, оформление по чек-листу", "15.08.2026", rub(700_000)],
        ], [19 * mm, 51 * mm, 20 * mm, 44 * mm, 21 * mm, 24 * mm], aligns=["LEFT", "LEFT", "CENTER", "LEFT", "CENTER", "RIGHT"], font_size=7.2),
        p("Каждая строка самостоятельна, кроме LN-003: она зависит от получения отредактированного текста LN-002. Разные темы, сроки или требования оформляются отдельными строками, а не одним количеством.", styles["small"]),
        p("Карточки позиций", styles["h1"]),
        card("LN-001 · Консультация по структуре собственного черновика", [
            ("Входит", "две онлайн-встречи по 60 минут; разбор логики и структуры; ответы на вопросы; краткий план следующих действий"),
            ("Не входит", "создание текста или результатов исследования за Заказчика; прохождение проверки/аттестации"),
            ("Входы Заказчика", "черновик и методические требования до 02.08.2026, 18:00 МСК"),
            ("Критерии", "две встречи проведены; письменный план содержит согласованные разделы и рекомендации"),
            ("Срок", "встречи 03.08 и 05.08.2026 по согласованному времени"),
            ("Цена", f"{rub(600_000)}; самостоятельная позиция"),
        ], styles),
        Spacer(1, 3 * mm),
        card("LN-002 · Редактура и комментарии к черновику Заказчика", [
            ("Единица", "1 расчётная страница = 1 800 знаков с пробелами; максимум 54 000 знаков"),
            ("Входит", "корректура, стилистическая редактура, проверка связности, комментарии с объяснением"),
            ("Не входит", "создание содержательной основы, новых данных, выводов исследования или текста вместо Заказчика"),
            ("Результат", "DOCX с режимом исправлений и комментариями; SHA-256 файла фиксируется при передаче"),
            ("Критерии", "обработан согласованный объём; правки видимы; каждый содержательный запрос оформлен комментарием"),
            ("Срок", "12.08.2026, 20:00 МСК при получении входов в срок"),
            ("Цена", f"{rub(1_800_000)}; самостоятельная позиция"),
        ], styles),
        Spacer(1, 3 * mm),
        card("LN-003 · Оформление собственного текста", [
            ("Зависимость", "старт после передачи результата LN-002 и подтверждения актуальной методички"),
            ("Входит", "стили, поля, нумерация, содержание, подписи таблиц/рисунков, список источников по предоставленным данным"),
            ("Не входит", "проверка достоверности источников или создание отсутствующих библиографических данных"),
            ("Результат", "DOCX + PDF и чек-лист применённых требований"),
            ("Критерии", "формальные параметры соответствуют переданной методичке версии от 20.07.2026"),
            ("Срок", "15.08.2026, 20:00 МСК"),
            ("Цена", f"{rub(700_000)}; зависимая от LN-002 позиция"),
        ], styles),
        p("Цена и распределение", styles["h1"]),
        table([
            ["Строка", "Цена до скидки", "Скидка", "Договорная цена", "Бонус", "Деньгами"],
            ["LN-001", rub(600_000), rub(40_000), rub(560_000), "0 руб.", rub(560_000)],
            ["LN-002", rub(1_800_000), rub(120_000), rub(1_680_000), "0 руб.", rub(1_680_000)],
            ["LN-003", rub(700_000), rub(40_000), rub(660_000), "0 руб.", rub(660_000)],
            ["Итого", rub(3_100_000), rub(200_000), rub(2_900_000), "0 руб.", rub(2_900_000)],
        ], [29 * mm, 32 * mm, 26 * mm, 34 * mm, 22 * mm, 31 * mm], aligns=["LEFT", "RIGHT", "RIGHT", "RIGHT", "RIGHT", "RIGHT"], font_size=7.4),
        p("Исполнитель применяет НПД; НДС Заказчику не предъявляется. Чек НПД формируется на каждое денежное поступление с наименованием услуги и суммой.", styles["small"]),
        p("График платежей", styles["h1"]),
        table([
            ["Этап", "Событие", "Распределение", "Сумма", "Остаток"],
            ["P-01", "Акцепт и запуск", "LN-001: 5600 руб.; LN-002: 3400 руб.", rub(900_000), rub(2_000_000)],
            ["P-02", "После LN-001 и передачи фрагмента LN-002", "LN-002: 9400 руб.", rub(940_000), rub(1_060_000)],
            ["P-03", "Передача LN-002 и старт LN-003", "LN-002: 3400 руб.; LN-003: 3600 руб.", rub(700_000), rub(360_000)],
            ["P-04", "Передача LN-003", "LN-003: 3000 руб.; LN-002: 600 руб.", rub(360_000), "0 руб."],
        ], [22 * mm, 55 * mm, 55 * mm, 23 * mm, 24 * mm], aligns=["LEFT", "LEFT", "LEFT", "RIGHT", "RIGHT"], font_size=7.4),
        p("Проценты могут показываться справочно. Юридически значимы рублёвые суммы и их распределение по позициям и результатам.", styles["small"]),
        p("Передача, первичная проверка и недостатки", styles["h1"]),
        p("Результат размещается в деле заказа с датой, версией и SHA-256 файла. В течение 7 календарных дней Заказчик может принять результат либо сообщить конкретные несоответствия. Это организационный срок ускоренной проверки. Его истечение, молчание или начало использования не ограничивают требования по недостаткам и иные обязательные права в сроки, установленные законом.", styles["body"]),
        p("Подтверждённое несоответствие критериям устраняется бесплатно в разумный срок, указанный Заказчиком с учётом характера недостатка. Новое пожелание, меняющее предмет, объём, результат, цену или срок, оформляется отдельной редакцией до выполнения.", styles["body"]),
        p("Частичный отказ и возврат", styles["h1"]),
        p("Заказчик вправе отказаться от всего заказа или независимой позиции. Отказ от LN-002 требует отдельного выбора по LN-003, поскольку зависимость раскрыта заранее. Исполнитель возвращает неоспариваемую сумму в течение 10 календарных дней. Из неё вычитаются только документально подтверждённые необходимые расходы отменённой позиции и согласованная цена фактически предоставленного самостоятельного результата. Предпросмотр и внутренний процент готовности сами по себе не означают оказание или приёмку.", styles["body"]),
        p("Изменения", styles["h1"]),
        table([
            ["Редакция", "Статус", "Правило"],
            ["1", "Предложена", "Действует до указанного срока; после оплаты становится принятой и неизменяемой"],
            ["2+", "Новая", "Таблица «было / стало», причина, влияние на цену/срок и отдельное подтверждение"],
        ], [24 * mm, 32 * mm, 118 * mm]),
        p("Приоритет", styles["h1"]),
        p("Обязательные нормы закона → принятая новая редакция изменения → принятая Спецификация → Оферта указанной версии → Правила лояльности, если применены → переписка только как разъяснение или явно подтверждённое изменение.", styles["body"]),
        p("Акцепт и электронные доказательства", styles["h1"]),
        p("До оплаты Заказчик видит и может скачать этот точный снимок. Кнопка оплаты повторяет номер, редакцию и сумму. Журнал сохраняет ID/редакцию/хэш Спецификации, версии и хэши документов, время, подтверждённый канал, текст действия, идентификатор и сумму платежа. После оплаты предоставляется тот же файл.", styles["body"]),
        HRFlowable(width="100%", thickness=0.6, color=HAIR, spaceBefore=7, spaceAfter=7),
        p("<b>Применимые документы:</b> Оферта 2.0 · Политика ПДн 2.1 · Пользовательское соглашение 1.4 · Правила лояльности 1.7 (если применены).", styles["small"]),
        p("Образец содержит вымышленные данные и показывает структуру. Для реального заказа все сроки, результаты, цены, входные файлы и их хэши заполняются до оплаты.", styles["small"]),
    ]
    return story


def main() -> None:
    register_fonts()
    styles = build_styles()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    doc = SpecDoc(OUT, styles)
    doc.build(build_story(styles))
    shutil.copy2(OUT, PUBLIC)
    print(f"Generated: {OUT}")
    print(f"Published copy: {PUBLIC}")
    print(f"Bytes: {OUT.stat().st_size}")
    print(f"Data SHA-256: {SPEC_HASH}")


if __name__ == "__main__":
    main()
