#!/usr/bin/env python3
"""Generate three filled test specifications for visual and bot delivery tests."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
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

from generate_specification_sample import (
    HAIR,
    INK,
    PAPER,
    SOFT,
    WAX,
    build_styles,
    card,
    p,
    register_fonts,
    rub,
    table,
)


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "output" / "pdf"


VARIANTS = [
    {
        "filename": "specifikaciya-test-01-odna-poziciya.pdf",
        "spec_id": "SPEC-TEST-01-2026",
        "revision": 1,
        "label": "Вариант 1 · одна позиция",
        "customer": "Орлов Алексей Сергеевич (вымышленное лицо), 18+",
        "payer": "Заказчик",
        "channel": "Личный кабинет + a***@example.test",
        "offered": "24.07.2026 · 12:00 МСК",
        "valid_until": "27.07.2026 · 23:59 МСК",
        "discount": 0,
        "gift": 0,
        "deposit": 0,
        "lines": [
            {
                "id": "LN-001",
                "title": "Диагностическая консультация по собственному черновику",
                "qty": "1 комплект",
                "result": "Письменная карта замечаний + онлайн-разбор 90 минут",
                "due": "30.07.2026",
                "price": 850_000,
                "included": "чтение черновика до 35 расчётных страниц; классификация замечаний; онлайн-встреча; краткий план самостоятельной доработки",
                "excluded": "написание или замена содержательных частей; создание данных, выводов и источников; гарантия решения преподавателя",
                "inputs": "черновик DOCX и методические требования до 27.07.2026, 18:00 МСК",
                "criteria": "карта содержит замечания по структуре, логике и оформлению; встреча длится не менее 90 минут; вопросы Заказчика разобраны",
                "dependency": "нет; самостоятельная позиция",
            }
        ],
        "payments": [
            ["P-01", "Акцепт и бронирование времени", "LN-001", 4_000_00],
            ["P-02", "Передача карты замечаний до встречи", "LN-001", 4_500_00],
        ],
        "change_note": "Первая редакция; изменений нет.",
    },
    {
        "filename": "specifikaciya-test-02-tri-pozicii.pdf",
        "spec_id": "SPEC-TEST-02-2026",
        "revision": 1,
        "label": "Вариант 2 · три позиции, скидка и сертификат",
        "customer": "Миронова Елена Викторовна (вымышленное лицо), 18+",
        "payer": "Петров Максим Игоревич (вымышленное лицо), платит за Заказчика",
        "channel": "Личный кабинет Заказчика + подтверждённый email Плательщика",
        "offered": "24.07.2026 · 12:10 МСК",
        "valid_until": "29.07.2026 · 23:59 МСК",
        "discount": 300_000,
        "gift": 1_000_000,
        "deposit": 0,
        "lines": [
            {
                "id": "LN-001",
                "title": "Две консультации по методике и структуре",
                "qty": "2 часа",
                "result": "2 онлайн-встречи + письменный маршрут самостоятельной работы",
                "due": "03.08.2026",
                "price": 600_000,
                "included": "две встречи по 60 минут; разбор цели, структуры и метода; маршрут следующих действий",
                "excluded": "создание текста или исследовательского результата за Заказчика",
                "inputs": "методические требования и список вопросов до 31.07.2026",
                "criteria": "обе встречи проведены; маршрут содержит согласованные этапы и контрольные точки",
                "dependency": "нет; самостоятельная позиция",
            },
            {
                "id": "LN-002",
                "title": "Редактура собственного черновика Заказчика",
                "qty": "40 страниц",
                "result": "DOCX с исправлениями и комментариями",
                "due": "10.08.2026",
                "price": 2_400_000,
                "included": "корректура, стилистическая редактура, проверка связности, объясняющие комментарии",
                "excluded": "создание новых фактов, данных, выводов, содержания разделов или недостающих источников",
                "inputs": "DOCX до 02.08.2026; максимум 72 000 знаков с пробелами",
                "criteria": "обработан согласованный объём; исправления видимы; содержательные вопросы отмечены комментариями",
                "dependency": "нет; самостоятельная позиция",
            },
            {
                "id": "LN-003",
                "title": "Техническое оформление собственного текста",
                "qty": "1 комплект",
                "result": "DOCX + PDF + чек-лист требований",
                "due": "13.08.2026",
                "price": 800_000,
                "included": "поля, стили, нумерация, содержание, подписи таблиц/рисунков, список источников по переданным данным",
                "excluded": "проверка достоверности источников и создание отсутствующей библиографии",
                "inputs": "актуальная методичка и финальный текст",
                "criteria": "формальные параметры соответствуют методичке версии от 20.07.2026",
                "dependency": "зависит от результата LN-002",
            },
        ],
        "payments": [
            ["P-01", "Акцепт; зачёт сертификата 10 000 руб.", "LN-001 + LN-002", 8_000_00],
            ["P-02", "После LN-001 и передачи первой половины LN-002", "LN-002", 9_000_00],
            ["P-03", "Передача LN-002 и запуск LN-003", "LN-002 + LN-003", 8_000_00],
        ],
        "change_note": "Плательщик не получает доступ к содержанию заказа автоматически. Сертификат является зачётом ранее внесённого аванса, а не скидкой.",
    },
    {
        "filename": "specifikaciya-test-03-redakciya-2.pdf",
        "spec_id": "SPEC-TEST-03-2026",
        "revision": 2,
        "label": "Вариант 3 · зависимые позиции и новая редакция",
        "customer": "Соколова Дарья Андреевна (вымышленное лицо), 18+",
        "payer": "Заказчик",
        "channel": "Личный кабинет + подтверждённый Telegram",
        "offered": "24.07.2026 · 12:20 МСК",
        "valid_until": "28.07.2026 · 23:59 МСК",
        "discount": 0,
        "gift": 0,
        "deposit": 500_000,
        "lines": [
            {
                "id": "LN-001",
                "title": "Аудит требований и исходного плана",
                "qty": "1 отчёт",
                "result": "Карта требований и рисков в PDF",
                "due": "29.07.2026",
                "price": 700_000,
                "included": "сопоставление методички, задания и плана; перечень противоречий; вопросы для уточнения",
                "excluded": "выбор темы или создание плана без участия Заказчика",
                "inputs": "методичка, задание и собственный план до 26.07.2026",
                "criteria": "каждое требование связано с источником; противоречия и неизвестные отмечены отдельно",
                "dependency": "нет; самостоятельная позиция",
            },
            {
                "id": "LN-002",
                "title": "Три методические консультации",
                "qty": "3 часа",
                "result": "3 встречи + протокол решений",
                "due": "08.08.2026",
                "price": 900_000,
                "included": "три встречи по 60 минут; разбор решений Заказчика; протокол после каждой встречи",
                "excluded": "выполнение заданий и подготовка ответов для текущей аттестации вместо Заказчика",
                "inputs": "вопросы не позднее чем за 12 часов до встречи",
                "criteria": "три встречи проведены; решения и открытые вопросы зафиксированы",
                "dependency": "стартует после LN-001",
            },
            {
                "id": "LN-003",
                "title": "Редактура 20 страниц собственного текста",
                "qty": "20 страниц",
                "result": "DOCX с исправлениями и редакторской запиской",
                "due": "12.08.2026",
                "price": 1_200_000,
                "included": "стилистическая редактура, корректура, комментарии по логике переходов",
                "excluded": "создание отсутствующих разделов, выводов, расчётов и данных",
                "inputs": "до 36 000 знаков с пробелами после консультации LN-002",
                "criteria": "согласованный объём обработан; изменения видимы; спорные места вынесены в записку",
                "dependency": "зависит от второй встречи LN-002",
            },
            {
                "id": "LN-004",
                "title": "Репетиция выступления по собственному материалу",
                "qty": "2 встречи",
                "result": "2 репетиции + список вопросов для самостоятельной подготовки",
                "due": "18.08.2026",
                "price": 800_000,
                "included": "две репетиции по 60 минут; обратная связь по ясности и времени; вопросы по представленному Заказчиком материалу",
                "excluded": "гарантия оценки; подготовка Заказчика к ответам по материалу, который он не понимает или не создавал",
                "inputs": "слайды и текст выступления Заказчика до 15.08.2026",
                "criteria": "две репетиции проведены; итоговый хронометраж и список вопросов зафиксированы",
                "dependency": "нет; самостоятельная позиция",
            },
        ],
        "payments": [
            ["P-01", "Зачёт депозита 5 000 руб. и запуск LN-001", "LN-001 + LN-002", 5_000_00],
            ["P-02", "После LN-001", "LN-002 + LN-003", 10_000_00],
            ["P-03", "После второй встречи LN-002", "LN-003", 8_000_00],
            ["P-04", "Передача LN-003 и бронирование LN-004", "LN-003 + LN-004", 8_000_00],
        ],
        "change_note": "Ред. 2 заменяет ред. 1: по просьбе Заказчика LN-004 увеличена с одной до двух репетиций; цена строки выросла на 3 000 руб., общий срок перенесён с 16.08 на 18.08. Остальные строки без изменений. Ред. 1 получила статус «заменена» и оплате не подлежит.",
    },
]


def spec_hash(variant: dict) -> str:
    payload = {
        "schema_version": "2.0",
        "spec_id": variant["spec_id"],
        "revision": variant["revision"],
        "offer": "2.0",
        "lines": [
            {
                "line_id": line["id"],
                "title": line["title"],
                "qty": line["qty"],
                "result": line["result"],
                "due": line["due"],
                "price_minor": line["price"],
                "dependency": line["dependency"],
            }
            for line in variant["lines"]
        ],
        "discount_minor": variant["discount"],
        "gift_minor": variant["gift"],
        "deposit_minor": variant["deposit"],
    }
    return hashlib.sha256(
        json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


class VariantDoc(BaseDocTemplate):
    def __init__(self, filename: Path, styles: dict, variant: dict):
        super().__init__(
            str(filename),
            pagesize=A4,
            leftMargin=18 * mm,
            rightMargin=18 * mm,
            topMargin=18 * mm,
            bottomMargin=18 * mm,
            title=f"{variant['label']} - заполненная тестовая спецификация",
            author="Академический Салон",
            subject="Тестовая спецификация заказа с вымышленными данными",
        )
        self.styles = styles
        self.variant = variant
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="main")
        self.addPageTemplates(PageTemplate(id="spec", frames=[frame], onPage=self.draw_page))

    def draw_page(self, canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(HAIR)
        canvas.setLineWidth(0.5)
        canvas.line(18 * mm, 13 * mm, 192 * mm, 13 * mm)
        canvas.setFont("Salon", 7.4)
        canvas.setFillColor(SOFT)
        canvas.drawString(
            18 * mm,
            8 * mm,
            f"{self.variant['spec_id']} · ред. {self.variant['revision']} · ТЕСТ",
        )
        canvas.drawRightString(192 * mm, 8 * mm, f"Страница {doc.page}")
        canvas.restoreState()


def build_story(styles: dict, variant: dict) -> list:
    lines_total = sum(line["price"] for line in variant["lines"])
    contract_price = lines_total - variant["discount"]
    cash_due = contract_price - variant["gift"] - variant["deposit"]
    payments_total = sum(row[3] for row in variant["payments"])
    digest = spec_hash(variant)

    if payments_total != cash_due:
        raise ValueError(
            f"{variant['spec_id']}: сумма денежных этапов {payments_total} не равна {cash_due}"
        )

    story = [
        p("АКАДЕМИЧЕСКИЙ САЛОН · ЗАПОЛНЕННЫЙ ТЕСТ", styles["caps"]),
        p("Спецификация заказа", styles["title"]),
        p(
            f"{variant['label']} · индивидуальные условия к Публичной оферте ред. 2.0",
            styles["subtitle"],
        ),
        table(
            [
                ["Документ", "Предложение", "Действует до", "Статус"],
                [
                    f"{variant['spec_id']} · ред. {variant['revision']}",
                    variant["offered"],
                    variant["valid_until"],
                    p("<b>ТЕСТ</b>", styles["small"]),
                ],
            ],
            [55 * mm, 43 * mm, 43 * mm, 33 * mm],
        ),
        Spacer(1, 4 * mm),
        p("Контрольная сумма данных (SHA-256)", styles["caps"]),
        p(digest, styles["small"]),
        p("Стороны и роли", styles["h1"]),
        table(
            [
                ["Роль", "Сведения"],
                ["Исполнитель", "Семёнов Семён Юрьевич · ИНН 212885750445 · НПД"],
                ["Заказчик", variant["customer"]],
                ["Плательщик", variant["payer"]],
                ["Подтверждённый канал", variant["channel"]],
            ],
            [42 * mm, 132 * mm],
        ),
        p(
            "Все имена и контакты в тестовом документе вымышлены. Документ показывает "
            "законные консультационные, редакторские, оформительские и репетиторские услуги.",
            styles["small"],
        ),
        p("Итог заказа", styles["h1"]),
        table(
            [
                ["Позиций", "Цена строк", "Скидка", "Твёрдая цена", "Зачёты", "Деньгами"],
                [
                    str(len(variant["lines"])),
                    rub(lines_total),
                    rub(variant["discount"]),
                    rub(contract_price),
                    rub(variant["gift"] + variant["deposit"]),
                    rub(cash_due),
                ],
            ],
            [22 * mm, 31 * mm, 27 * mm, 34 * mm, 28 * mm, 32 * mm],
            aligns=["CENTER", "RIGHT", "RIGHT", "RIGHT", "RIGHT", "RIGHT"],
            font_size=7.5,
        ),
        p("Состав", styles["h1"]),
        table(
            [["ID", "Позиция", "Кол-во", "Результат", "Срок", "Цена"]]
            + [
                [
                    line["id"],
                    line["title"],
                    line["qty"],
                    line["result"],
                    line["due"],
                    rub(line["price"]),
                ]
                for line in variant["lines"]
            ],
            [18 * mm, 50 * mm, 19 * mm, 45 * mm, 22 * mm, 25 * mm],
            aligns=["LEFT", "LEFT", "CENTER", "LEFT", "CENTER", "RIGHT"],
            font_size=7.1,
        ),
        p(
            "Каждая строка имеет собственные предмет, результат, срок, критерии и цену. "
            "Зависимость раскрывается прямо в карточке позиции.",
            styles["small"],
        ),
    ]

    for index, line in enumerate(variant["lines"]):
        position_card = card(
                f"{line['id']} · {line['title']}",
                [
                    ("Входит", line["included"]),
                    ("Не входит", line["excluded"]),
                    ("Входы Заказчика", line["inputs"]),
                    ("Результат", line["result"]),
                    ("Критерии", line["criteria"]),
                    ("Срок", line["due"]),
                    ("Цена", rub(line["price"])),
                    ("Зависимость", line["dependency"]),
                ],
                styles,
            )
        if index == 0:
            story.append(KeepTogether([p("Карточки позиций", styles["h1"]), position_card]))
        else:
            story.append(position_card)
        if index != len(variant["lines"]) - 1:
            story.append(Spacer(1, 3 * mm))

    discount_per_line = []
    remaining = variant["discount"]
    for index, line in enumerate(variant["lines"]):
        if index == len(variant["lines"]) - 1:
            allocated = remaining
        elif lines_total:
            allocated = round(variant["discount"] * line["price"] / lines_total / 100) * 100
            remaining -= allocated
        else:
            allocated = 0
        discount_per_line.append(allocated)

    story.extend(
        [
            p("Цена и распределение", styles["h1"]),
            table(
                [["Строка", "Цена до скидки", "Скидка", "Договорная цена"]]
                + [
                    [
                        line["id"],
                        rub(line["price"]),
                        rub(discount_per_line[index]),
                        rub(line["price"] - discount_per_line[index]),
                    ]
                    for index, line in enumerate(variant["lines"])
                ]
                + [["Итого", rub(lines_total), rub(variant["discount"]), rub(contract_price)]],
                [42 * mm, 44 * mm, 42 * mm, 46 * mm],
                aligns=["LEFT", "RIGHT", "RIGHT", "RIGHT"],
                font_size=7.7,
            ),
            p(
                f"Зачёт сертификата: {rub(variant['gift'])}. Зачёт депозита: "
                f"{rub(variant['deposit'])}. К оплате деньгами: <b>{rub(cash_due)}</b>. "
                "Сертификат и депозит являются зачётом аванса, а не скидкой.",
                styles["body"],
            ),
            p("График платежей", styles["h1"]),
            table(
                [["Этап", "Событие", "Распределение", "Деньгами"]]
                + [
                    [stage, event, allocation, rub(amount)]
                    for stage, event, allocation, amount in variant["payments"]
                ]
                + [["Итого", "", "", rub(payments_total)]],
                [22 * mm, 72 * mm, 52 * mm, 28 * mm],
                aligns=["LEFT", "LEFT", "LEFT", "RIGHT"],
                font_size=7.4,
            ),
            p(
                "Юридически значимы рублёвые суммы и распределение по строкам. "
                "Каждый платёж связан с конкретными позициями и результатами.",
                styles["small"],
            ),
            KeepTogether(
                [
                    p("Приёмка, недостатки и новые пожелания", styles["h1"]),
                    p(
                        "Результат передаётся в деле заказа с датой, версией и SHA-256. "
                        "Организационное окно первичной проверки - 7 календарных дней. "
                        "Его истечение и молчание не ограничивают обязательные права Заказчика. "
                        "Подтверждённое несоответствие критериям устраняется бесплатно. Новое "
                        "пожелание, меняющее предмет, объём, результат, цену или срок, оформляется "
                        "новой редакцией до выполнения.",
                        styles["body"],
                    ),
                ]
            ),
            KeepTogether(
                [
                    p("Частичный отказ и возврат", styles["h1"]),
                    p(
                        "Заказчик вправе отказаться от всего заказа или самостоятельной позиции. "
                        "По зависимой строке отдельно выбирается её продолжение или отмена. "
                        "Неоспариваемая сумма возвращается в течение 10 календарных дней за вычетом "
                        "только документально подтверждённых необходимых расходов отменённой позиции "
                        "и согласованной цены фактически предоставленного самостоятельного результата.",
                        styles["body"],
                    ),
                ]
            ),
            KeepTogether(
                [
                    p("Редакция и изменения", styles["h1"]),
                    table(
                        [
                            ["Редакция", "Статус", "Изменение"],
                            [str(variant["revision"]), "Предложена", variant["change_note"]],
                        ],
                        [25 * mm, 31 * mm, 118 * mm],
                        font_size=7.7,
                    ),
                ]
            ),
            KeepTogether(
                [
                    p("Акцепт и доказательства", styles["h1"]),
                    p(
                        "До оплаты Заказчик видит и скачивает этот точный снимок. Кнопка оплаты "
                        "повторяет номер, редакцию и сумму. Журнал сохраняет ID, редакцию и хэш "
                        "Спецификации, версии документов, время, подтверждённый канал, текст действия, "
                        "платёжный ID и сумму. После оплаты выдаётся тот же файл.",
                        styles["body"],
                    ),
                ]
            ),
            HRFlowable(width="100%", thickness=0.6, color=HAIR, spaceBefore=7, spaceAfter=7),
            p(
                "<b>Применимые документы:</b> Оферта 2.0 · Политика ПДн 2.1 · "
                "Пользовательское соглашение 1.4 · Правила лояльности 1.7 (если применены).",
                styles["small"],
            ),
            p(
                "ТЕСТОВЫЙ ДОКУМЕНТ. Не является предложением, счётом или договором. "
                "Все персональные данные и параметры заказа вымышлены.",
                styles["small"],
            ),
        ]
    )
    return story


def main() -> None:
    register_fonts()
    styles = build_styles()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for variant in VARIANTS:
        target = OUT_DIR / variant["filename"]
        doc = VariantDoc(target, styles, variant)
        doc.build(build_story(styles, variant))
        print(f"Generated: {target}")
        print(f"SHA-256: {hashlib.sha256(target.read_bytes()).hexdigest()}")


if __name__ == "__main__":
    main()
